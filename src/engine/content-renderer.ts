import type { Frame } from '../types/canvas'
import type { SharedContext } from './shared-context'
import { getCachedBitmap } from './bitmap-cache'

/**
 * Rasterizes frame content into WebGL textures.
 * Handles 'image' and 'solid-color' content types.
 * Phase 4 will add gradient, shape, text, pattern, ai-image.
 */
export class ContentRenderer {
  private ctx: SharedContext
  private cache = new Map<string, { texture: WebGLTexture; hash: string }>()
  private scratchCanvas: OffscreenCanvas | null = null

  constructor(ctx: SharedContext) {
    this.ctx = ctx
  }

  /**
   * Get or create a source texture for a frame's content.
   * Returns null if content can't be rasterized yet.
   */
  getTexture(frame: Frame): WebGLTexture | null {
    switch (frame.content.type) {
      case 'image': {
        const bitmap = getCachedBitmap(frame.id)
        if (!bitmap) return null

        const hash = `image:${frame.id}:${bitmap.width}x${bitmap.height}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        // Upload (reuse existing texture if dimensions match)
        const tex = this.ctx.uploadToTexture(bitmap, cached?.texture)
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'solid-color': {
        const [r, g, b] = frame.content.color
        const hash = `solid:${r}:${g}:${b}:${frame.width}x${frame.height}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        // Rasterize solid color via Canvas 2D
        const canvas = this.getScratchCanvas(frame.width, frame.height)
        const ctx2d = canvas.getContext('2d')!
        ctx2d.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
        ctx2d.fillRect(0, 0, frame.width, frame.height)

        const tex = this.ctx.uploadToTexture(canvas, cached?.texture)
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'ai-image': {
        // AI images are stored in the bitmap cache once generated
        const bitmap = getCachedBitmap(frame.id)
        if (!bitmap) return null

        const hash = `ai-image:${frame.id}:${bitmap.width}x${bitmap.height}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        const tex = this.ctx.uploadToTexture(bitmap, cached?.texture)
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      case 'shape': {
        const { shape, fill, stroke, strokeWidth } = frame.content
        const hash = `shape:${shape}:${fill}:${stroke}:${strokeWidth}:${frame.width}x${frame.height}`
        const cached = this.cache.get(frame.id)
        if (cached && cached.hash === hash) return cached.texture

        const canvas = this.getScratchCanvas(frame.width, frame.height)
        const ctx2d = canvas.getContext('2d')!
        ctx2d.clearRect(0, 0, frame.width, frame.height)

        const fr = Math.round(fill[0] * 255)
        const fg = Math.round(fill[1] * 255)
        const fb = Math.round(fill[2] * 255)
        ctx2d.fillStyle = `rgb(${fr}, ${fg}, ${fb})`

        if (stroke) {
          const sr = Math.round(stroke[0] * 255)
          const sg = Math.round(stroke[1] * 255)
          const sb = Math.round(stroke[2] * 255)
          ctx2d.strokeStyle = `rgb(${sr}, ${sg}, ${sb})`
          ctx2d.lineWidth = strokeWidth
        }

        const w = frame.width
        const h = frame.height
        const inset = stroke ? strokeWidth / 2 : 0

        ctx2d.beginPath()
        switch (shape) {
          case 'rectangle':
            ctx2d.rect(inset, inset, w - inset * 2, h - inset * 2)
            break
          case 'square': {
            const size = Math.min(w, h) - inset * 2
            const ox = (w - size) / 2
            const oy = (h - size) / 2
            ctx2d.rect(ox, oy, size, size)
            break
          }
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

        const tex = this.ctx.uploadToTexture(canvas, cached?.texture)
        this.cache.set(frame.id, { texture: tex, hash })
        return tex
      }

      // Phase 4+: other content types (text, gradient, pattern)
      default:
        return null
    }
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
  }
}
