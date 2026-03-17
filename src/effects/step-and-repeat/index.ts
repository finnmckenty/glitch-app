import { registerEffect } from '../registry'
import type { EffectParams, CpuProcessContext } from '../types'
import { FONT_CATALOG, loadFont, getFontEntry } from '../../engine/font-loader'

async function processStepAndRepeat(
  imageData: ImageData,
  params: EffectParams,
  _ctx: CpuProcessContext
): Promise<ImageData> {
  const text = (params.text as string) || 'HELLO WORLD'
  const fontId = params.font as string
  const fontSize = params.fontSize as number
  const color = params.color as number[]
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
  const entry = getFontEntry(fontId)
  const familyName = entry ? entry.googleFamily.replace(/\+/g, ' ') : 'Inter'

  // Calculate max possible drift to allow overflow
  const maxDrift = steps * offsetAmount
  const canvasWidth = width + maxDrift * 2

  // Create wider canvas to allow text overflow past frame edges
  const canvas = new OffscreenCanvas(canvasWidth, height)
  const ctx = canvas.getContext('2d')!
  // Place existing content centered in the wider canvas
  ctx.putImageData(imageData, maxDrift, 0)

  // Text style
  const fillColor = `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`
  ctx.fillStyle = fillColor
  ctx.textBaseline = 'top'

  // Seeded RNG
  let rng = seed * 12345.6789
  const rand = () => {
    rng = (rng * 16807 + 0.5) % 2147483647
    return rng / 2147483647
  }

  const rowHeight = fontSize + spacing
  let currentX = 0

  // Set font once for measurement
  ctx.font = `${fontSize}px "${familyName}"`

  for (let i = 0; i < steps; i++) {
    // Offset decision
    const r1 = rand()
    if (r1 > (1.0 - offsetFreq)) {
      let shift = rand() * offsetAmount
      if (direction === 'left') {
        shift = -shift
      } else if (direction === 'both') {
        shift = (rand() * 2 - 1) * offsetAmount
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

    ctx.save()
    ctx.translate(maxDrift + currentX, y)
    ctx.scale(1, scaleY)
    ctx.font = `${fontSize}px "${familyName}"`
    ctx.fillStyle = fillColor
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  // Crop back to original frame size, extracting from the center of the wider canvas
  return ctx.getImageData(maxDrift, 0, width, height)
}

registerEffect({
  id: 'step-and-repeat',
  name: 'Text Repeat',
  category: 'original',
  description: 'Typographic pattern with accumulated drift and vertical scaling',
  tags: ['text', 'type', 'repeat', 'pattern', 'drift', 'generative'],
  execution: 'cpu',
  cost: 'medium',
  paramDefs: [
    { key: 'text', label: 'Text', type: 'string', default: 'HELLO WORLD',
      placeholder: 'Enter text...', semanticHint: 'Text string to repeat vertically' },
    { key: 'font', label: 'Font', type: 'select', default: 'inter',
      options: FONT_CATALOG.map(f => ({ value: f.id, label: f.name })),
      semanticHint: 'Font family for the text' },
    { key: 'fontSize', label: 'Font Size', type: 'number', default: 48, min: 8, max: 200, step: 1,
      semanticHint: 'Text size in pixels' },
    { key: 'color', label: 'Color', type: 'color', default: [0, 0, 0],
      semanticHint: 'Text color' },
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
  cpu: { process: processStepAndRepeat },
})
