import { useRef, useState, useCallback, type RefObject } from 'react'
import { useStore } from '../../store'
import type { ViewTransform } from './use-view-transform'
import { screenToDoc } from './use-view-transform'
import { hitTestFrames } from './hit-test'
import {
  snapPosition,
  snapResize,
  normalizeRect,
  type GridLines,
  type Rect,
  type HandlePosition,
  type CornerPosition,
} from './snap'

// ---- State machine types ----

type InteractionState =
  | { type: 'idle' }
  | {
      type: 'pending-move'
      frameId: string
      startDocX: number
      startDocY: number
      origX: number
      origY: number
    }
  | {
      type: 'moving'
      frameId: string
      startDocX: number
      startDocY: number
      origX: number
      origY: number
    }
  | {
      type: 'resizing'
      frameId: string
      handle: HandlePosition
      startDocX: number
      startDocY: number
      origRect: Rect
    }
  | {
      type: 'rotating'
      frameId: string
      centerX: number     // frame center in document coords
      centerY: number
      startAngle: number  // atan2 from center to initial pointer (radians)
      origRotation: number // frame.rotation at drag start (degrees)
    }
  | {
      type: 'drawing'
      startDocX: number
      startDocY: number
    }

const MOVE_DEAD_ZONE = 3 // document pixels
const MIN_FRAME_SIZE = 10 // document pixels

// ---- Hook ----

interface Args {
  viewTransformRef: RefObject<ViewTransform>
  canvasMode: 'select' | 'draw' | 'shape' | 'lasso' | 'text'
  gridLines: GridLines
  snapEnabled: boolean
}

interface Result {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  drawPreviewRect: Rect | null
  cursor: string
  /** Called from FrameOverlay resize handle pointerdown */
  onResizeHandleDown: (handle: HandlePosition, e: React.PointerEvent) => void
  /** Called from FrameOverlay rotation handle pointerdown */
  onRotateHandleDown: (corner: CornerPosition, e: React.PointerEvent) => void
}

