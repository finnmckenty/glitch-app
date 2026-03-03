import { registerEffect } from '../registry'
import type { EffectParams, CpuProcessContext } from '../types'

function processDatamosh(
  imageData: ImageData,
  params: EffectParams,
  _ctx: CpuProcessContext
): ImageData {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data)
  const blockSize = params.blockSize as number
  const displacement = params.displacement as number
  const seed = params.seed as number
  const mode = params.mode as string

  let rng = seed * 54321.987
  const rand = () => { rng = (rng * 16807 + 0.5) % 2147483647; return rng / 2147483647 }

  const blocksX = Math.ceil(width / blockSize)
  const blocksY = Math.ceil(height / blockSize)

  if (mode === 'block-shift') {
    // Shift blocks to wrong positions (simulates P-frame corruption)
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        if (rand() > 0.3) continue // only affect some blocks

        const dx = Math.floor((rand() - 0.5) * 2 * displacement)
        const dy = Math.floor((rand() - 0.5) * 2 * displacement)

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const srcX = bx * blockSize + px
            const srcY = by * blockSize + py
            const dstX = srcX + dx
            const dstY = srcY + dy

            if (srcX >= width || srcY >= height) continue
            if (dstX < 0 || dstX >= width || dstY < 0 || dstY >= height) continue

            const srcIdx = (srcY * width + srcX) * 4
            const dstIdx = (dstY * width + dstX) * 4
            out[dstIdx] = data[srcIdx]
            out[dstIdx + 1] = data[srcIdx + 1]
            out[dstIdx + 2] = data[srcIdx + 2]
            out[dstIdx + 3] = data[srcIdx + 3]
          }
        }
      }
    }
  } else if (mode === 'smear') {
    // Smear blocks downward (simulates I-frame loss)
    for (let bx = 0; bx < blocksX; bx++) {
      if (rand() > 0.4) continue
      const smearRow = Math.floor(rand() * height * 0.7)
      const smearLen = Math.floor(rand() * height * 0.3)
      const bStart = bx * blockSize
      const bEnd = Math.min(bStart + blockSize, width)

      for (let y = smearRow; y < Math.min(smearRow + smearLen, height); y++) {
        for (let x = bStart; x < bEnd; x++) {
          const srcIdx = (smearRow * width + x) * 4
          const dstIdx = (y * width + x) * 4
          out[dstIdx] = data[srcIdx]
          out[dstIdx + 1] = data[srcIdx + 1]
          out[dstIdx + 2] = data[srcIdx + 2]
          out[dstIdx + 3] = data[srcIdx + 3]
        }
      }
    }
  }

  return new ImageData(out, width, height)
}

registerEffect({
  id: 'datamosh',
  name: 'Datamosh',
  category: 'distortion',
  description: 'Simulate video compression artifacts',
  tags: ['datamosh', 'video', 'compression', 'block', 'corrupt'],
  execution: 'cpu',
  cost: 'medium',
  paramDefs: [
    { key: 'mode', label: 'Mode', type: 'select', default: 'block-shift', options: [
      { value: 'block-shift', label: 'Block Shift' },
      { value: 'smear', label: 'Smear' },
    ], semanticHint: 'Block shift moves macroblocks to wrong positions; smear repeats rows downward' },
    { key: 'blockSize', label: 'Block Size', type: 'number', default: 16, min: 4, max: 64, step: 4, semanticHint: 'Size of compression blocks in pixels' },
    { key: 'displacement', label: 'Displacement', type: 'number', default: 30, min: 0, max: 200, step: 1, semanticHint: 'How far blocks shift from original position' },
    { key: 'seed', label: 'Seed', type: 'number', default: 42, min: 0, max: 9999, step: 1, semanticHint: 'Random seed' },
  ],
  cpu: { process: processDatamosh },
})
