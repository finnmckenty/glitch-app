import { useRef } from 'react'
import { useStore } from '../store'
import { getCompositor } from './Canvas'
import { loadImageFromFile } from '../engine/image-loader'
import { cacheBitmap } from '../engine/bitmap-cache'

export default function Toolbar({ onOpenPresets, onShowAIDialog }: { onOpenPresets: () => void; onShowAIDialog: () => void }) {
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const historyIndex = useStore((s) => s.historyIndex)
  const historyLength = useStore((s) => s.history.length)
  const clearChain = useStore((s) => s.clearChain)
  const hasFrames = useStore((s) => s.document.frames.length > 0)
  const canvasMode = useStore((s) => s.canvasMode)
  const setCanvasMode = useStore((s) => s.setCanvasMode)
  const selectedShapeType = useStore((s) => s.selectedShapeType)
  const setSelectedShapeType = useStore((s) => s.setSelectedShapeType)
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    const comp = getCompositor()
    if (!comp) return
    const blob = await comp.exportPng()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `glitch-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (file: File) => {
    const result = await loadImageFromFile(file)
    const store = useStore.getState()
    const doc = store.document
    // Center on canvas at native size
    const imgW = result.meta.width
    const imgH = result.meta.height
    const x = Math.round((doc.width - imgW) / 2)
    const y = Math.round((doc.height - imgH) / 2)
    const frameId = store.addFrame(
      {
        type: 'image',
        sourceUrl: URL.createObjectURL(file),
        meta: result.meta,
      },
      { x, y, width: imgW, height: imgH }
    )
    cacheBitmap(frameId, result.bitmap)
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-neutral-900 border-b border-neutral-800">
      <span className="text-xs font-bold text-neutral-400 tracking-wider mr-3">GLITCH</span>

      <button
        onClick={undo}
        disabled={historyIndex <= 0}
        className="px-2 py-0.5 text-[10px] text-neutral-500 hover:text-white disabled:opacity-30 disabled:cursor-default"
        title="Undo"
      >
        Undo
      </button>
      <button
        onClick={redo}
        disabled={historyIndex >= historyLength - 1}
        className="px-2 py-0.5 text-[10px] text-neutral-500 hover:text-white disabled:opacity-30 disabled:cursor-default"
        title="Redo"
      >
        Redo
      </button>

      {hasFrames && (
        <>
          <div className="w-px h-4 bg-neutral-700 mx-1" />
          <button
            onClick={() => setCanvasMode('select')}
            className={`px-2 py-0.5 text-[10px] rounded ${
              canvasMode === 'select'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
            title="Move &amp; resize (V)"
          >
            Move
          </button>
          <button
            onClick={() => setCanvasMode('draw')}
            className={`px-2 py-0.5 text-[10px] rounded ${
              canvasMode === 'draw'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
            title="Draw frame (F)"
          >
            Frame
          </button>
          <div className="relative flex items-center">
            <button
              onClick={() => setCanvasMode('shape')}
              className={`px-2 py-0.5 text-[10px] rounded ${
                canvasMode === 'shape'
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-500 hover:text-white'
              }`}
              title="Shape tool (S)"
            >
              Shape
            </button>
            {canvasMode === 'shape' && (
              <select
                value={selectedShapeType}
                onChange={(e) => setSelectedShapeType(e.target.value as any)}
                className="ml-1 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                         border border-neutral-700 focus:outline-none focus:border-neutral-500"
              >
                <option value="rectangle">Rect</option>
                <option value="square">Square</option>
                <option value="circle">Circle</option>
                <option value="triangle">Triangle</option>
              </select>
            )}
          </div>
          <button
            onClick={() => setCanvasMode('lasso')}
            className={`px-2 py-0.5 text-[10px] rounded ${
              canvasMode === 'lasso'
                ? 'bg-neutral-700 text-white'
                : 'text-neutral-500 hover:text-white'
            }`}
            title="Polygon mask (L)"
          >
            Mask
          </button>
          <div className="w-px h-4 bg-neutral-700 mx-1" />
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-2 py-0.5 text-[10px] text-neutral-500 hover:text-white"
            title="Import image file"
          >
            Import Image
          </button>
          <button
            onClick={onShowAIDialog}
            className="px-2 py-0.5 text-[10px] text-neutral-500 hover:text-white"
            title="Generate image with AI"
          >
            Create Image
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportFile(file)
              // Reset so same file can be re-imported
              e.target.value = ''
            }}
          />
        </>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenPresets}
        className="px-2 py-0.5 text-[10px] text-neutral-500 hover:text-white"
      >
        Presets
      </button>
      <button
        onClick={clearChain}
        className="px-2 py-0.5 text-[10px] text-neutral-600 hover:text-red-400"
      >
        Clear
      </button>
      {hasFrames && (
        <button
          onClick={handleExport}
          className="px-2 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 hover:text-white border border-neutral-700"
        >
          Export PNG
        </button>
      )}
    </div>
  )
}