export function usePointerInteraction({
  viewTransformRef,
  canvasMode,
  gridLines,
  snapEnabled,
}: Args): Result {
  const stateRef = useRef<InteractionState>({ type: 'idle' })
  const [drawPreviewRect, setDrawPreviewRect] = useState<Rect | null>(null)
  const [cursor, setCursor] = useState('default')

  const getDocCoords = useCallback(
    (e: React.PointerEvent) => {
      const vt = viewTransformRef.current
      if (!vt) return { x: 0, y: 0 }
      const containerRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      return screenToDoc(screenX, screenY, vt)
    },
    [viewTransformRef]
  )

  const shouldSnap = useCallback(
    (e: { altKey: boolean }) => snapEnabled && !e.altKey,
    [snapEnabled]
  )

  // ---- Resize handle entry point ----

  const onResizeHandleDown = useCallback(
    (handle: HandlePosition, e: React.PointerEvent) => {
      const store = useStore.getState()
      const frameId = store.selectedFrameId
      if (!frameId) return

      const frame = store.document.frames.find((f) => f.id === frameId)
      if (!frame) return

      const vt = viewTransformRef.current
      if (!vt) return
      const overlay = e.currentTarget.closest('[data-interaction-overlay]') as HTMLElement
      if (!overlay) return

      const containerRect = overlay.getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      const doc = screenToDoc(screenX, screenY, vt)

      stateRef.current = {
        type: 'resizing',
        frameId,
        handle,
        startDocX: doc.x,
        startDocY: doc.y,
        origRect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      }

      setCursor(getCursorForHandle(handle))
      overlay.setPointerCapture(e.pointerId)
    },
    [viewTransformRef]
  )

  // ---- Rotation handle entry point ----

  const onRotateHandleDown = useCallback(
    (_corner: CornerPosition, e: React.PointerEvent) => {
      const store = useStore.getState()
      const frameId = store.selectedFrameId
      if (!frameId) return

      const frame = store.document.frames.find((f) => f.id === frameId)
      if (!frame) return

      const vt = viewTransformRef.current
      if (!vt) return
      const overlay = e.currentTarget.closest('[data-interaction-overlay]') as HTMLElement
      if (!overlay) return

      const containerRect = overlay.getBoundingClientRect()
      const screenX = e.clientX - containerRect.left
      const screenY = e.clientY - containerRect.top
      const doc = screenToDoc(screenX, screenY, vt)

      // Frame center in document coords
      const centerX = frame.x + frame.width / 2
      const centerY = frame.y + frame.height / 2

      // Starting angle from center to pointer position
      const startAngle = Math.atan2(doc.y - centerY, doc.x - centerX)

      stateRef.current = {
        type: 'rotating',
        frameId,
        centerX,
        centerY,
        startAngle,
        origRotation: frame.rotation ?? 0,
      }

      setCursor('grabbing')
      overlay.setPointerCapture(e.pointerId)
    },
    [viewTransformRef]
  )

  // ---- Pointer handlers ----

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return // left click only
      const doc = getDocCoords(e)
      const store = useStore.getState()

      if (canvasMode === 'draw' || canvasMode === 'shape' || canvasMode === 'text') {
        stateRef.current = {
          type: 'drawing',
          startDocX: doc.x,
          startDocY: doc.y,
        }
        setDrawPreviewRect(null)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        return
      }

      // Select mode
      const hitId = hitTestFrames(doc.x, doc.y, store.document.frames)

      if (hitId) {
        // Select the frame (or keep selection if already selected)
        if (store.selectedFrameId !== hitId) {
          store.selectFrame(hitId)
        }

        const frame = store.document.frames.find((f) => f.id === hitId)!
        stateRef.current = {
          type: 'pending-move',
          frameId: hitId,
          startDocX: doc.x,
          startDocY: doc.y,
          origX: frame.x,
          origY: frame.y,
        }
      } else {
        // Click on empty — deselect
        store.selectFrame(null)
        stateRef.current = { type: 'idle' }
      }

      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [canvasMode, getDocCoords]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = stateRef.current
      const doc = getDocCoords(e)

      if (state.type === 'pending-move') {
        // Check dead zone
        const dx = Math.abs(doc.x - state.startDocX)
        const dy = Math.abs(doc.y - state.startDocY)
        if (dx > MOVE_DEAD_ZONE || dy > MOVE_DEAD_ZONE) {
          stateRef.current = {
            type: 'moving',
            frameId: state.frameId,
            startDocX: state.startDocX,
            startDocY: state.startDocY,
            origX: state.origX,
            origY: state.origY,
          }
          setCursor('grabbing')
        }
        return
      }

      if (state.type === 'moving') {
        const deltaX = doc.x - state.startDocX
        const deltaY = doc.y - state.startDocY
        let newX = state.origX + deltaX
        let newY = state.origY + deltaY

        const store = useStore.getState()
        const frame = store.document.frames.find((f) => f.id === state.frameId)
        if (!frame) return

        if (shouldSnap(e)) {
          const snapped = snapPosition(newX, newY, frame.width, frame.height, gridLines)
          newX = snapped.x
          newY = snapped.y
        }

        store.updateFrame(state.frameId, { x: newX, y: newY })
        return
      }

      if (state.type === 'resizing') {
        const deltaX = doc.x - state.startDocX
        const deltaY = doc.y - state.startDocY
        let rect = computeResizeRect(state.origRect, state.handle, deltaX, deltaY, e.shiftKey)

        if (shouldSnap(e)) {
          rect = snapResize(rect, state.handle, gridLines)
        }

        // Enforce minimum size
        rect = clampMinSize(rect, state.origRect, state.handle)

        useStore.getState().updateFrame(state.frameId, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        return
      }

      if (state.type === 'rotating') {
        const currentAngle = Math.atan2(doc.y - state.centerY, doc.x - state.centerX)
        let deltaDeg = (currentAngle - state.startAngle) * (180 / Math.PI)
        let newRotation = state.origRotation + deltaDeg

        // Shift-snap to 15-degree increments
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15
        }

        // Normalize to -180..180 range
        newRotation = ((newRotation + 180) % 360 + 360) % 360 - 180

        useStore.getState().updateFrame(state.frameId, { rotation: newRotation })
        return
      }

      if (state.type === 'drawing') {
        let rect = normalizeRect(state.startDocX, state.startDocY, doc.x, doc.y)
        // Shift-constrain to square when in shape mode
        if (e.shiftKey && canvasMode === 'shape') {
          const size = Math.max(rect.width, rect.height)
          rect = { x: state.startDocX < doc.x ? rect.x : rect.x + rect.width - size, y: state.startDocY < doc.y ? rect.y : rect.y + rect.height - size, width: size, height: size }
        }
        if (shouldSnap(e)) {
          rect = snapResize(rect, 'se', gridLines)
          rect = snapResize(rect, 'nw', gridLines)
        }
        setDrawPreviewRect(rect)
        return
      }

      // Idle — update cursor based on hover
      if (canvasMode === 'draw' || canvasMode === 'shape' || canvasMode === 'text') {
        setCursor('crosshair')
      } else {
        const store = useStore.getState()
        const hitId = hitTestFrames(doc.x, doc.y, store.document.frames)
        setCursor(hitId ? 'grab' : 'default')
      }
    },
    [canvasMode, getDocCoords, gridLines, shouldSnap]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const state = stateRef.current

      if (state.type === 'moving') {
        useStore.getState().pushHistory()
      }

      if (state.type === 'resizing') {
        useStore.getState().pushHistory()
      }

      if (state.type === 'rotating') {
        useStore.getState().pushHistory()
      }

      if (state.type === 'drawing') {
        const doc = getDocCoords(e)
        let rect = normalizeRect(state.startDocX, state.startDocY, doc.x, doc.y)
        // Shift-constrain to square when in shape mode
        if (e.shiftKey && canvasMode === 'shape') {
          const size = Math.max(rect.width, rect.height)
          rect = { x: state.startDocX < doc.x ? rect.x : rect.x + rect.width - size, y: state.startDocY < doc.y ? rect.y : rect.y + rect.height - size, width: size, height: size }
        }
        if (shouldSnap(e)) {
          rect = snapResize(rect, 'se', gridLines)
          rect = snapResize(rect, 'nw', gridLines)
        }

        if (rect.width > 5 && rect.height > 5) {
          const store = useStore.getState()
          if (canvasMode === 'shape') {
            store.addFrame(
              {
                type: 'shape',
                shape: store.selectedShapeType,
                fill: [1, 1, 1],
                stroke: null,
                strokeWidth: 2,
              },
              rect
            )
          } else if (canvasMode === 'text') {
            store.addFrame(
              {
                type: 'text',
                text: 'Type here',
                fontFamily: 'inter',
                fontSize: 48,
                fontWeight: 400,
                color: [1, 1, 1],
                align: 'left',
                letterSpacing: 0,
                lineHeight: 1.2,
                textTransform: 'none',
                strikethrough: false,
                underline: false,
              },
              rect
            )
          } else {
            store.addFrame(
              { type: 'solid-color', color: [0.2, 0.2, 0.2] },
              rect
            )
          }
          store.setCanvasMode('select')
        }
        setDrawPreviewRect(null)
      }

      stateRef.current = { type: 'idle' }
      setCursor(canvasMode === 'draw' || canvasMode === 'shape' || canvasMode === 'text' ? 'crosshair' : 'default')
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    },
    [canvasMode, getDocCoords, gridLines, shouldSnap]
  )

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    drawPreviewRect,
    cursor,
    onResizeHandleDown,
    onRotateHandleDown,
  }
}

