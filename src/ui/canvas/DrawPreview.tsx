import { memo } from 'react'
import type { Rect } from './snap'
import type { ViewTransform } from './use-view-transform'

interface Props {
  rect: Rect
  viewTransform: ViewTransform
}

export default memo(function DrawPreview({ rect, viewTransform }: Props) {
  const { scale, offsetX, offsetY } = viewTransform

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x * scale + offsetX,
        top: rect.y * scale + offsetY,
        width: rect.width * scale,
        height: rect.height * scale,
        border: '1px dashed #3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        pointerEvents: 'none',
      }}
    />
  )
})
