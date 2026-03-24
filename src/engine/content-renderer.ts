import type { Frame, TextContent } from '../types/canvas'
import type { SharedContext } from './shared-context'
import { getCachedBitmap } from './bitmap-cache'
import { getFontEntry, isFontLoaded, loadFont } from './font-loader'
import { applyTextStyle, drawTextLine, resetTextStyle, transformText } from './text-render-utils'

/**
 * Rasterizes frame content into WebGL textures.
 */
export class ContentRenderer {
  private ctx: SharedContext
  private cache = new Map<string, { texture: WebGLTexture; hash: string }>()
  private failedFonts = new Set<string>()
  private scratchCanvas: OffscreenCanvas | null = null
  /** Hidden DOM canvas for text rendering (supports font-variation-settings) */
  private textCanvas: HTMLCanvasElement | null = null
  /** OffscreenCanvas used to Y-flip content before WebGL upload */
  private uploadCanvas: OffscreenCanvas | null = null

  constructor(ctx: SharedContext) {
    this.ctx = ctx
  }

  /** Hash suffix for frame fill properties (empty string if no fill) */
  private fillHash(frame: Frame): string {
    if (!frame.fillColor) return ''
    const a = frame.fillOpacity ?? 1
    return `:fill(${frame.fillColor[0]},${frame.fillColor[1]},${frame.fillColor[2]},${a})`
  }

  /** Fill a canvas with the frame's background fill color/opacity */
  private fillBackground(ctx2d: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, w: number, h: number, frame: Frame): void {
    if (!frame.fillColor) return
    const [fr, fg, fb] = frame.fillColor
    const a = frame.fillOpacity ?? 1
    if (a <= 0) return
    ctx2d.fillStyle = `rgba(${Math.round(fr * 255)}, ${Math.round(fg * 255)}, ${Math.round(fb * 255)}, ${a})`
    ctx2d.fillRect(0, 0, w, h)
  }

