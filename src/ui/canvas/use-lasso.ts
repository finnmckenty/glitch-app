import { useState, useCallback, type RefObject } from 'react'
import { useStore } from '../../store'
import type { ViewTransform } from './use-view-transform'
import { screenToDoc } from './use-view-transform'

const CLOSE_THRESHOLD = 12 // screen pixels — distance to first point to close the polygon

interface UseLassoResult {
  pendingPoints: Array<{ x: number; y: number }>
  onLassoClick: (e: React.PointerEvent) => void
  onLassoDoubleClick: (e: React.PointerEvent) => void
  clearLasso: () => void
}

/**
 * Hook for polygon lasso mask tool.
 * Click to place points, double-click or click near start to close.
 * Points are stored as normalized (0-1) coordinates within the selected frame.
 */
export function useLasso(
  viewTransformRef: RefObject<ViewTransform>
): UseLassoResult {
  const [pendingPoints, setPendingPoints] = useState<Array<{ x: number; y: number }>>([])

  const getFrameNormCoords = useCallback(
    (e: React.PointerEvent): { normX: number; normY: number } | null => {
      const vt = viewTransformRef.current
      if (!vt) return null
      const store = useStore.getState()
      const frame = store.document.frames.find((f) => f.id === store.selectedFrameId)
      if (!frame) return null

      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      const doc = screenToDoc(screenX, screenY, vt)

      // Convert document coords to normalized frame coords (0-1)
      const normX = (doc.x - frame.x) / frame.width
      const normY = (doc.y - frame.y) / frame.height
      return { normX, normY }
    },
    [viewTransformRef]
  )

  const isNearStart = useCallback(
    (e: React.PointerEvent): boolean => {
      if (pendingPoints.length < 3) return false
      const vt = viewTransformRef.current
      if (!vt) return false
      const store = useStore.getState()
      const frame = store.document.frames.find((f) => f.id === store.selectedFrameId)
      if (!frame) return false

      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top

      // First point in screen coords
      const firstPt = pendingPoints[0]
      const firstScreenX = frame.x * vt.scale + vt.offsetX + firstPt.x * frame.width * vt.scale
      const firstScreenY = frame.y * vt.scale + vt.offsetY + firstPt.y * frame.height * vt.scale

      const dx = screenX - firstScreenX
      const dy = screenY - firstScreenY
      return Math.sqrt(dx * dx + dy * dy) < CLOSE_THRESHOLD
    },
    [pendingPoints, viewTransformRef]
  )

  const commitMask = useCallback(() => {
    if (pendingPoints.length < 3) {
      setPendingPoints([])
      return
    }
    const store = useStore.getState()
    if (!store.selectedFrameId) return
    store.updateFrame(store.selectedFrameId, {
      mask: {
        points: [...pendingPoints],
        inverted: false,
      },
    } as any)
    store.pushHistory()
    setPendingPoints([])
  }, [pendingPoints])

  const onLassoClick = useCallback(
    (e: React.PointerEvent) => {
      // If clicking near start point and we have 3+ points, close the polygon
      if (isNearStart(e)) {
        commitMask()
        return
      }

      const coords = getFrameNormCoords(e)
      if (!coords) return
      setPendingPoints((prev) => [...prev, { x: coords.normX, y: coords.normY }])
    },
    [getFrameNormCoords, isNearStart, commitMask]
  )

  const onLassoDoubleClick = useCallback(
    (_e: React.PointerEvent) => {
      commitMask()
    },
    [commitMask]
  )

  const clearLasso = useCallback(() => {
    setPendingPoints([])
  }, [])

  return {
    pendingPoints,
    onLassoClick,
    onLassoDoubleClick,
    clearLasso,
  }
}
