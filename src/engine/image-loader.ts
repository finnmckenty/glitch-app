export interface ImageLoadResult {
  bitmap: ImageBitmap
  meta: { width: number; height: number; name: string }
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function loadImageFromFile(file: File): Promise<ImageLoadResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file')
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('File too large (max 50MB)')
  }

  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'flipY',
  })

  return {
    bitmap,
    meta: { width: bitmap.width, height: bitmap.height, name: file.name },
  }
}

export async function loadImageFromUrl(url: string): Promise<ImageLoadResult> {
  const resp = await fetch(url)
  const blob = await resp.blob()
  const bitmap = await createImageBitmap(blob)
  const name = url.split('/').pop() || 'image'
  return {
    bitmap,
    meta: { width: bitmap.width, height: bitmap.height, name },
  }
}

export function getImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}
