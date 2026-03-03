import { registerEffect } from '../registry'
import type { EffectDefinition, EffectParams, CpuProcessContext } from '../types'

function processDatabend(
  imageData: ImageData,
  params: EffectParams,
  _ctx: CpuProcessContext
): ImageData {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data)
  const amount = params.amount as number
  const mode = params.mode as string
  const seed = params.seed as number
  const chunkSize = params.chunkSize as number

  // Simple RNG
  let rng = seed * 12345.6789
  const rand = () => { rng = (rng * 16807 + 0.5) % 2147483647; return rng / 2147483647 }

  const totalBytes = out.length

  if (mode === 'shift') {
    // Byte shift: shift chunks of data to different positions
    const numChunks = Math.floor(amount * 20)
    for (let i = 0; i < numChunks; i++) {
      const src = Math.floor(rand() * (totalBytes - chunkSize * 4))
      const dst = Math.floor(rand() * (totalBytes - chunkSize * 4))
      const len = Math.floor(rand() * chunkSize * 4)
      for (let j = 0; j < len && src + j < totalBytes && dst + j < totalBytes; j++) {
        out[dst + j] = data[src + j]
      }
    }
  } else if (mode === 'swap') {
    // Byte swap: swap pairs of bytes
    const numSwaps = Math.floor(amount * totalBytes * 0.01)
    for (let i = 0; i < numSwaps; i++) {
      const a = Math.floor(rand() * totalBytes)
      const b = Math.floor(rand() * totalBytes)
      // Don't swap alpha channel (every 4th byte)
      if (a % 4 === 3 || b % 4 === 3) continue
      const tmp = out[a]
      out[a] = out[b]
      out[b] = tmp
    }
  } else if (mode === 'corrupt') {
    // Write random values into chunks
    const numCorruptions = Math.floor(amount * 10)
    for (let i = 0; i < numCorruptions; i++) {
      const start = Math.floor(rand() * totalBytes)
      const len = Math.floor(rand() * chunkSize * 4)
      const val = Math.floor(rand() * 256)
      for (let j = 0; j < len && start + j < totalBytes; j++) {
        if ((start + j) % 4 !== 3) { // preserve alpha
          out[start + j] = val
        }
      }
    }
  } else if (mode === 'repeat') {
    // Repeat a row of data across many rows
    const numRepeats = Math.floor(amount * 5)
    for (let i = 0; i < numRepeats; i++) {
      const srcRow = Math.floor(rand() * height)
      const dstStart = Math.floor(rand() * height)
      const repeatCount = Math.floor(rand() * chunkSize)
      for (let r = 0; r < repeatCount && dstStart + r < height; r++) {
        const srcOff = srcRow * width * 4
        const dstOff = (dstStart + r) * width * 4
        for (let x = 0; x < width * 4; x++) {
          out[dstOff + x] = data[srcOff + x]
        }
      }
    }
  }

  return new ImageData(out, width, height)
}

registerEffect({
  id: 'databend',
  name: 'Databend',
  category: 'distortion',
  description: 'Raw byte-level manipulation of image data',
  tags: ['databend', 'corrupt', 'raw', 'byte', 'glitch'],
  execution: 'cpu',
  cost: 'medium',
  paramDefs: [
    { key: 'mode', label: 'Mode', type: 'select', default: 'shift', options: [
      { value: 'shift', label: 'Byte Shift' },
      { value: 'swap', label: 'Byte Swap' },
      { value: 'corrupt', label: 'Corrupt' },
      { value: 'repeat', label: 'Row Repeat' },
    ], semanticHint: 'Type of data corruption: shift moves chunks, swap exchanges bytes, corrupt overwrites, repeat duplicates rows' },
    { key: 'amount', label: 'Amount', type: 'number', default: 0.3, min: 0, max: 1, step: 0.01, semanticHint: 'Intensity of corruption (0=none, 1=heavy)' },
    { key: 'chunkSize', label: 'Chunk Size', type: 'number', default: 50, min: 1, max: 500, step: 1, semanticHint: 'Size of affected data chunks' },
    { key: 'seed', label: 'Seed', type: 'number', default: 42, min: 0, max: 9999, step: 1, semanticHint: 'Random seed (change for different patterns)' },
  ],
  cpu: { process: processDatabend },
})
