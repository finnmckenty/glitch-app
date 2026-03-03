import type { CanvasDocument, Frame, PolygonMask } from '../types/canvas'
import { SharedContext, type FBO } from './shared-context'
import { FramePipeline } from './frame-pipeline'
import { ContentRenderer } from './content-renderer'
import { createProgram, createProgramFull, setUniform } from './shader-compiler'

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}`

const OPACITY_BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = vec4(color.rgb, color.a * u_opacity);
}`

/**
 * Shader-based blend modes. Reads both the source frame texture and the
 * current composition (destination) texture, applies the blend equation,
 * and outputs the result.
 *
 * u_frameRect = normalized (x, y, w, h) of the frame within the composition.
 * Source texture UVs are computed from the frame rect so we sample the right region.
 */
const BLEND_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_src;
uniform sampler2D u_dest;
uniform float u_opacity;
uniform int u_blendMode;
uniform vec4 u_frameRect;
out vec4 fragColor;

vec3 blendMultiply(vec3 s, vec3 d) { return s * d; }
vec3 blendScreen(vec3 s, vec3 d) { return 1.0 - (1.0 - s) * (1.0 - d); }
vec3 blendOverlay(vec3 s, vec3 d) {
  return mix(2.0 * s * d, 1.0 - 2.0 * (1.0 - s) * (1.0 - d), step(0.5, d));
}
vec3 blendAdd(vec3 s, vec3 d) { return min(s + d, 1.0); }
vec3 blendDifference(vec3 s, vec3 d) { return abs(s - d); }

void main() {
  vec4 dest = texture(u_dest, v_texCoord);

  // Check if this pixel is inside the frame rect
  vec2 frameMin = u_frameRect.xy;
  vec2 frameMax = u_frameRect.xy + u_frameRect.zw;

  if (v_texCoord.x < frameMin.x || v_texCoord.x > frameMax.x ||
      v_texCoord.y < frameMin.y || v_texCoord.y > frameMax.y) {
    fragColor = dest;
    return;
  }

  // Map composition UV to source frame UV (0-1 within the frame)
  vec2 srcUV = (v_texCoord - frameMin) / u_frameRect.zw;
  vec4 src = texture(u_src, srcUV);

  float a = src.a * u_opacity;
  vec3 blended;
  if (u_blendMode == 1) blended = blendMultiply(src.rgb, dest.rgb);
  else if (u_blendMode == 2) blended = blendScreen(src.rgb, dest.rgb);
  else if (u_blendMode == 3) blended = blendOverlay(src.rgb, dest.rgb);
  else if (u_blendMode == 4) blended = blendAdd(src.rgb, dest.rgb);
  else if (u_blendMode == 5) blended = blendDifference(src.rgb, dest.rgb);
  else blended = src.rgb; // normal fallback

  fragColor = vec4(mix(dest.rgb, blended, a), max(dest.a, a));
}`

const BLEND_MODE_MAP: Record<string, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  add: 4,
  difference: 5,
}

/**
 * Mask application shader. Multiplies the source alpha by the mask value.
 * u_inverted flips the mask: 0 means opaque inside, 1 means transparent inside.
 */
const MASK_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_mask;
uniform int u_inverted;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  float maskVal = texture(u_mask, v_texCoord).r;
  if (u_inverted == 1) maskVal = 1.0 - maskVal;
  fragColor = vec4(color.rgb, color.a * maskVal);
}`

/**
 * Vertex shader for rotated frame compositing.
 * Transforms the fullscreen quad into a positioned, rotated quad
 * within the composition space.
 */
const ROTATED_VERT = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

uniform vec2 u_compSize;
uniform vec2 u_frameCenter;
uniform vec2 u_frameSize;
uniform float u_rotation;

