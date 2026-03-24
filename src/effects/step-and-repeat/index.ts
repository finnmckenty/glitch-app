import { registerEffect } from '../registry'
import type { EffectParams, CpuProcessContext } from '../types'
import { FONT_CATALOG, loadFont } from '../../engine/font-loader'
import {
  applyTextStyle,
  drawTextLine,
  resetTextStyle,
  transformText,
  getTextCanvas,
} from '../../engine/text-render-utils'
import { aliasedScale } from '../../engine/content-renderer'
import Controls from './Controls'

async function processTextRepeat(
  imageData: ImageData,
  params: EffectParams,
  _ctx: CpuProcessContext
): Promise<ImageData> {
  const text = (params.text as string) || 'HELLO WORLD'
  const fontId = params.font as string
  const fontSize = params.fontSize as number
  const fontWeight = (params.fontWeight as number) ?? 400
  const fontWidth = params.fontWidth as number | undefined
  const fontSlant = params.fontSlant as number | undefined
  const fontCasual = params.fontCasual as number | undefined
  const color = params.color as [number, number, number]
  const align = (params.align as 'left' | 'center' | 'right') ?? 'left'
  const letterSpacing = (params.letterSpacing as number) ?? 0
  const textTransform = (params.textTransform as 'none' | 'uppercase' | 'lowercase') ?? 'none'
  const strikethrough = (params.strikethrough as boolean) ?? false
  const underline = (params.underline as boolean) ?? false
  const aliasedValue = (params.aliased as number) || 0
  const steps = params.steps as number
  const spacing = params.spacing as number
  const offsetAmount = params.offsetAmount as number
  const offsetFreq = params.offsetFreq as number
  const direction = params.direction as string
  const scaleAmount = params.scaleAmount as number
  const scaleFreq = params.scaleFreq as number
  const seed = params.seed as number

  const { width, height } = imageData

  // Load font
  await loadFont(fontId)

  // Aliasing: render at reduced scale then scale up with nearest-neighbor
  const scale = aliasedScale(aliasedValue)
  const rw = Math.max(1, Math.round(width * scale))
  const rh = Math.max(1, Math.round(height * scale))
  const rFontSize = fontSize * scale
  const rSpacing = spacing * scale
  const rOffsetAmount = offsetAmount * scale

  // Calculate max possible drift to allow overflow
  const maxDrift = Math.ceil(steps * rOffsetAmount)
  const canvasWidth = rw + maxDrift * 2

  // Use DOM canvas for variable font support
  const canvas = getTextCanvas(canvasWidth, rh)
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvasWidth, rh)

  // Draw existing content centered in the wider canvas
  if (scale === 1) {
    ctx.putImageData(imageData, maxDrift, 0)
  } else {
    // For aliased mode, draw the source image scaled down
    const tempCanvas = new OffscreenCanvas(width, height)
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.putImageData(imageData, 0, 0)
    ctx.drawImage(tempCanvas, maxDrift, 0, rw, rh)
  }

  // Apply text style via shared utility
  applyTextStyle(ctx, {
    fontId,
    fontSize: rFontSize,
    fontWeight,
    fontWidth,
    fontSlant,
    fontCasual,
    color,
    align,
    letterSpacing,
    textTransform,
  })

  const displayText = transformText(text, textTransform)

  // Seeded RNG
  let rng = seed * 12345.6789
  const rand = () => {
    rng = (rng * 16807 + 0.5) % 2147483647
    return rng / 2147483647
  }

  const rowHeight = rFontSize + rSpacing
  let currentX = 0

  for (let i = 0; i < steps; i++) {
    // Offset decision
    const r1 = rand()
    if (r1 > (1.0 - offsetFreq)) {
      let shift = rand() * rOffsetAmount
      if (direction === 'left') {
        shift = -shift
      } else if (direction === 'both') {
        shift = (rand() * 2 - 1) * rOffsetAmount
      }
      currentX += shift
    }

    // Scale decision
    let scaleY = 1.0
    const r2 = rand()
    if (r2 > (1.0 - scaleFreq)) {
      scaleY = 1.0 + rand() * (scaleAmount - 1.0)
    }

    const y = i * rowHeight

    // Calculate x position based on alignment
    let x: number
    if (align === 'center') x = maxDrift + currentX + rw / 2
    else if (align === 'right') x = maxDrift + currentX + rw
    else x = maxDrift + currentX

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, scaleY)
    // Re-apply font after save/restore (scale changes the context)
    applyTextStyle(ctx, {
      fontId,
      fontSize: rFontSize,
      fontWeight,
      fontWidth,
      fontSlant,
      fontCasual,
      color,
      align,
      letterSpacing,
      textTransform,
    })
    drawTextLine(ctx, displayText, 0, 0, rFontSize, align, strikethrough, underline)
    ctx.restore()
  }

  resetTextStyle(ctx)

  if (!aliasedValue) {
    // Crop back to original frame size
    return ctx.getImageData(maxDrift, 0, width, height)
  }

  // Aliased: scale small render back up with nearest-neighbor
  const smallData = ctx.getImageData(maxDrift, 0, rw, rh)
  const smallCanvas = new OffscreenCanvas(rw, rh)
  const smallCtx = smallCanvas.getContext('2d')!
  smallCtx.putImageData(smallData, 0, 0)

  const outCanvas = new OffscreenCanvas(width, height)
  const outCtx = outCanvas.getContext('2d')!
  outCtx.imageSmoothingEnabled = false
  outCtx.drawImage(smallCanvas, 0, 0, width, height)
  return outCtx.getImageData(0, 0, width, height)
}

