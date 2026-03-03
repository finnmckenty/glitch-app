import { memo } from 'react'
import type { GridLines } from './snap'
import type { ViewTransform } from './use-view-transform'

interface Props {
  gridLines: GridLines
  viewTransform: ViewTransform
}

export default memo(function GridOverlay({ gridLines, viewTransform }: Props) {
  const { scale, offsetX, offsetY, docWidth, docHeight } = viewTransform
  const screenW = docWidth * scale
  const screenH = docHeight * scale

  if (gridLines.verticals.length === 0 && gridLines.horizontals.length === 0) {
    return null
  }

  return (
    <svg
      style={{
        position: 'absolute',
        left: offsetX,
        top: offsetY,
        width: screenW,
        height: screenH,
        pointerEvents: 'none',
      }}
    >
      {gridLines.verticals.map((x, i) => (
        <line
          key={`v${i}`}
          x1={x * scale}
          y1={0}
          x2={x * scale}
          y2={screenH}
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={1}
        />
      ))}
      {gridLines.horizontals.map((y, i) => (
        <line
          key={`h${i}`}
          x1={0}
          y1={y * scale}
          x2={screenW}
          y2={y * scale}
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={1}
        />
      ))}
    </svg>
  )
})
