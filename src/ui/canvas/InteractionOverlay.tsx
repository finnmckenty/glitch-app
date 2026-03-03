import { useMemo, useCallback, type RefObject } from 'react'
import { useStore } from '../../store'
import type { ViewTransform } from './use-view-transform'
import { usePointerInteraction } from './use-pointer-interaction'
import { useLasso } from './use-lasso'
import { computeGridLines } from './snap'
import FrameOverlay from './FrameOverlay'
import DrawPreview from './DrawPreview'
import GridOverlay from './GridOverlay'
import LassoOverlay from './LassoOverlay'

interface Props {
  viewTransform: ViewTransform
  viewTransformRef: RefObject<ViewTransform>
}

export default function InteractionOverlay({ viewTransform, viewTransformRef }: Props) {
  const canvasMode = useStore((s) => s.canvasMode)
  const grid = useStore((s) => s.document.grid)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const selectedFrame = useStore((s) =>
    s.selectedFrameId
      ? s.document.frames.find((f) => f.id === s.selectedFrameId) ?? null
      : null
  )

  const gridLines = useMemo(
    () => computeGridLines(grid, viewTransform.docWidth, viewTransform.docHeight),
    [grid, viewTransform.docWidth, viewTransform.docHeight]
  )

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    drawPreviewRect,
    cursor,
    onResizeHandleDown,
    onRotateHandleDown,
  } = usePointerInteraction({
    viewTransformRef,
    canvasMode,
    gridLines,
    snapEnabled: grid.snapEnabled,
  })

  const {
    pendingPoints,
    onLassoClick,
    onLassoDoubleClick,
    clearLasso,
  } = useLasso(viewTransformRef)

  // Wrap pointer down to handle lasso mode
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (canvasMode === 'lasso') {
        onLassoClick(e)
        return
      }
      onPointerDown(e)
    },
    [canvasMode, onLassoClick, onPointerDown]
  )

  // Handle double click for lasso close
  const handleDoubleClick = useCallback(
    (e: React.PointerEvent) => {
      if (canvasMode === 'lasso') {
        onLassoDoubleClick(e)
      }
    },
    [canvasMode, onLassoDoubleClick]
  )

  const effectiveCursor = canvasMode === 'lasso' ? 'crosshair' : cursor

  return (
    <div
      data-interaction-overlay
      style={{
        position: 'absolute',
        inset: 0,
        cursor: effectiveCursor,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={canvasMode === 'lasso' ? undefined : onPointerMove}
      onPointerUp={canvasMode === 'lasso' ? undefined : onPointerUp}
      onDoubleClick={handleDoubleClick as any}
    >
      {/* Grid overlay */}
      {grid.visible && grid.type !== 'none' && (
        <GridOverlay gridLines={gridLines} viewTransform={viewTransform} />
      )}

      {/* Selected frame overlay */}
      {selectedFrame && canvasMode !== 'lasso' && (
        <FrameOverlay
          frame={selectedFrame}
          viewTransform={viewTransform}
          onHandlePointerDown={onResizeHandleDown}
          onRotateHandleDown={onRotateHandleDown}
        />
      )}

      {/* Draw preview */}
      {drawPreviewRect && (
        <DrawPreview rect={drawPreviewRect} viewTransform={viewTransform} />
      )}

      {/* Lasso overlay — show when in lasso mode or when frame has mask */}
      {selectedFrame && canvasMode === 'lasso' && (
        <LassoOverlay
          frame={selectedFrame}
          viewTransform={viewTransform}
          pendingPoints={pendingPoints}
        />
      )}

      {/* Show committed mask outline even in non-lasso mode */}
      {selectedFrame && canvasMode !== 'lasso' && selectedFrame.mask && selectedFrame.mask.points.length > 2 && (
        <LassoOverlay
          frame={selectedFrame}
          viewTransform={viewTransform}
          pendingPoints={[]}
        />
      )}
    </div>
  )
}
