/**
 * Runtime cache for ImageBitmaps, keyed by frame ID.
 * Lives outside Zustand since ImageBitmap is not serializable.
 */
const cache = new Map<string, ImageBitmap>()

export function cacheBitmap(frameId: string, bitmap: ImageBitmap): void {
  cache.set(frameId, bitmap)
}

export function getCachedBitmap(frameId: string): ImageBitmap | undefined {
  return cache.get(frameId)
}

export function removeCachedBitmap(frameId: string): void {
  const existing = cache.get(frameId)
  if (existing) {
    existing.close()
    cache.delete(frameId)
  }
}

export function clearBitmapCache(): void {
  for (const bitmap of cache.values()) {
    bitmap.close()
  }
  cache.clear()
}
