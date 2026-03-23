/**
 * Shared text rendering utilities.
 * Used by both ContentRenderer (text frames) and CPU effects (Text Repeat).
 */

import { getFontEntry } from './font-loader'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TextStyleOptions {
  fontId: string
  fontSize: number
  fontWeight: number
  fontWidth?: number
  fontSlant?: number
  fontCasual?: number
  color: [number, number, number] // RGB 0-1
  align: 'left' | 'center' | 'right'
  letterSpacing: number // em units
  textTransform: 'none' | 'uppercase' | 'lowercase'
}

// ---------------------------------------------------------------------------
// Font variation settings
// ---------------------------------------------------------------------------

/**
 * Build CSS font-variation-settings string for a font + axis values.
 * Returns empty string if no variations apply.
 */
export function buildVariationSettings(
  fontId: string,
  opts: Pick<TextStyleOptions, 'fontWidth' | 'fontSlant' | 'fontCasual'>
): string {
  const entry = getFontEntry(fontId)
  if (!entry) return ''

  const parts: string[] = []
  for (const axis of entry.axes) {
    if (axis.tag === 'wght') continue // weight is set via ctx.font
    let value: number | undefined
    if (axis.tag === 'wdth' || axis.tag === 'BLED') value = opts.fontWidth
    else if (axis.tag === 'slnt' || axis.tag === 'SCAN') value = opts.fontSlant
    else if (axis.tag === 'CASL') value = opts.fontCasual
    else if (axis.tag === 'MONO') value = opts.fontCasual != null ? (opts.fontCasual > 0.5 ? 1 : 0) : undefined
    if (value != null) parts.push(`"${axis.tag}" ${value}`)
  }
  return parts.join(', ')
}

/**
 * Resolve a font catalog ID to its CSS family name.
 */
export function resolveFontFamily(fontId: string): string {
  const entry = getFontEntry(fontId)
  return entry ? entry.googleFamily.replace(/\+/g, ' ') : fontId
}

// ---------------------------------------------------------------------------
// Canvas text style
// ---------------------------------------------------------------------------

/**
 * Apply text style to a CanvasRenderingContext2D.
 * The canvas element must be an HTMLCanvasElement in the DOM for
 * font-variation-settings to work via CSS.
 *
 * Returns the resolved family name for callers that need it.
 */
export function applyTextStyle(
  ctx: CanvasRenderingContext2D,
  opts: TextStyleOptions,
  scale: number = 1
): string {
  const familyName = resolveFontFamily(opts.fontId)
  const fontSize = opts.fontSize * scale

  // Variation settings — applied via CSS on the canvas element
  const variations = buildVariationSettings(opts.fontId, opts)
  const canvasEl = ctx.canvas as HTMLCanvasElement
  if (canvasEl.style) {
    canvasEl.style.fontVariationSettings = variations || ''
  }

  ctx.font = `${opts.fontWeight} ${fontSize}px "${familyName}"`
  ctx.textBaseline = 'top'
  ctx.textAlign = opts.align

  // Letter spacing
  const spacing = opts.letterSpacing * fontSize
  if ('letterSpacing' in ctx) {
    ;(ctx as any).letterSpacing = `${spacing}px`
  }

  // Color
  const [cr, cg, cb] = opts.color
  ctx.fillStyle = `rgb(${Math.round(cr * 255)}, ${Math.round(cg * 255)}, ${Math.round(cb * 255)})`

  return familyName
}

/**
 * Apply text transform (uppercase / lowercase).
 */
export function transformText(text: string, transform: 'none' | 'uppercase' | 'lowercase'): string {
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  return text
}

/**
 * Draw a single line of text with optional strikethrough / underline.
 */
export function drawTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  align: 'left' | 'center' | 'right',
  strikethrough: boolean,
  underline: boolean
): void {
  ctx.fillText(text, x, y)

  if (strikethrough || underline) {
    const metrics = ctx.measureText(text)
    const lw = Math.max(1, fontSize * 0.06)
    const decoX =
      align === 'center' ? x - metrics.width / 2
      : align === 'right' ? x - metrics.width
      : x

    if (strikethrough) {
      ctx.fillRect(decoX, y + fontSize * 0.55, metrics.width, lw)
    }
    if (underline) {
      ctx.fillRect(decoX, y + fontSize * 0.95, metrics.width, lw)
    }
  }
}

/**
 * Reset transient canvas text state (letter spacing).
 */
export function resetTextStyle(ctx: CanvasRenderingContext2D): void {
  if ('letterSpacing' in ctx) {
    ;(ctx as any).letterSpacing = '0px'
  }
}

// ---------------------------------------------------------------------------
// Shared hidden DOM canvas for CPU effects needing variable font support
// ---------------------------------------------------------------------------

let _sharedTextCanvas: HTMLCanvasElement | null = null

/**
 * Get or create a hidden DOM HTMLCanvasElement for text rendering.
 * Required because OffscreenCanvas doesn't support CSS font-variation-settings.
 * Safe to call from CPU effects since they run on the main thread.
 */
export function getTextCanvas(width: number, height: number): HTMLCanvasElement {
  if (!_sharedTextCanvas) {
    _sharedTextCanvas = document.createElement('canvas')
    _sharedTextCanvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;'
    document.body.appendChild(_sharedTextCanvas)
  }
  if (_sharedTextCanvas.width !== width || _sharedTextCanvas.height !== height) {
    _sharedTextCanvas.width = width
    _sharedTextCanvas.height = height
  }
  return _sharedTextCanvas
}