  /**
   * Get or create a source texture for a frame's content.
   * Returns null if content can't be rasterized yet.
   */
  getTexture(frame: Frame): WebGLTexture | null {
    const fh = this.fillHash(frame)
    switch (frame.content.type) {
      case 'image': {
        const bitmap = getCachedBitmap(frame.id)
        if (!bitmap) return null

        const hash = `image:${frame.id}:${bitmap.width}x${bitmap.height}${fh}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        let tex: WebGLTexture
        if (frame.fillColor) {
          // Composite fill + image via Canvas 2D
          const canvas = this.getScratchCanvas(bitmap.width, bitmap.height)
          const ctx2d = canvas.getContext('2d')!
          ctx2d.clearRect(0, 0, bitmap.width, bitmap.height)
          this.fillBackground(ctx2d, bitmap.width, bitmap.height, frame)
          ctx2d.drawImage(bitmap, 0, 0)
          tex = this.ctx.uploadToTexture(canvas, cached?.texture)
        } else {
          // Direct upload (fast path)
          tex = this.ctx.uploadToTexture(bitmap, cached?.texture)
        }
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'solid-color': {
        // fillColor overrides content color when user picks a fill via the frame panel
        const [r, g, b] = frame.fillColor ?? frame.content.color
        const alpha = frame.fillOpacity ?? 1
        const hash = `solid:${r}:${g}:${b}:${alpha}:${frame.width}x${frame.height}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        // Rasterize solid color via Canvas 2D
        const canvas = this.getScratchCanvas(frame.width, frame.height)
        const ctx2d = canvas.getContext('2d')!
        ctx2d.clearRect(0, 0, frame.width, frame.height)
        ctx2d.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`
        ctx2d.fillRect(0, 0, frame.width, frame.height)

        const tex = this.ctx.uploadToTexture(canvas, cached?.texture)
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'ai-image': {
        // AI images are stored in the bitmap cache once generated
        const bitmap = getCachedBitmap(frame.id)
        if (!bitmap) return null

        const hash = `ai-image:${frame.id}:${bitmap.width}x${bitmap.height}${fh}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        let tex: WebGLTexture
        if (frame.fillColor) {
          const canvas = this.getScratchCanvas(bitmap.width, bitmap.height)
          const ctx2d = canvas.getContext('2d')!
          ctx2d.clearRect(0, 0, bitmap.width, bitmap.height)
          this.fillBackground(ctx2d, bitmap.width, bitmap.height, frame)
          ctx2d.drawImage(bitmap, 0, 0)
          tex = this.ctx.uploadToTexture(canvas, cached?.texture)
        } else {
          tex = this.ctx.uploadToTexture(bitmap, cached?.texture)
        }
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'shape': {
        const { shape, fill, stroke, strokeWidth, aliased } = frame.content
        const scale = aliased || 1
        const rw = Math.max(1, Math.round(frame.width * scale))
        const rh = Math.max(1, Math.round(frame.height * scale))
        // fillOpacity controls the shape's fill alpha (unified with solid-color)
        const fillAlpha = frame.fillOpacity ?? 1
        const hash = `shape:${shape}:${frame.fillColor ?? fill}:${stroke}:${strokeWidth}:${aliased}:${fillAlpha}:${rw}x${rh}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        const canvas = this.getScratchCanvas(rw, rh)
        const ctx2d = canvas.getContext('2d')!
        ctx2d.clearRect(0, 0, rw, rh)

        // fillColor overrides content fill when user picks a fill via the frame panel
        const actualFill = frame.fillColor ?? fill
        const fr = Math.round(actualFill[0] * 255)
        const fg = Math.round(actualFill[1] * 255)
        const fb = Math.round(actualFill[2] * 255)
        ctx2d.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${fillAlpha})`

        const sw = strokeWidth * scale
        if (stroke) {
          const sr = Math.round(stroke[0] * 255)
          const sg = Math.round(stroke[1] * 255)
          const sb = Math.round(stroke[2] * 255)
          ctx2d.strokeStyle = `rgb(${sr}, ${sg}, ${sb})`
          ctx2d.lineWidth = sw
        }

        const w = rw
        const h = rh
        const inset = stroke ? sw / 2 : 0

        ctx2d.beginPath()
        switch (shape) {
          case 'rectangle':
            ctx2d.rect(inset, inset, w - inset * 2, h - inset * 2)
            break
          case 'circle': {
            const rx = (w - inset * 2) / 2
            const ry = (h - inset * 2) / 2
            const cx = w / 2
            const cy = h / 2
            ctx2d.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
            break
          }
          case 'triangle': {
            ctx2d.moveTo(w / 2, inset)
            ctx2d.lineTo(w - inset, h - inset)
            ctx2d.lineTo(inset, h - inset)
            ctx2d.closePath()
            break
          }
        }

        ctx2d.fill()
        if (stroke) ctx2d.stroke()

        // Copy to upload canvas with Y-flip for WebGL's bottom-up convention.
        // Images are pre-flipped via createImageBitmap({ imageOrientation: 'flipY' });
        // shapes need the same treatment.
        const upload = this.getUploadCanvas(rw, rh)
        const uploadCtx = upload.getContext('2d')!
        uploadCtx.clearRect(0, 0, rw, rh)
        uploadCtx.save()
        uploadCtx.translate(0, rh)
        uploadCtx.scale(1, -1)
        uploadCtx.drawImage(canvas, 0, 0)
        uploadCtx.restore()

        const tex = this.ctx.uploadToTexture(upload, cached?.texture, !!aliased)
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'text': {
        try {
          const content = frame.content
          const entry = getFontEntry(content.fontFamily)

          // Trigger font load — return null until loaded (compositor will retry).
          // If font fails to load, proceed with system fallback rather than blocking forever.
          if (entry && !isFontLoaded(content.fontFamily) && !this.failedFonts.has(content.fontFamily)) {
            loadFont(content.fontFamily)
              .then(() => this.invalidate(frame.id))
              .catch(() => {
                console.warn('[ContentRenderer] font load failed, using fallback:', content.fontFamily)
                this.failedFonts.add(content.fontFamily)
                this.invalidate(frame.id)
              })
            return null
          }

          const aliased = content.aliased || 0
          const scale = aliased || 1
          const rw = Math.max(1, Math.round(frame.width * scale))
          const rh = Math.max(1, Math.round(frame.height * scale))
          const hash = `text:${content.text}:${content.fontFamily}:${content.fontSize}:${content.fontWeight}:${content.fontWidth ?? ''}:${content.fontSlant ?? ''}:${content.fontCasual ?? ''}:${content.color}:${content.align}:${content.letterSpacing}:${content.lineHeight}:${content.textTransform}:${content.strikethrough}:${content.underline}:${aliased}:${rw}x${rh}${fh}`
          const cached = this.cache.get(frame.id)
          if (cached && cached.hash === hash) return cached.texture

          // Render text to DOM canvas (HTMLCanvasElement in DOM tree)
          // so that CSS font-variation-settings are properly resolved.
          const domCanvas = this.getTextCanvas(rw, rh)
          const ctx2d = domCanvas.getContext('2d')!
          ctx2d.clearRect(0, 0, rw, rh)
          this.fillBackground(ctx2d, rw, rh, frame)
          this.renderText(ctx2d, content, rw, rh, scale)

          // Copy to OffscreenCanvas for WebGL texture upload, flipping Y.
          // Images are pre-flipped via createImageBitmap({ imageOrientation: 'flipY' });
          // text needs the same treatment for correct orientation in WebGL.
          const upload = this.getUploadCanvas(rw, rh)
          const uploadCtx = upload.getContext('2d')!
          uploadCtx.clearRect(0, 0, rw, rh)
          uploadCtx.save()
          uploadCtx.translate(0, rh)
          uploadCtx.scale(1, -1)
          uploadCtx.drawImage(domCanvas, 0, 0)
          uploadCtx.restore()

          const tex = this.ctx.uploadToTexture(upload, cached?.texture, !!aliased)
          this.cache.set(frame.id, { texture: tex, hash })
          return tex
        } catch (err) {
          console.error('[ContentRenderer] text rendering failed:', err)
          return null
        }
      }

      // Phase 4+: other content types (gradient, pattern)
      default:
        return null
    }
  }

  /**
   * Render text content to a Canvas 2D context with full variable font support.
   */
  private renderText(
    ctx: CanvasRenderingContext2D,
    content: TextContent,
    w: number,
    h: number,
    scale: number
  ): void {
    const fontSize = content.fontSize * scale
    const padding = 4 * scale

    applyTextStyle(ctx, {
      fontId: content.fontFamily,
      fontSize: content.fontSize,
      fontWeight: content.fontWeight,
      fontWidth: content.fontWidth,
      fontSlant: content.fontSlant,
      fontCasual: content.fontCasual,
      color: content.color,
      align: content.align,
      letterSpacing: content.letterSpacing,
      textTransform: content.textTransform,
    }, scale)

    const text = transformText(content.text, content.textTransform)

    // Word wrap
    const maxWidth = w - padding * 2
    const lineH = fontSize * content.lineHeight
    const lines = this.wrapText(ctx, text, maxWidth)

    // Calculate X position based on alignment
    let x: number
    if (content.align === 'center') x = w / 2
    else if (content.align === 'right') x = w - padding
    else x = padding

    // Draw lines
    for (let i = 0; i < lines.length; i++) {
      const y = padding + i * lineH
      if (y + lineH > h + lineH) break

      drawTextLine(ctx, lines[i], x, y, fontSize, content.align, content.strikethrough, content.underline)
    }

    resetTextStyle(ctx)
  }

  /**
   * Word-wrap text to fit within maxWidth.
   * Handles explicit newlines and word-boundary breaking.
   */
  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const result: string[] = []
    const paragraphs = text.split('\n')

    for (const para of paragraphs) {
      if (para === '') {
        result.push('')
        continue
      }
      const words = para.split(/\s+/)
      let line = ''

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && line) {
          result.push(line)
          line = word
        } else {
          line = testLine
        }
      }
      if (line) result.push(line)
    }

