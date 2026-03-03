import { useState, useEffect, useRef, type RefObject } from 'react'
import type { CanvasDocument } from '../../types/canvas'

export interface ViewTransform {
  /** Document pixels → screen pixels multiplier */
  scale: number
  /** Screen px from container left to canvas left */
  offsetX: number
  /** Screen px from container top to canvas top */
  offsetY: number
  /** Document width in pixels */
  docWidth: number
  /** Document height in pixels */
  docHeight: number
}

const DEFAULT_VT: ViewTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  docWidth: 1080,
  docHeight: 1080,
}

function compute(
  containerW: number,
  containerH: number,
  docW: number,
  docH: number
): ViewTransform {
  if (docW === 0 || docH === 0 || containerW === 0 || containerH === 0) {
    return { ...DEFAULT_VT, docWidth: docW, docHeight: docH }
  }
  const scale = Math.min(containerW / docW, containerH / docH)
  const renderedW = docW * scale
  const renderedH = docH * scale
  return {
    scale,
    offsetX: (containerW - renderedW) / 2,
    offsetY: (containerH - renderedH) / 2,
    docWidth: docW,
    docHeight: docH,
  }
}

/** Convert screen (container-relative) coords to document coords */
export function screenToDoc(
  screenX: number,
  screenY: number,
  vt: ViewTransform
): { x: number; y: number } {
  return {
    x: (screenX - vt.offsetX) / vt.scale,
    y: (screenY - vt.offsetY) / vt.scale,
  }
}

/** Convert document coords to screen (container-relative) coords */
export function docToScreen(
  docX: number,
  docY: number,
  vt: ViewTransform
): { x: number; y: number } {
  return {
    x: docX * vt.scale + vt.offsetX,
    y: docY * vt.scale + vt.offsetY,
  }
}

/**
 * Computes the ViewTransform mapping between the container div and document coords.
 * Returns both React state (for re-rendering) and a ref (for pointer handlers).
 */
export function useViewTransform(
  containerRef: RefObject<HTMLDivElement | null>,
  doc: CanvasDocument
): { viewTransform: ViewTransform; viewTransformRef: RefObject<ViewTransform> } {
  const [viewTransform, setViewTransform] = useState<ViewTransform>(() =>
    compute(0, 0, doc.width, doc.height)
  )
  const viewTransformRef = useRef<ViewTransform>(viewTransform)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      const vt = compute(rect.width, rect.height, doc.width, doc.height)
      viewTransformRef.current = vt
      setViewTransform(vt)
    }

    // Initial compute
    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, doc.width, doc.height])

  return { viewTransform, viewTransformRef }
}
