import { memo } from 'react'
import type { Frame } from '../../types/canvas'
import type { ViewTransform } from './use-view-transform'
import type { HandlePosition, CornerPosition } from './snap'

const HANDLE_SIZE = 8
const HALF = HANDLE_SIZE / 2

// Rotation hot zone: invisible hit area outside each corner
const ROTATE_ZONE_SIZE = 14
const ROTATE_ZONE_GAP = 2 // gap between corner handle and rotation zone

interface Props {
  frame: Frame
  viewTransform: ViewTransform
  onHandlePointerDown: (handle: HandlePosition, e: React.PointerEvent) => void
  onRotateHandleDown: (corner: CornerPosition, e: React.PointerEvent) => void
}

const HANDLES: { pos: HandlePosition; cursor: string; getXY: (w: number, h: number) => [number, number] }[] = [
  { pos: 'nw', cursor: 'nw-resize', getXY: () => [-HALF, -HALF] },
  { pos: 'n',  cursor: 'n-resize',  getXY: (w) => [w / 2 - HALF, -HALF] },
  { pos: 'ne', cursor: 'ne-resize', getXY: (w) => [w - HALF, -HALF] },
  { pos: 'e',  cursor: 'e-resize',  getXY: (w, h) => [w - HALF, h / 2 - HALF] },
  { pos: 'se', cursor: 'se-resize', getXY: (w, h) => [w - HALF, h - HALF] },
  { pos: 's',  cursor: 's-resize',  getXY: (_, h) => [_ / 2 - HALF, h - HALF] },
  { pos: 'sw', cursor: 'sw-resize', getXY: (_, h) => [-HALF, h - HALF] },
  { pos: 'w',  cursor: 'w-resize',  getXY: (_, h) => [-HALF, h / 2 - HALF] },
]

const ROTATION_CORNERS: {
  corner: CornerPosition
  getXY: (w: number, h: number) => [number, number]
}[] = [
  { corner: 'nw', getXY: () => [-ROTATE_ZONE_SIZE - ROTATE_ZONE_GAP, -ROTATE_ZONE_SIZE - ROTATE_ZONE_GAP] },
  { corner: 'ne', getXY: (w) => [w + ROTATE_ZONE_GAP, -ROTATE_ZONE_SIZE - ROTATE_ZONE_GAP] },
  { corner: 'se', getXY: (w, h) => [w + ROTATE_ZONE_GAP, h + ROTATE_ZONE_GAP] },
  { corner: 'sw', getXY: (_, h) => [-ROTATE_ZONE_SIZE - ROTATE_ZONE_GAP, h + ROTATE_ZONE_GAP] },
]

// SVG rotation cursor (curved arrow)
const ROTATE_CURSOR = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><path d='M10 3a7 7 0 0 1 6.33 4' fill='none' stroke='%23333' stroke-width='1.5' stroke-linecap='round'/><path d='M14.5 3.5L16.33 7L12.5 7.5' fill='none' stroke='%23333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>`
  return `url("data:image/svg+xml,${svg}") 10 10, crosshair`
})()

export default memo(function FrameOverlay({ frame, viewTransform, onHandlePointerDown, onRotateHandleDown }: Props) {
  const { scale, offsetX, offsetY } = viewTransform
  const screenW = frame.width * scale
  const screenH = frame.height * scale
  // Position at the center of the frame, then use transform to rotate around center
  const centerX = (frame.x + frame.width / 2) * scale + offsetX
  const centerY = (frame.y + frame.height / 2) * scale + offsetY
  const rotation = frame.rotation ?? 0

  return (
    <div
      style={{
        position: 'absolute',
        left: centerX - screenW / 2,
        top: centerY - screenH / 2,
        width: screenW,
        height: screenH,
        pointerEvents: 'none',
        transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      {/* Selection border */}
      <div
        style={{
          position: 'absolute',
          inset: -1,
          border: '1px solid #3b82f6',
          pointerEvents: 'none',
        }}
      />

      {/* Resize handles */}
      {HANDLES.map(({ pos, cursor, getXY }) => {
        const [hx, hy] = getXY(screenW, screenH)
        return (
          <div
            key={pos}
            onPointerDown={(e) => {
              e.stopPropagation()
              onHandlePointerDown(pos, e)
            }}
            style={{
              position: 'absolute',
              left: hx,
              top: hy,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              backgroundColor: '#3b82f6',
              border: '1px solid #1d4ed8',
              cursor,
              pointerEvents: 'auto',
            }}
          />
        )
      })}

      {/* Rotation hot zones — invisible hit areas outside each corner */}
      {ROTATION_CORNERS.map(({ corner, getXY }) => {
        const [hx, hy] = getXY(screenW, screenH)
        return (
          <div
            key={`rotate-${corner}`}
            onPointerDown={(e) => {
              e.stopPropagation()
              onRotateHandleDown(corner, e)
            }}
            style={{
              position: 'absolute',
              left: hx,
              top: hy,
              width: ROTATE_ZONE_SIZE,
              height: ROTATE_ZONE_SIZE,
              cursor: ROTATE_CURSOR,
              pointerEvents: 'auto',
            }}
          />
        )
      })}
    </div>
  )
})
