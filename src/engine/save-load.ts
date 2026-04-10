import type { CanvasDocument } from '../types/canvas'
import { getCachedBitmap, BACKGROUND_BITMAP_KEY } from './bitmap-cache'

// ---- File Format ----

interface GlitchFileFormat {
  magic: 'GLITCH'
  version: 1
  savedAt: string
  document: CanvasDocument
}

// ---- Helpers ----

/** Convert an ImageBitmap to a base64 data URL, flipping Y back to normal orientation */
async function bitmapToDataUrl(bitmap: ImageBitmap): Promise<string> {
  const { width, height } = bitmap
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!

  // Bitmaps in cache are Y-flipped for WebGL — flip back to normal for storage
  ctx.translate(0, height)
  ctx.scale(1, -1)
  ctx.drawImage(bitmap, 0, 0)

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to encode image'))
    reader.readAsDataURL(blob)
  })
}

// ---- Serialize ----

/** Serialize a CanvasDocument to a downloadable .glitch Blob */
export async function serializeDocument(doc: CanvasDocument): Promise<Blob> {
  // Deep clone the document (all fields are JSON-safe except blob URLs)
  const clone: CanvasDocument = JSON.parse(JSON.stringify(doc))

  // Convert frame image blob URLs → base64 data URLs
  for (const frame of clone.frames) {
    if (frame.content.type === 'image') {
      const bitmap = getCachedBitmap(frame.id)
      if (bitmap) {
        frame.content.sourceUrl = await bitmapToDataUrl(bitmap)
      }
    } else if (frame.content.type === 'ai-image' && frame.content.imageUrl) {
      const bitmap = getCachedBitmap(frame.id)
      if (bitmap) {
        frame.content.imageUrl = await bitmapToDataUrl(bitmap)
      }
    }
  }

  // Convert background image blob URL → base64
  if (clone.background.type === 'image') {
    const bitmap = getCachedBitmap(BACKGROUND_BITMAP_KEY)
    if (bitmap) {
      clone.background.sourceUrl = await bitmapToDataUrl(bitmap)
    }
  }

  const file: GlitchFileFormat = {
    magic: 'GLITCH',
    version: 1,
    savedAt: new Date().toISOString(),
    document: clone,
  }

  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

// ---- Deserialize ----

/** Parse a .glitch file and restore bitmaps */
export async function deserializeDocument(file: File): Promise<{
  document: CanvasDocument
  bitmaps: Map<string, ImageBitmap>
}> {
  const text = await file.text()

  let parsed: GlitchFileFormat
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON')
  }

  if (parsed.magic !== 'GLITCH') {
    throw new Error('Not a .glitch document')
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported file version: ${parsed.version}`)
  }

  const doc = parsed.document
  const bitmaps = new Map<string, ImageBitmap>()

  // Restore frame image bitmaps from base64 data URLs
  for (const frame of doc.frames) {
    if (frame.content.type === 'image' && frame.content.sourceUrl?.startsWith('data:')) {
      const bitmap = await dataUrlToBitmap(frame.content.sourceUrl)
      bitmaps.set(frame.id, bitmap)
    } else if (
      frame.content.type === 'ai-image' &&
      frame.content.imageUrl?.startsWith('data:')
    ) {
      const bitmap = await dataUrlToBitmap(frame.content.imageUrl)
      bitmaps.set(frame.id, bitmap)
      frame.content.status = 'done'
    }
  }

  // Restore background image bitmap
  if (doc.background.type === 'image' && doc.background.sourceUrl?.startsWith('data:')) {
    const bitmap = await dataUrlToBitmap(doc.background.sourceUrl)
    bitmaps.set(BACKGROUND_BITMAP_KEY, bitmap)
  }

  return { document: doc, bitmaps }
}

/** Convert a data URL to an ImageBitmap with Y-flip for WebGL */
async function dataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const resp = await fetch(dataUrl)
  const blob = await resp.blob()
  return createImageBitmap(blob, { imageOrientation: 'flipY' })
}
