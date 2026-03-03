import type { EffectInstance } from '../effects/types'
import { getEffect } from '../effects/registry'
import { createProgram, setUniform } from './shader-compiler'
import type { SharedContext, PingPongBuffers, FBO } from './shared-context'

type Segment =
  | { type: 'gpu'; effects: EffectInstance[] }
  | { type: 'cpu'; effect: EffectInstance }

const PASSTHROUGH_FRAG = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_texCoord);
}`

/**
 * Renders a single frame's effect chain.
 *
 * GPU effects run through ping-pong FBOs (fast, synchronous).
 * CPU effects require readPixels → process → re-upload bridge.
 *
 * The source texture is NEVER modified — all intermediate results
 * go through ping-pong buffers. This eliminates the stale-state
 * re-upload that the old Pipeline needed.
 */
export class FramePipeline {
  private ctx: SharedContext
  private pingPong: PingPongBuffers | null = null
  private ppWidth = 0
  private ppHeight = 0

  // Dedicated FBO for CPU bridge reads — isolated from ping-pong to prevent
  // state corruption between GPU and CPU effect segments.
  private cpuReadFBO: FBO | null = null
  private cpuReadWidth = 0
  private cpuReadHeight = 0

  constructor(ctx: SharedContext) {
    this.ctx = ctx
  }

  /**
   * Synchronous fast path for GPU-only chains.
   * Returns the source texture unchanged if chain is empty or GPU-only.
   */
  renderGpuOnly(
    sourceTexture: WebGLTexture,
    chain: EffectInstance[],
    width: number,
    height: number,
    time: number
  ): WebGLTexture {
    this.ensurePingPong(width, height)
    const gpuEffects = chain.filter((e) => {
      if (!e.enabled) return false
      const def = getEffect(e.effectId)
      return def?.gpu != null
    })
    if (gpuEffects.length === 0) return sourceTexture
    return this.renderGpuChain(sourceTexture, gpuEffects, time, width, height)
  }

  /**
   * Full render for mixed GPU+CPU chains (async).
   * Falls back to GPU-only fast path when possible.
   */
  async renderFrame(
    sourceTexture: WebGLTexture,
    chain: EffectInstance[],
    width: number,
    height: number,
    time: number
  ): Promise<WebGLTexture> {
    this.ensurePingPong(width, height)
    const enabled = chain.filter((e) => e.enabled)
    if (enabled.length === 0) return sourceTexture

    const segments = this.buildSegments(enabled)

    // Fast path: single GPU segment
    if (segments.length === 1 && segments[0].type === 'gpu') {
      return this.renderGpuChain(sourceTexture, segments[0].effects, time, width, height)
    }

    let current = sourceTexture
    for (const seg of segments) {
      if (seg.type === 'gpu') {
        current = this.renderGpuChain(current, seg.effects, time, width, height)
      } else {
        current = await this.renderCpuEffect(current, seg.effect, width, height)
      }
    }
    return current
  }

  /** Check if a chain has CPU effects (used by Compositor to pick sync vs async path) */
  static hasCpuEffects(chain: EffectInstance[]): boolean {
    return chain.some((e) => {
      if (!e.enabled) return false
      const def = getEffect(e.effectId)
      return def?.cpu != null && !def.gpu
    })
  }

  private renderGpuChain(
    sourceTexture: WebGLTexture,
    effects: EffectInstance[],
    time: number,
    width: number,
    height: number
  ): WebGLTexture {
    const { gl } = this.ctx
    const pp = this.pingPong!

    gl.viewport(0, 0, width, height)
    let input = sourceTexture

    // Determine safe starting slot: if sourceTexture IS one of the
    // ping-pong textures (after a CPU effect), we must write to the
    // OTHER slot first to avoid read+write aliasing on the same texture.
    if (sourceTexture === pp.textures[0]) {
      pp.current = 1
    } else if (sourceTexture === pp.textures[1]) {
      pp.current = 0
    } else {
      pp.current = 0
    }

    for (const inst of effects) {
      const def = getEffect(inst.effectId)!
      const gpu = def.gpu!

      const outIdx = pp.current
      gl.bindFramebuffer(gl.FRAMEBUFFER, pp.framebuffers[outIdx])

      const program = createProgram(gl, gpu.fragmentShader)
      gl.useProgram(program)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, input)
      const texLoc = gl.getUniformLocation(program, 'u_texture')
      if (texLoc) gl.uniform1i(texLoc, 0)
      setUniform(gl, program, 'u_resolution', [width, height])
      setUniform(gl, program, 'u_time', time)
      setUniform(gl, program, 'u_opacity', inst.opacity)

      const ctx = { width, height, time, gl, inputTexture: input }
      const uniforms = gpu.getUniforms(inst.params, ctx)
      for (const [name, value] of Object.entries(uniforms)) {
        setUniform(gl, program, name, value)
      }

      this.ctx.drawQuad()

      input = pp.textures[outIdx]
      pp.current = (1 - outIdx) as 0 | 1
    }

    return input
  }

  /**
   * CPU effect bridge — reads texture to CPU, processes, re-uploads.
   *
   * Robustness design:
   * - Uses a DEDICATED read FBO (not a ping-pong slot) so readPixels
   *   never interferes with the ping-pong state.
   * - Saves and restores all GL state touched (framebuffer, viewport,
   *   blend, active texture, UNPACK_FLIP_Y) so external state is preserved.
   * - Uses UNPACK_FLIP_Y_WEBGL for re-upload instead of the fragile
   *   createImageBitmap({ imageOrientation: 'flipY' }) double-flip.
   * - Full try/catch so a failing CPU effect skips gracefully.
   */
  private async renderCpuEffect(
    source: WebGLTexture,
    inst: EffectInstance,
    width: number,
    height: number
  ): Promise<WebGLTexture> {
    const def = getEffect(inst.effectId)
    if (!def?.cpu) {
      console.warn(`[FramePipeline] CPU effect '${inst.effectId}' not found, skipping`)
      return source
    }

    const { gl } = this.ctx
    const pp = this.pingPong!
    this.ensureCpuReadFBO(width, height)
    const readFBO = this.cpuReadFBO!

    // ---- Save GL state ----
    const prevFB = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const prevBlend = gl.isEnabled(gl.BLEND)
    const prevActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number

    try {
      // 1. Blit source to the DEDICATED read FBO (not ping-pong)
      gl.bindFramebuffer(gl.FRAMEBUFFER, readFBO.framebuffer)
      gl.viewport(0, 0, width, height)
      gl.disable(gl.BLEND)
      this.blitTexture(source)

      // 2. Read pixels (includes bottom-up → top-down flip)
      const imageData = this.readPixelsFromCurrentFBO(width, height)

      // 3. Run CPU effect
      const result = await def.cpu.process(imageData, inst.params, { width, height })

      // 4. Upload result to a ping-pong slot via OffscreenCanvas
      //    readPixelsFromCurrentFBO already flipped to top-down (Canvas 2D convention).
      //    CPU effect processed it in top-down. OffscreenCanvas holds top-down data.
      //    UNPACK_FLIP_Y_WEBGL flips during upload → correct bottom-up WebGL texture.
      const canvas = new OffscreenCanvas(width, height)
      const ctx2d = canvas.getContext('2d')!
      ctx2d.putImageData(result, 0, 0)

      const writeIdx = pp.current
      gl.bindTexture(gl.TEXTURE_2D, pp.textures[writeIdx])
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)

      pp.current = (1 - writeIdx) as 0 | 1
      return pp.textures[writeIdx]
    } catch (err) {
      console.warn(`[FramePipeline] CPU effect '${inst.effectId}' failed, skipping:`, err)
      return source
    } finally {
      // ---- Restore GL state ----
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFB)
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3])
      if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND)
      gl.activeTexture(prevActiveTexture)
    }
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

  private readPixelsFromCurrentFBO(width: number, height: number): ImageData {
    const { gl } = this.ctx
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    // WebGL reads bottom-up, flip vertically to top-down (Canvas 2D / ImageData convention)
    const flipped = new Uint8Array(pixels.length)
    const rowSize = width * 4
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * rowSize
      const dstRow = y * rowSize
      flipped.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow)
    }
    return new ImageData(new Uint8ClampedArray(flipped.buffer), width, height)
  }

  private ensurePingPong(width: number, height: number): void {
    if (this.pingPong && this.ppWidth === width && this.ppHeight === height) return
    if (this.pingPong) this.ctx.releasePingPong(this.pingPong)
    this.pingPong = this.ctx.allocatePingPong(width, height)
    this.ppWidth = width
    this.ppHeight = height
  }

  private ensureCpuReadFBO(width: number, height: number): void {
    if (this.cpuReadFBO && this.cpuReadWidth === width && this.cpuReadHeight === height) return
    if (this.cpuReadFBO) this.ctx.releaseFBO(this.cpuReadFBO)
    this.cpuReadFBO = this.ctx.createFBO(width, height)
    this.cpuReadWidth = width
    this.cpuReadHeight = height
  }

  private buildSegments(chain: EffectInstance[]): Segment[] {
    const segments: Segment[] = []
    let gpuBatch: EffectInstance[] = []

    for (const inst of chain) {
      const def = getEffect(inst.effectId)
      if (!def) continue

      if (def.cpu && !def.gpu) {
        if (gpuBatch.length > 0) {
          segments.push({ type: 'gpu', effects: [...gpuBatch] })
          gpuBatch = []
        }
        segments.push({ type: 'cpu', effect: inst })
      } else if (def.gpu) {
        gpuBatch.push(inst)
      }
    }

    if (gpuBatch.length > 0) {
      segments.push({ type: 'gpu', effects: gpuBatch })
    }

    return segments
  }

  dispose(): void {
    if (this.pingPong) {
      this.ctx.releasePingPong(this.pingPong)
      this.pingPong = null
    }
    if (this.cpuReadFBO) {
      this.ctx.releaseFBO(this.cpuReadFBO)
      this.cpuReadFBO = null
    }
  }
}
