import { useState, useCallback } from 'react'
import { generateAIImage } from '../engine/ai-image'
import { useStore } from '../store'
import { cacheBitmap } from '../engine/bitmap-cache'

interface Props {
  onClose: () => void
}

export default function AIImageDialog({ onClose }: Props) {
  const doc = useStore((s) => s.document)
  const [prompt, setPrompt] = useState('')
  const [width, setWidth] = useState(doc.width)
  const [height, setHeight] = useState(doc.height)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)

    try {
      const result = await generateAIImage(prompt.trim(), width, height)

      // Load the generated image as a bitmap (imageUrl is already a blob URL)
      const imgResponse = await fetch(result.imageUrl)
      const blob = await imgResponse.blob()
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' })

      const store = useStore.getState()
      const currentDoc = store.document
      const imgW = result.width
      const imgH = result.height
      // Fit at native aspect ratio, centered
      const s = Math.min(currentDoc.width / imgW, currentDoc.height / imgH, 1)
      const fw = Math.round(imgW * s)
      const fh = Math.round(imgH * s)

      const frameId = store.addFrame(
        {
          type: 'ai-image',
          prompt: prompt.trim(),
          imageUrl: result.imageUrl,
          status: 'done',
        },
        {
          x: Math.round((currentDoc.width - fw) / 2),
          y: Math.round((currentDoc.height - fh) / 2),
          width: fw,
          height: fh,
        }
      )
      cacheBitmap(frameId, bitmap)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }, [prompt, width, height, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-700 rounded-lg p-5 w-96 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-200">Create Image</h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-sm"
          >
            &times;
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to create..."
              className="w-full px-2 py-1.5 text-xs bg-neutral-800 text-neutral-200 rounded
                       border border-neutral-700 focus:outline-none focus:border-neutral-500
                       resize-none h-20"
              disabled={loading}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleGenerate()
                }
              }}
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                Width
              </label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-2 py-1 text-xs bg-neutral-800 text-neutral-300 rounded
                         border border-neutral-700 focus:outline-none focus:border-neutral-500
                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={loading}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                Height
              </label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-2 py-1 text-xs bg-neutral-800 text-neutral-300 rounded
                         border border-neutral-700 focus:outline-none focus:border-neutral-500
                         [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <p className="text-[10px] text-red-400 bg-red-900/20 px-2 py-1 rounded">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-neutral-500 hover:text-white"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="px-3 py-1.5 text-xs bg-blue-900/50 text-blue-300 rounded
                     hover:bg-blue-800/50 hover:text-blue-200 transition-colors border border-blue-800/50
                     disabled:opacity-30 disabled:cursor-default"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