void main() {
  v_texCoord = a_texCoord;

  // Scale to frame half-size (a_position is -1..1)
  vec2 pos = a_position * u_frameSize * 0.5;

  // Rotate
  float c = cos(u_rotation);
  float s = sin(u_rotation);
  pos = vec2(pos.x * c - pos.y * s, pos.x * s + pos.y * c);

  // Translate to frame center
  pos += u_frameCenter;

  // Map pixel coords to NDC (-1..1)
  gl_Position = vec4(pos / u_compSize * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * Top-level rendering orchestrator.
 *
 * For each visible frame:
 *   1. Content → source texture (via ContentRenderer)
 *   2. Effect chain → output texture (via FramePipeline)
 *   3. Alpha-blend output onto composition FBO at frame position
 *
 * Then applies global effect chain (Phase 6) and blits to screen.
 *
 * Owns the requestAnimationFrame loop.
 */
export class Compositor {
  private ctx: SharedContext
  private pipeline: FramePipeline
  private content: ContentRenderer
  private animFrameId: number | null = null
  private startTime = performance.now()
  private _disposed = false

  // Composition FBO (for multi-frame blending)
  private compFBO: FBO | null = null
  // Destination copy FBO — used for shader-based blend modes
  private destCopyFBO: FBO | null = null

  // Mask textures (per frame, keyed by frame ID)
  private maskCache = new Map<string, { texture: WebGLTexture; hash: string; fbo: FBO }>()
  private maskScratchCanvas: OffscreenCanvas | null = null

  // Current state
  private _document: CanvasDocument | null = null
  private _generation = 0
  private _asyncRendering = false
  private _dirty = false
  private _asyncFailCount = 0
  private static MAX_ASYNC_RETRIES = 3

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = new SharedContext(canvas)
    this.pipeline = new FramePipeline(this.ctx)
    this.content = new ContentRenderer(this.ctx)
  }

  /** Update the document state — triggers re-render on next frame */
  update(doc: CanvasDocument, generation: number): void {
    const chainChanged = this._generation !== generation
    this._document = doc
    this._generation = generation

    if (chainChanged) {
      this._dirty = true
      this._asyncFailCount = 0 // Reset retry counter on document change
      // If any frame has CPU effects, trigger async render
      if (this.hasCpuEffects(doc)) {
        this.scheduleAsyncRender()
      }
    }
  }

  /** Invalidate a frame's source texture (call after bitmap cache changes) */
  invalidateFrame(frameId: string): void {
    this.content.invalidate(frameId)
  }

  /** Clean up resources for a deleted frame */
  removeFrame(frameId: string): void {
    this.content.remove(frameId)
  }

  startLoop(): void {
    if (this.animFrameId !== null) return
    this.animFrameId = requestAnimationFrame(this.renderLoop)
  }

  stopLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  async exportPng(): Promise<Blob> {
    // Ensure latest render is complete
    if (this._document) {
      if (this.hasCpuEffects(this._document)) {
        await this.renderAsync()
      } else {
        this.renderSync()
      }
    }
    return new Promise((resolve, reject) => {
      this.ctx.canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/png'
      )
    })
  }

  // ---- Render loop ----

  private renderLoop = (): void => {
    if (this._disposed) return
    this.animFrameId = requestAnimationFrame(this.renderLoop)

    if (!this._document || this._asyncRendering) return

    if (!this.hasCpuEffects(this._document)) {
      // GPU-only fast path: render synchronously every frame
      this._dirty = false
      this.renderSync()
    } else {
      // Mixed GPU+CPU path: continuously trigger async renders
      // so time-dependent GPU effects still animate
      this.scheduleAsyncRender()
    }
  }

  // ---- Synchronous GPU-only render ----

  private renderSync(): void {
    const doc = this._document
    if (!doc) return

    const time = this.time()
    const frames = doc.frames
      .filter((f) => f.visible)
      .sort((a, b) => a.zIndex - b.zIndex)

    if (frames.length === 0) {
      this.clearScreen(doc)
      return
    }

    // Always use the multi-frame composition path — it correctly
    // handles frame positioning within the document and avoids
    // canvas sizing mismatches with the HTML overlay
    this.renderComposite(doc, frames, time)
  }

  /**
   * Composite all visible frames onto the composition FBO, then blit to screen.
   * Blending is carefully bracketed: OFF during effect chain rendering (ping-pong),
   * ON only for the composite blit step.
   */
  private renderComposite(
    doc: CanvasDocument,
    frames: typeof doc.frames,
    time: number
  ): void {
    const { gl } = this.ctx

    this.ensureCompFBO(doc.width, doc.height)
    this.resizeCanvas(doc.width, doc.height)

    // Clear composition FBO to background color (with alpha)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.compFBO!.framebuffer)
    gl.viewport(0, 0, doc.width, doc.height)
    const [r, g, b] = doc.backgroundColor
    const bgAlpha = doc.backgroundAlpha ?? 1
    gl.clearColor(r * bgAlpha, g * bgAlpha, b * bgAlpha, bgAlpha)
    gl.clear(gl.COLOR_BUFFER_BIT)

    for (const frame of frames) {
      const srcTex = this.content.getTexture(frame)
      if (!srcTex) continue

      // Blending OFF for effect chain — ping-pong FBOs must overwrite, not blend with stale data
      gl.disable(gl.BLEND)
      let outputTex = this.pipeline.renderGpuOnly(
        srcTex, frame.effectChain, frame.width, frame.height, time
      )

      // Apply polygon mask if present
      if (frame.mask && frame.mask.points.length >= 3) {
        outputTex = this.applyMask(gl, frame, outputTex)
      }

      this.compositeFrame(gl, doc, frame, outputTex)
    }

    gl.disable(gl.BLEND)

    // Blit composition to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, doc.width, doc.height)
    this.blitTexture(this.compFBO!.texture)
  }

  // ---- Async render (chains with CPU effects) ----

  private scheduleAsyncRender(): void {
    if (this._asyncRendering) return
    this.renderAsync().catch((err) => {
      console.error('[Compositor] async render failed:', err)
    })
  }

  private async renderAsync(): Promise<void> {
    const doc = this._document
    if (!doc) return

    this._asyncRendering = true
    this._dirty = false // Clear dirty flag — we're rendering current state
    const gen = this._generation
    const { gl } = this.ctx
    const time = this.time()

    try {
      const frames = doc.frames
        .filter((f) => f.visible)
        .sort((a, b) => a.zIndex - b.zIndex)

      if (frames.length === 0) {
        this.clearScreen(doc)
        return
      }

      // Always use composition path for correct frame positioning
      this.ensureCompFBO(doc.width, doc.height)
      this.resizeCanvas(doc.width, doc.height)

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.compFBO!.framebuffer)
      gl.viewport(0, 0, doc.width, doc.height)
      const [r, g, b] = doc.backgroundColor
      const bgAlpha = doc.backgroundAlpha ?? 1
      gl.clearColor(r * bgAlpha, g * bgAlpha, b * bgAlpha, bgAlpha)
      gl.clear(gl.COLOR_BUFFER_BIT)

      for (const frame of frames) {
        const srcTex = this.content.getTexture(frame)
        if (!srcTex) continue

        // Blending OFF for effect chain
        gl.disable(gl.BLEND)
        let outputTex = await this.pipeline.renderFrame(
          srcTex, frame.effectChain, frame.width, frame.height, time
        )

        if (this._generation !== gen) return

        // Apply polygon mask if present
        if (frame.mask && frame.mask.points.length >= 3) {
          outputTex = this.applyMask(gl, frame, outputTex)
        }

        this.compositeFrame(gl, doc, frame, outputTex)
      }

      gl.disable(gl.BLEND)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, doc.width, doc.height)
      this.blitTexture(this.compFBO!.texture)

      // Success — reset failure counter
      this._asyncFailCount = 0
    } catch (err) {
      this._asyncFailCount++
      console.error(`[Compositor] async render error (attempt ${this._asyncFailCount}/${Compositor.MAX_ASYNC_RETRIES}):`, err)
      // Show GPU-only render so the canvas isn't blank
      try { this.renderSync() } catch { /* swallow */ }
      // Mark dirty to retry on next frame (unless we've hit the retry limit)
      if (this._asyncFailCount < Compositor.MAX_ASYNC_RETRIES) {
        this._dirty = true
      } else {
        console.error('[Compositor] max async retries exceeded — CPU effects disabled until next document change')
      }
    } finally {
      this._asyncRendering = false
      // If state changed during this async render, re-evaluate
      if (this._dirty && this._document) {
        if (this.hasCpuEffects(this._document)) {
          this.scheduleAsyncRender()
        }
        // else: _dirty will be picked up by renderLoop on next frame
      }
    }
  }

  // ---- Mask application ----

  /**
   * Apply a polygon mask to a frame's output texture.
   * Rasterizes the polygon to a mask texture, then renders the MASK_FRAG shader
   * into an FBO, returning the masked texture.
   */
  private applyMask(
    gl: WebGL2RenderingContext,
    frame: Frame,
    sourceTex: WebGLTexture
  ): WebGLTexture {
    const mask = frame.mask!
    const maskTex = this.getMaskTexture(frame.id, mask, frame.width, frame.height)

    // Get or create a mask FBO for this frame
    let cached = this.maskCache.get(frame.id)
    if (!cached || cached.fbo.width !== frame.width || cached.fbo.height !== frame.height) {
      if (cached) this.ctx.releaseFBO(cached.fbo)
      const fbo = this.ctx.createFBO(frame.width, frame.height)
      if (!cached) {
        cached = { texture: maskTex, hash: '', fbo }
        this.maskCache.set(frame.id, cached)
      } else {
        cached.fbo = fbo
      }
    }

    // Render mask shader into FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, cached.fbo.framebuffer)
    gl.viewport(0, 0, frame.width, frame.height)
    gl.disable(gl.BLEND)

    const program = createProgram(gl, MASK_FRAG)
    gl.useProgram(program)

    // Source texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    const texLoc = gl.getUniformLocation(program, 'u_texture')
    if (texLoc) gl.uniform1i(texLoc, 0)

    // Mask texture
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    const maskLoc = gl.getUniformLocation(program, 'u_mask')
    if (maskLoc) gl.uniform1i(maskLoc, 1)

    // Inverted
    const invertedLoc = gl.getUniformLocation(program, 'u_inverted')
    if (invertedLoc) gl.uniform1i(invertedLoc, mask.inverted ? 1 : 0)

    this.ctx.drawQuad()

    // Reset active texture
    gl.activeTexture(gl.TEXTURE0)

    return cached.fbo.texture
  }

  /**
   * Rasterize a polygon mask to a texture.
   * White (1.0) inside the polygon, black (0.0) outside.
   */
  private getMaskTexture(
    frameId: string,
    mask: PolygonMask,
    width: number,
    height: number
  ): WebGLTexture {
    // Compute hash for caching
    const pointsHash = mask.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';')
    const hash = `mask:${pointsHash}:${mask.inverted}:${width}x${height}`
    const cached = this.maskCache.get(frameId)
    if (cached && cached.hash === hash) return cached.texture

    // Rasterize via Canvas 2D
    if (!this.maskScratchCanvas || this.maskScratchCanvas.width !== width || this.maskScratchCanvas.height !== height) {
      this.maskScratchCanvas = new OffscreenCanvas(width, height)
    }
    const canvas = this.maskScratchCanvas
    const ctx2d = canvas.getContext('2d')!
    ctx2d.clearRect(0, 0, width, height)

    // Draw white polygon on black background
    ctx2d.fillStyle = '#fff'
    ctx2d.beginPath()
    for (let i = 0; i < mask.points.length; i++) {
      const px = mask.points[i].x * width
      const py = (1 - mask.points[i].y) * height  // Flip Y to match WebGL convention (image bitmaps are pre-flipped)
      if (i === 0) ctx2d.moveTo(px, py)
      else ctx2d.lineTo(px, py)
    }
    ctx2d.closePath()
    ctx2d.fill()

    // Upload to texture
    const tex = this.ctx.uploadToTexture(canvas, cached?.texture)
    if (cached) {
      cached.texture = tex
      cached.hash = hash
    } else {
      const fbo = this.ctx.createFBO(width, height)
      this.maskCache.set(frameId, { texture: tex, hash, fbo })
    }

    return tex
  }

  // ---- Frame compositing ----

  /**
   * Composite a single frame's output texture onto the composition FBO.
   *
   * Normal blend: hardware alpha blending with viewport-based positioning (fast path).
   * Other modes: shader-based blending — copy comp → dest copy, blend shader reads both.
   */
  private compositeFrame(
    gl: WebGL2RenderingContext,
    doc: CanvasDocument,
    frame: Frame,
    outputTex: WebGLTexture
  ): void {
    const blendMode = frame.blendMode || 'normal'
    const rotation = frame.rotation ?? 0

    if (blendMode === 'normal') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.compFBO!.framebuffer)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      if (rotation === 0) {
        // Fast path: viewport-based positioning, no rotation
        gl.viewport(
          frame.x,
          doc.height - frame.y - frame.height,
          frame.width,
          frame.height
        )
        this.blitTextureWithOpacity(outputTex, frame.opacity)
      } else {
        // Rotated path: full composition viewport + custom vertex shader
        gl.viewport(0, 0, doc.width, doc.height)
        this.blitRotated(outputTex, frame, doc, frame.opacity)
      }

      gl.disable(gl.BLEND)
      gl.viewport(0, 0, doc.width, doc.height)
    } else {
      // Shader-based blend: copy current composition, then render blend shader
      // TODO: rotated blend modes would need combining both shaders.
      // For now, non-normal blend modes ignore rotation for the blend rect test
      // but the frame is still composited at the correct position via the blend shader.
      this.ensureDestCopyFBO(doc.width, doc.height)

      // Copy current composition to destCopyFBO
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.compFBO!.framebuffer)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.destCopyFBO!.framebuffer)
      gl.blitFramebuffer(
        0, 0, doc.width, doc.height,
        0, 0, doc.width, doc.height,
        gl.COLOR_BUFFER_BIT, gl.NEAREST
      )

      // Render blend shader to compFBO at full composition size
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.compFBO!.framebuffer)
      gl.viewport(0, 0, doc.width, doc.height)
      gl.disable(gl.BLEND)

      const program = createProgram(gl, BLEND_FRAG)
      gl.useProgram(program)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, outputTex)
      const srcLoc = gl.getUniformLocation(program, 'u_src')
      if (srcLoc) gl.uniform1i(srcLoc, 0)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.destCopyFBO!.texture)
      const destLoc = gl.getUniformLocation(program, 'u_dest')
      if (destLoc) gl.uniform1i(destLoc, 1)

      setUniform(gl, program, 'u_opacity', frame.opacity)

      const blendModeLoc = gl.getUniformLocation(program, 'u_blendMode')
      if (blendModeLoc) gl.uniform1i(blendModeLoc, BLEND_MODE_MAP[blendMode] ?? 0)

      const nx = frame.x / doc.width
      const ny = (doc.height - frame.y - frame.height) / doc.height
      const nw = frame.width / doc.width
      const nh = frame.height / doc.height
      const frameRectLoc = gl.getUniformLocation(program, 'u_frameRect')
      if (frameRectLoc) gl.uniform4f(frameRectLoc, nx, ny, nw, nh)

      this.ctx.drawQuad()
      gl.activeTexture(gl.TEXTURE0)
    }
  }

  /**
   * Blit a texture with rotation applied via a custom vertex shader.
   * Renders a rotated quad at the frame's position within the composition.
   */
  private blitRotated(
    tex: WebGLTexture,
    frame: Frame,
    doc: CanvasDocument,
    opacity: number
  ): void {
    const { gl } = this.ctx
    const program = createProgramFull(gl, ROTATED_VERT, OPACITY_BLIT_FRAG)
    gl.useProgram(program)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const texLoc = gl.getUniformLocation(program, 'u_texture')
    if (texLoc) gl.uniform1i(texLoc, 0)

    setUniform(gl, program, 'u_opacity', opacity)

    // Frame center in GL pixel coords (Y flipped)
    const centerX = frame.x + frame.width / 2
    const centerY = doc.height - (frame.y + frame.height / 2)
    setUniform(gl, program, 'u_compSize', [doc.width, doc.height])
    setUniform(gl, program, 'u_frameCenter', [centerX, centerY])
    setUniform(gl, program, 'u_frameSize', [frame.width, frame.height])

    // Convert degrees to radians (negate for clockwise rotation in GL coords)
    const radians = -(frame.rotation ?? 0) * Math.PI / 180
    setUniform(gl, program, 'u_rotation', radians)

    this.ctx.drawQuad()
  }

  // ---- Helpers ----

  private hasCpuEffects(doc: CanvasDocument): boolean {
    return doc.frames.some(
      (f) => f.visible && FramePipeline.hasCpuEffects(f.effectChain)
    )
  }

  private blitTexture(tex: WebGLTexture): void {
    const { gl } = this.ctx
    const program = createProgram(gl, PASSTHROUGH_FRAG)
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const loc = gl.getUniformLocation(program, 'u_texture')
    if (loc) gl.uniform1i(loc, 0)
    this.ctx.drawQuad()
  }

  private blitTextureWithOpacity(tex: WebGLTexture, opacity: number): void {
    const { gl } = this.ctx
    const program = createProgram(gl, OPACITY_BLIT_FRAG)
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const texLoc = gl.getUniformLocation(program, 'u_texture')
    if (texLoc) gl.uniform1i(texLoc, 0)
    setUniform(gl, program, 'u_opacity', opacity)
    this.ctx.drawQuad()
  }

  private clearScreen(doc: CanvasDocument): void {
    const { gl } = this.ctx
    this.resizeCanvas(doc.width, doc.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, doc.width, doc.height)
    const [r, g, b] = doc.backgroundColor
    const bgAlpha = doc.backgroundAlpha ?? 1
    gl.clearColor(r * bgAlpha, g * bgAlpha, b * bgAlpha, bgAlpha)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private resizeCanvas(width: number, height: number): void {
    const { canvas } = this.ctx
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  private ensureCompFBO(width: number, height: number): void {
    if (this.compFBO && this.compFBO.width === width && this.compFBO.height === height) return
    if (this.compFBO) this.ctx.releaseFBO(this.compFBO)
    this.compFBO = this.ctx.createFBO(width, height)
  }

  private ensureDestCopyFBO(width: number, height: number): void {
    if (this.destCopyFBO && this.destCopyFBO.width === width && this.destCopyFBO.height === height) return
    if (this.destCopyFBO) this.ctx.releaseFBO(this.destCopyFBO)
    this.destCopyFBO = this.ctx.createFBO(width, height)
  }

  private time(): number {
    return (performance.now() - this.startTime) / 1000
  }

  dispose(): void {
    this._disposed = true
    this.stopLoop()
    this.pipeline.dispose()
    this.content.dispose()
    if (this.compFBO) this.ctx.releaseFBO(this.compFBO)
    if (this.destCopyFBO) this.ctx.releaseFBO(this.destCopyFBO)
    for (const cached of this.maskCache.values()) {
      this.ctx.deleteTexture(cached.texture)
      this.ctx.releaseFBO(cached.fbo)
    }
    this.maskCache.clear()
    this.ctx.dispose()
  }
}
