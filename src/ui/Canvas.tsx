import { useRef, useEffect, useCallback } from 'react'
import { Compositor } from '../engine/compositor'
import { loadImageFromFile } from '../engine/image-loader'
import { useStore } from '../store'
import { cacheBitmap } from '../engine/bitmap-cache'
import { useViewTransform, screenToDoc } from './canvas/use-view-transform'
import InteractionOverlay from './canvas/InteractionOverlay'

// Singleton compositor — lives outside React lifecycle
let compositor: Compositor | null = null

export function getCompositor(): Compositor | null {
  return compositor
}

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const document = useStore((s) => s.document)
  const generation = useStore((s) => s.generation)

  // Compute the mapping between container and document coords
  const { viewTransform, viewTransformRef } = useViewTransform(containerRef, document)

  // Initialize compositor on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    compositor = new Compositor(canvas)
    compositor.startLoop()

    return () => {
      compositor?.dispose()
      compositor = null
    }
  }, [])

  // Update compositor when document or generation changes
  useEffect(() => {
    if (compositor) {
      compositor.update(document, generation)
    }
  }, [document, generation])

  // Handle drag and drop — creates an image frame at drop position
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      const result = await loadImageFromFile(file)
      const store = useStore.getState()

      // Compute document-space drop position
      const vt = viewTransformRef.current
      const doc = store.document
      let rect: { x: number; y: number; width: number; height: number } | undefined
      if (vt && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect()
        const screenX = e.clientX - containerRect.left
        const screenY = e.clientY - containerRect.top
        const docPos = screenToDoc(screenX, screenY, vt)
        const imgW = result.meta.width
        const imgH = result.meta.height
        if (doc.frames.length > 0) {
          // Center image on drop point at native size
          rect = {
            x: docPos.x - imgW / 2,
            y: docPos.y - imgH / 2,
            width: imgW,
            height: imgH,
          }
        } else {
          // First image: fit at native aspect ratio, centered in canvas
          const s = Math.min(doc.width / imgW, doc.height / imgH, 1)
          const w = Math.round(imgW * s)
          const h = Math.round(imgH * s)
          rect = {
            x: Math.round((doc.width - w) / 2),
            y: Math.round((doc.height - h) / 2),
            width: w,
            height: h,
          }
        }
      }

      const frameId = store.addFrame(
        {
          type: 'image',
          sourceUrl: URL.createObjectURL(file),
          meta: result.meta,
        },
        rect
      )
      cacheBitmap(frameId, result.bitmap)
    }
  }, [viewTransformRef])

  const { scale, offsetX, offsetY, docWidth, docHeight } = viewTransform

  return (
    <div
      ref={containerRef}
      className="flex-1 relative bg-neutral-950 overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* WebGL render canvas — absolutely positioned via ViewTransform */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: docWidth * scale,
          height: docHeight * scale,
          imageRendering: 'auto',
        }}
      />

      {/* Interaction overlay — pointer events, selection UI, grid */}
      <InteractionOverlay
        viewTransform={viewTransform}
        viewTransformRef={viewTransformRef}
      />
    </div>
  )
}
