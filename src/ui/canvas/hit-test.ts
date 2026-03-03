import type { Frame } from '../../types/canvas'

/**
 * Hit-test frames at the given document coordinates.
 * Tests from highest zIndex to lowest (topmost wins).
 * Skips locked or invisible frames.
 * Returns the frame id or null.
 */
export function hitTestFrames(
  docX: number,
  docY: number,
  frames: Frame[]
): string | null {
  // Sort descending by zIndex (highest first = topmost)
  const sorted = [...frames].sort((a, b) => b.zIndex - a.zIndex)

  for (const frame of sorted) {
    if (!frame.visible || frame.locked) continue
    if (
      docX >= frame.x &&
      docX <= frame.x + frame.width &&
      docY >= frame.y &&
      docY <= frame.y + frame.height
    ) {
      return frame.id
    }
  }
  return null
}
