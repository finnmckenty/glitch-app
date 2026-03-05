import { useCallback, useRef, useState, useEffect } from 'react'
import { loadImageFromFile } from '../engine/image-loader'
import { useStore } from '../store'
import { cacheBitmap } from '../engine/bitmap-cache'
import { generateRandomChain } from '../prompt/randomizer'

const SIZE_PRESETS = [
  { label: 'Instagram Square', w: 1080, h: 1080 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Twitter / X Post', w: 1200, h: 675 },
  { label: 'HD Landscape', w: 1920, h: 1080 },
  { label: '4K', w: 3840, h: 2160 },
  { label: 'Custom', w: 0, h: 0 },
] as const

export default function EmptyState({ onShowAIDialog: _onShowAIDialog }: { onShowAIDialog: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(1080)
  const [canvasHeight, setCanvasHeight] = useState(1920)
  const [selectedPreset, setSelectedPreset] = useState(1) // index into SIZE_PRESETS
  const [transparentBg, setTransparentBg] = useState(false)

  // Sync canvas size and alpha to store whenever they change
  useEffect(() => {
    useStore.getState().setCanvasSize(canvasWidth, canvasHeight)
  }, [canvasWidth, canvasHeight])

  useEffect(() => {
    useStore.getState().setBackgroundAlpha(transparentBg ? 0 : 1)
  }, [transparentBg])

  const handlePresetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value)
    setSelectedPreset(idx)
    const preset = SIZE_PRESETS[idx]
    if (preset.w > 0 && preset.h > 0) {
      setCanvasWidth(preset.w)
      setCanvasHeight(preset.h)
    }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    const result = await loadImageFromFile(file)
    const store = useStore.getState()
    const doc = store.document
    // Fit image at native aspect ratio, centered in canvas (no upscale)
    const imgW = result.meta.width
    const imgH = result.meta.height
    const s = Math.min(doc.width / imgW, doc.height / imgH, 1)
    const w = Math.round(imgW * s)
    const h = Math.round(imgH * s)
    const frameId = store.addFrame(
      {
        type: 'image',
        sourceUrl: URL.createObjectURL(file),
        meta: result.meta,
      },
      {
        x: Math.round((doc.width - w) / 2),
        y: Math.round((doc.height - h) / 2),
        width: w,
        height: h,
      }
    )
    cacheBitmap(frameId, result.bitmap)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file?.type.startsWith('image/')) handleFile(file)
    },
    [handleFile]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) handleFile(file)
          break
        }
      }
    },
    [handleFile]
  )

  // Generate noise as starting image with random effects
  const handleSurpriseMe = useCallback(() => {
    const w = 800
    const h = 600
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(w, h)
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = Math.random() * 255
      imageData.data[i + 1] = Math.random() * 255
      imageData.data[i + 2] = Math.random() * 255
      imageData.data[i + 3] = 255
    }
    ctx.putImageData(imageData, 0, 0)

    createImageBitmap(canvas).then((bitmap) => {
      const store = useStore.getState()
      canvas.toBlob((blob) => {
        if (!blob) return
        const sourceUrl = URL.createObjectURL(blob)
        const doc = store.document
        // Fit noise image at native aspect ratio, centered
        const s = Math.min(doc.width / w, doc.height / h, 1)
        const fw = Math.round(w * s)
        const fh = Math.round(h * s)
        const frameId = store.addFrame(
          {
            type: 'image',
            sourceUrl,
            meta: { width: w, height: h, name: 'noise' },
          },
          {
            x: Math.round((doc.width - fw) / 2),
            y: Math.round((doc.height - fh) / 2),
            width: fw,
            height: fh,
          }
        )
        cacheBitmap(frameId, bitmap)
        store.replaceChain(generateRandomChain())
      })
    })
  }, [])

  const isCustom = SIZE_PRESETS[selectedPreset].label === 'Custom'

  return (
    <div
      className="flex-1 flex items-center justify-center bg-neutral-950"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="text-center space-y-5 max-w-md">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-neutral-200 tracking-tight">
            GLITCH
          </h1>
          <p className="text-xs text-neutral-600">
            Drop an image here to start
          </p>
        </div>

        {/* Canvas size controls */}
        <div className="space-y-2">
          <select
            value={selectedPreset}
            onChange={handlePresetChange}
            className="w-full px-2 py-1 text-xs bg-neutral-800 text-neutral-300 rounded
                     border border-neutral-700 focus:outline-none focus:border-neutral-500"
          >
            {SIZE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}{p.w > 0 ? ` (${p.w}\u00d7${p.h})` : ''}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 justify-center">
            <input
              type="number"
              value={canvasWidth}
              onChange={(e) => {
                const v = Math.max(1, Math.round(Number(e.target.value) || 1))
                setCanvasWidth(v)
                if (!isCustom) setSelectedPreset(SIZE_PRESETS.length - 1)
              }}
              className="w-20 px-2 py-1 text-xs text-center bg-neutral-800 text-neutral-300 rounded
                       border border-neutral-700 focus:outline-none focus:border-neutral-500
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={1}
            />
            <span className="text-xs text-neutral-600">&times;</span>
            <input
              type="number"
              value={canvasHeight}
              onChange={(e) => {
                const v = Math.max(1, Math.round(Number(e.target.value) || 1))
                setCanvasHeight(v)
                if (!isCustom) setSelectedPreset(SIZE_PRESETS.length - 1)
              }}
              className="w-20 px-2 py-1 text-xs text-center bg-neutral-800 text-neutral-300 rounded
                       border border-neutral-700 focus:outline-none focus:border-neutral-500
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={1}
            />
          </div>
          <label className="flex items-center gap-2 justify-center cursor-pointer">
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => setTransparentBg(e.target.checked)}
              className="w-3 h-3 accent-neutral-400 cursor-pointer"
            />
            <span className="text-[10px] text-neutral-500">Transparent background</span>
          </label>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs bg-neutral-800 text-neutral-300 rounded
                     hover:bg-neutral-700 hover:text-white transition-colors border border-neutral-700"
          >
            Import Image
          </button>
          {/* Hidden until public launch to avoid API costs
          <button
            onClick={onShowAIDialog}
            className="px-3 py-1.5 text-xs bg-emerald-900/50 text-emerald-300 rounded
                     hover:bg-emerald-800/50 hover:text-emerald-200 transition-colors border border-emerald-800/50"
          >
            Create Image
          </button>
          */}
          <button
            onClick={handleSurpriseMe}
            className="px-3 py-1.5 text-xs bg-blue-900/50 text-blue-300 rounded
                     hover:bg-blue-800/50 hover:text-blue-200 transition-colors border border-blue-800/50"
          >
            Surprise Me
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        <p className="text-[10px] text-neutral-700">
          or paste from clipboard (Cmd+V)
        </p>
      </div>
    </div>
  )
}
