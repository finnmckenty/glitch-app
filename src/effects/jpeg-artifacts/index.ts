import { registerEffect } from '../registry'
import type { EffectParams, CpuProcessContext } from '../types'

async function processJpegArtifacts(
  imageData: ImageData,
  params: EffectParams,
  _ctx: CpuProcessContext
): Promise<ImageData> {
  const codec = (params.codec as string) || 'jpeg'
  const quality = params.quality as number
  const iterations = params.iterations as number
  const downscale = (params.downscale as number) || 1
  const mix = params.mix as number ?? 1

  const { width, height } = imageData
  const mimeType = codec === 'webp' ? 'image/webp' : 'image/jpeg'

  // Create canvas from imageData
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(imageData, 0, 0)

  let currentCanvas = canvas

  // Encoding dimensions (downscale makes blocks chunkier)
  const encW = Math.max(1, Math.round(width / downscale))
  const encH = Math.max(1, Math.round(height / downscale))

  // Re-encode through lossy codec multiple times to accumulate artifacts
  for (let i = 0; i < iterations; i++) {
    // If downscaling, draw to a smaller canvas first
    let encodeCanvas: OffscreenCanvas
    if (downscale > 1) {
      encodeCanvas = new OffscreenCanvas(encW, encH)
      const encCtx = encodeCanvas.getContext('2d')!
      encCtx.drawImage(currentCanvas, 0, 0, encW, encH)
    } else {
      encodeCanvas = currentCanvas
    }

    const blob = await encodeCanvas.convertToBlob({
      type: mimeType,
      quality: quality / 100,
    })
    const bitmap = await createImageBitmap(blob)

    // Draw back to full-size canvas (scales up if downscaled)
    const next = new OffscreenCanvas(width, height)
    const nextCtx = next.getContext('2d')!
    nextCtx.imageSmoothingEnabled = false // keep blocky artifacts crisp on upscale
    nextCtx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    currentCanvas = next
  }

  const finalCtx = currentCanvas.getContext('2d')!
  const result = finalCtx.getImageData(0, 0, width, height)

  // JPEG doesn't support alpha — restore original alpha channel so
  // transparent regions in shapes/text stay transparent after encoding.
  const origData = imageData.data
  const resultData = result.data
  for (let i = 3; i < origData.length; i += 4) {
    resultData[i] = origData[i]
  }

  // Mix: blend between original and crushed
  if (mix < 1) {
    const orig = imageData.data
    const crushed = result.data
    for (let i = 0; i < orig.length; i++) {
      crushed[i] = Math.round(orig[i] + (crushed[i] - orig[i]) * mix)
    }
  }

  return result
}

registerEffect({
  id: 'jpeg-artifacts',
  name: 'JPEG Artifacts',
  category: 'noise-artifacts',
  description: 'Lossy codec degradation via iterative re-encoding (JPEG or WebP)',
  tags: ['jpeg', 'webp', 'compression', 'artifact', 'blocky', 'mosh', 'codec'],
  execution: 'cpu',
  cost: 'heavy',
  paramDefs: [
    { key: 'codec', label: 'Codec', type: 'select', default: 'jpeg', options: [{ value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }], semanticHint: 'Compression codec (JPEG=blocky, WebP=smeared)' },
    { key: 'quality', label: 'Quality', type: 'number', default: 5, min: 1, max: 50, step: 1, semanticHint: 'Codec quality (1=maximum artifacts, 50=mild artifacts)' },
    { key: 'iterations', label: 'Iterations', type: 'number', default: 3, min: 1, max: 20, step: 1, semanticHint: 'How many times to re-encode (more=worse quality, more artifacts)' },
    { key: 'downscale', label: 'Downscale', type: 'number', default: 1, min: 1, max: 8, step: 0.5, semanticHint: 'Shrink before encoding then scale back up (higher=chunkier blocks)' },
    { key: 'mix', label: 'Mix', type: 'number', default: 1, min: 0, max: 1, step: 0.01, semanticHint: 'Blend between original (0) and fully crushed (1)' },
  ],
  cpu: { process: processJpegArtifacts },
})
