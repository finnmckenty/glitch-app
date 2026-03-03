import type { ViewTransform } from './use-view-transform'
import type { Frame } from '../../types/canvas'

interface Props {
  frame: Frame
  viewTransform: ViewTransform
  /** Points currently being drawn (in normalized frame coords), before committed to store */
  pendingPoints: Array<{ x: number; y: number }>
}

/**
 * SVG overlay showing the polygon mask for the selected frame.
 * Shows both the committed mask (from frame.mask) and in-progress points.
 */
export default function LassoOverlay({ frame, viewTransform, pendingPoints }: Props) {
  const { scale, offsetX, offsetY } = viewTransform

  // Frame screen coords
  const sx = frame.x * scale + offsetX
  const sy = frame.y * scale + offsetY
  const sw = frame.width * scale
  const sh = frame.height * scale

  // Convert normalized frame coords to screen coords
  const toScreen = (pt: { x: number; y: number }) => ({
    x: sx + pt.x * sw,
    y: sy + pt.y * sh,
  })

  const mask = frame.mask
  const committedPoints = mask?.points ?? []
  const displayPoints = pendingPoints.length > 0 ? pendingPoints : committedPoints

  if (displayPoints.length === 0) return null

  const screenPoints = displayPoints.map(toScreen)

  // Build polygon path
  const pathD = screenPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
    + (pendingPoints.length === 0 && committedPoints.length > 2 ? ' Z' : '')

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Polygon path */}
      <path
        d={pathD}
        fill={pendingPoints.length === 0 && committedPoints.length > 2 ? 'rgba(59, 130, 246, 0.1)' : 'none'}
        stroke="#3b82f6"
        strokeWidth={1.5}
        strokeDasharray={pendingPoints.length > 0 ? '4 3' : 'none'}
      />

      {/* Points */}
      {screenPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 ? 5 : 3}
          fill={i === 0 ? '#3b82f6' : '#fff'}
          stroke={i === 0 ? '#fff' : '#3b82f6'}
          strokeWidth={1}
          style={{ pointerEvents: 'none' }}
        />
      ))}
    </svg>
  )
}
