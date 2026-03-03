import { registerEffect } from '../registry'
import type { EffectParams, CpuProcessContext } from '../types'

function brightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function processPixelSort(
  imageData: ImageData,
  params: EffectParams,
  _ctx: CpuProcessContext
): ImageData {
  const { data, width, height } = imageData
  const out = new Uint8ClampedArray(data)
  const threshold = (params.threshold as number) / 255
  const direction = params.direction as string
  const reverse = params.reverse as boolean

  if (direction === 'horizontal' || direction === 'both') {
    for (let y = 0; y < height; y++) {
      let spanStart = -1
      for (let x = 0; x <= width; x++) {
        const idx = (y * width + x) * 4
        const b = x < width ? brightness(data[idx], data[idx + 1], data[idx + 2]) / 255 : -1

        if (b > threshold && spanStart === -1) {
          spanStart = x
        } else if ((b <= threshold || x === width) && spanStart !== -1) {
          // Sort this span
          const pixels: [number, number, number, number, number][] = []
          for (let sx = spanStart; sx < x; sx++) {
            const si = (y * width + sx) * 4
            pixels.push([brightness(data[si], data[si + 1], data[si + 2]), data[si], data[si + 1], data[si + 2], data[si + 3]])
          }
          pixels.sort((a, b) => reverse ? b[0] - a[0] : a[0] - b[0])
          for (let i = 0; i < pixels.length; i++) {
            const si = (y * width + (spanStart + i)) * 4
            out[si] = pixels[i][1]
            out[si + 1] = pixels[i][2]
            out[si + 2] = pixels[i][3]
            out[si + 3] = pixels[i][4]
          }
          spanStart = -1
        }
      }
    }
  }

  if (direction === 'vertical' || direction === 'both') {
    const src = direction === 'both' ? out : data
    for (let x = 0; x < width; x++) {
      let spanStart = -1
      for (let y = 0; y <= height; y++) {
        const idx = (y * width + x) * 4
        const b = y < height ? brightness(src[idx], src[idx + 1], src[idx + 2]) / 255 : -1

        if (b > threshold && spanStart === -1) {
          spanStart = y
        } else if ((b <= threshold || y === height) && spanStart !== -1) {
          const pixels: [number, number, number, number, number][] = []
          for (let sy = spanStart; sy < y; sy++) {
            const si = (sy * width + x) * 4
            pixels.push([brightness(src[si], src[si + 1], src[si + 2]), src[si], src[si + 1], src[si + 2], src[si + 3]])
          }
          pixels.sort((a, b) => reverse ? b[0] - a[0] : a[0] - b[0])
          for (let i = 0; i < pixels.length; i++) {
            const si = ((spanStart + i) * width + x) * 4
            out[si] = pixels[i][1]
            out[si + 1] = pixels[i][2]
            out[si + 2] = pixels[i][3]
            out[si + 3] = pixels[i][4]
          }
          spanStart = -1
        }
      }
    }
  }

  return new ImageData(out, width, height)
}

registerEffect({
  id: 'pixel-sort',
  name: 'Pixel Sort',
  category: 'pixel-manipulation',
  description: 'Sort pixels by brightness along rows/columns',
  tags: ['sort', 'pixel', 'glitch', 'cascade'],
  execution: 'cpu',
  cost: 'heavy',
  paramDefs: [
    { key: 'threshold', label: 'Threshold', type: 'number', default: 80, min: 0, max: 255, step: 1, semanticHint: 'Brightness threshold for starting a sort span (pixels below are not sorted)' },
    { key: 'direction', label: 'Direction', type: 'select', default: 'horizontal', options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' },
      { value: 'both', label: 'Both' },
    ], semanticHint: 'Sort direction: horizontal creates flowing ribbons, vertical creates dripping effects' },
    { key: 'reverse', label: 'Reverse', type: 'boolean', default: false, semanticHint: 'Sort dark-to-light instead of light-to-dark' },
  ],
  cpu: { process: processPixelSort },
})