    return result.length > 0 ? result : ['']
  }

  /** Hidden DOM canvas for text (supports font-variation-settings via CSS) */
  private getTextCanvas(width: number, height: number): HTMLCanvasElement {
    if (!this.textCanvas) {
      this.textCanvas = document.createElement('canvas')
      // Must be in the DOM tree for CSS font resolution and font-variation-settings
      // to work. Positioned offscreen so it's invisible and doesn't affect layout.
      this.textCanvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;'
      document.body.appendChild(this.textCanvas)
    }
    if (this.textCanvas.width !== width || this.textCanvas.height !== height) {
      this.textCanvas.width = width
      this.textCanvas.height = height
    }
    return this.textCanvas
  }

  /** OffscreenCanvas for Y-flipping content before WebGL upload */
  private getUploadCanvas(width: number, height: number): OffscreenCanvas {
    if (!this.uploadCanvas || this.uploadCanvas.width !== width || this.uploadCanvas.height !== height) {
      this.uploadCanvas = new OffscreenCanvas(width, height)
    }
    return this.uploadCanvas
  }

  private getScratchCanvas(width: number, height: number): OffscreenCanvas {
    if (!this.scratchCanvas || this.scratchCanvas.width !== width || this.scratchCanvas.height !== height) {
      this.scratchCanvas = new OffscreenCanvas(width, height)
    }
    return this.scratchCanvas
  }

  /** Force re-upload of a frame's texture (e.g., when bitmap changes) */
  invalidate(frameId: string): void {
    const cached = this.cache.get(frameId)
    if (cached) {
      cached.hash = '' // force re-upload on next getTexture
    }
  }

  /** Remove cached texture for a deleted frame */
  remove(frameId: string): void {
    const cached = this.cache.get(frameId)
    if (cached) {
      this.ctx.deleteTexture(cached.texture)
      this.cache.delete(frameId)
    }
  }

  dispose(): void {
    for (const { texture } of this.cache.values()) {
      this.ctx.deleteTexture(texture)
    }
    this.cache.clear()
    if (this.textCanvas && this.textCanvas.parentNode) {
      this.textCanvas.parentNode.removeChild(this.textCanvas)
      this.textCanvas = null
    }
  }
}