registerEffect({
  id: 'step-and-repeat',
  name: 'Text Repeat',
  category: 'original',
  description: 'Typographic pattern with accumulated drift and vertical scaling',
  tags: ['text', 'type', 'repeat', 'pattern', 'drift', 'generative'],
  execution: 'cpu',
  cost: 'medium',
  Controls,
  paramDefs: [
    { key: 'text', label: 'Text', type: 'string', default: 'HELLO WORLD',
      placeholder: 'Enter text...', semanticHint: 'Text string to repeat vertically' },
    { key: 'font', label: 'Font', type: 'select', default: 'inter',
      options: FONT_CATALOG.map(f => ({ value: f.id, label: f.name })),
      semanticHint: 'Font family for the text' },
    // Font axis params — UI rendered by custom Controls, not auto-gen
    { key: 'fontWeight', label: 'Weight', type: 'number', default: 400, min: 100, max: 900, step: 1,
      semanticHint: 'Font weight' },
    { key: 'fontWidth', label: 'Width', type: 'number', default: undefined as any, min: 75, max: 125, step: 1,
      semanticHint: 'Font width axis' },
    { key: 'fontSlant', label: 'Slant', type: 'number', default: undefined as any, min: -15, max: 0, step: 1,
      semanticHint: 'Font slant axis' },
    { key: 'fontCasual', label: 'Casual', type: 'number', default: undefined as any, min: 0, max: 1, step: 0.01,
      semanticHint: 'Font casual axis' },
    { key: 'fontSize', label: 'Font Size', type: 'number', default: 48, min: 8, max: 200, step: 1,
      semanticHint: 'Text size in pixels' },
    { key: 'color', label: 'Color', type: 'color', default: [0, 0, 0],
      semanticHint: 'Text color' },
    { key: 'align', label: 'Align', type: 'select', default: 'left', options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ], semanticHint: 'Text alignment' },
    { key: 'letterSpacing', label: 'Letter Spacing', type: 'number', default: 0, min: -0.1, max: 0.5, step: 0.005,
      semanticHint: 'Letter spacing in em units' },
    { key: 'textTransform', label: 'Case', type: 'select', default: 'none', options: [
      { value: 'none', label: 'None' },
      { value: 'uppercase', label: 'UPPERCASE' },
      { value: 'lowercase', label: 'lowercase' },
    ], semanticHint: 'Text case transform' },
    { key: 'strikethrough', label: 'Strikethrough', type: 'boolean', default: false,
      semanticHint: 'Draw line through text' },
    { key: 'underline', label: 'Underline', type: 'boolean', default: false,
      semanticHint: 'Draw line under text' },
    { key: 'aliased', label: 'Aliasing', type: 'number', default: 0, min: 0, max: 1, step: 0.01,
      semanticHint: 'Pixelated rendering intensity (0=off, 1=max)' },
    { key: 'steps', label: 'Steps', type: 'number', default: 20, min: 1, max: 100, step: 1,
      semanticHint: 'Number of repeated copies' },
    { key: 'spacing', label: 'Spacing', type: 'number', default: 0, min: -50, max: 100, step: 1,
      semanticHint: 'Vertical distance between copies in pixels' },
    { key: 'offsetAmount', label: 'Offset Amount', type: 'number', default: 30, min: 0, max: 200, step: 1,
      semanticHint: 'Maximum horizontal shift per step in pixels' },
    { key: 'offsetFreq', label: 'Offset Frequency', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01,
      semanticHint: 'How often horizontal shifts occur (0=never, 1=always)' },
    { key: 'direction', label: 'Direction', type: 'select', default: 'right', options: [
      { value: 'right', label: 'Right' },
      { value: 'left', label: 'Left' },
      { value: 'both', label: 'Both' },
    ], semanticHint: 'Direction of horizontal offset drift' },
    { key: 'scaleAmount', label: 'Scale Amount', type: 'number', default: 2.0, min: 1, max: 20, step: 0.1,
      semanticHint: 'Maximum vertical stretch multiplier' },
    { key: 'scaleFreq', label: 'Scale Frequency', type: 'number', default: 0.2, min: 0, max: 1, step: 0.01,
      semanticHint: 'How often vertical scaling occurs (0=never, 1=always)' },
    { key: 'seed', label: 'Seed', type: 'number', default: 42, min: 0, max: 9999, step: 1,
      randomize: true, semanticHint: 'Random seed for pattern generation' },
  ],
  cpu: { process: processTextRepeat },
})