// ---- Resize math ----

function computeResizeRect(
  orig: Rect,
  handle: HandlePosition,
  deltaX: number,
  deltaY: number,
  shiftKey: boolean
): Rect {
  let { x, y, width, height } = orig

  const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw'
  const movesRight = handle === 'ne' || handle === 'e' || handle === 'se'
  const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne'
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se'

  if (movesLeft) {
    x = orig.x + deltaX
    width = orig.width - deltaX
  }
  if (movesRight) {
    width = orig.width + deltaX
  }
  if (movesTop) {
    y = orig.y + deltaY
    height = orig.height - deltaY
  }
  if (movesBottom) {
    height = orig.height + deltaY
  }

  // Proportional by default for corners. Hold Shift to allow free (non-proportional) resize.
  if (!shiftKey && (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se')) {
    const ratio = orig.width / orig.height
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Width drives
      height = width / ratio
      if (movesTop) y = orig.y + orig.height - height
    } else {
      // Height drives
      width = height * ratio
      if (movesLeft) x = orig.x + orig.width - width
    }
  }

  return { x, y, width, height }
}

function clampMinSize(
  rect: Rect,
  orig: Rect,
  handle: HandlePosition
): Rect {
  let { x, y, width, height } = rect

  if (width < MIN_FRAME_SIZE) {
    width = MIN_FRAME_SIZE
    const movesLeft = handle === 'nw' || handle === 'w' || handle === 'sw'
    if (movesLeft) x = orig.x + orig.width - MIN_FRAME_SIZE
  }

  if (height < MIN_FRAME_SIZE) {
    height = MIN_FRAME_SIZE
    const movesTop = handle === 'nw' || handle === 'n' || handle === 'ne'
    if (movesTop) y = orig.y + orig.height - MIN_FRAME_SIZE
  }

  return { x, y, width, height }
}

function getCursorForHandle(handle: HandlePosition): string {
  const map: Record<HandlePosition, string> = {
    nw: 'nw-resize',
    n: 'n-resize',
    ne: 'ne-resize',
    e: 'e-resize',
    se: 'se-resize',
    s: 's-resize',
    sw: 'sw-resize',
    w: 'w-resize',
  }
  return map[handle]
}
