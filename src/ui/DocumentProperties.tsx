import { useRef } from 'react'
import { useStore } from '../store'
import type { Background } from '../types/canvas'

function rgbToHex(color: [number, number, number]): string {
  return (
    '#' +
    color
      .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
      .join('')
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

export default function DocumentProperties() {
  const background = useStore((s) => s.document.background)
  const setBackground = useStore((s) => s.setBackground)
  const setBackgroundImage = useStore((s) => s.setBackgroundImage)
  const clearBackgroundImage = useStore((s) => s.clearBackgroundImage)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const bgColor: [number, number, number] =
    background.type === 'color' ? background.color : [0, 0, 0]

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === 'color') {
      clearBackgroundImage()
    } else if (value === 'image') {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await setBackgroundImage(file)
    }
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rgb = hexToRgb(e.target.value)
    const updated: Background = {
      type: 'color',
      color: rgb,
      alpha: background.alpha,
    }
    setBackground(updated)
  }

  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const alpha = Number(e.target.value) / 100
    if (background.type === 'color') {
      setBackground({ ...background, color: [...background.color], alpha })
    } else {
      setBackground({ ...background, meta: { ...background.meta }, alpha })
    }
  }

  return (
    <div className="px-2 py-2 border-b border-neutral-800 space-y-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Document Background
      </div>

      {/* Type selector */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Type</label>
        <select
          value={background.type === 'image' ? 'image' : 'color'}
          onChange={handleTypeChange}
          className="flex-1 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                   border border-neutral-700 focus:outline-none focus:border-neutral-500"
        >
          <option value="color">Solid Color</option>
          <option value="image">Image</option>
        </select>
      </div>

      {/* Color picker — for color backgrounds */}
      {background.type === 'color' && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-14 shrink-0">Color</label>
          <input
            type="color"
            value={rgbToHex(bgColor)}
            onChange={handleColorChange}
            className="w-6 h-6 rounded border border-neutral-700 bg-transparent cursor-pointer shrink-0"
          />
        </div>
      )}

      {/* Image info */}
      {background.type === 'image' && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-14 shrink-0">Image</label>
          <span className="text-[10px] text-neutral-400 truncate flex-1">
            {background.meta.name} ({background.meta.width}×{background.meta.height})
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-400 bg-neutral-800 hover:text-white"
          >
            Replace
          </button>
          <button
            onClick={clearBackgroundImage}
            className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-600 hover:text-red-400 bg-neutral-800"
          >
            ×
          </button>
        </div>
      )}

      {/* Alpha */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Alpha</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(background.alpha * 100)}
          onChange={handleAlphaChange}
          className="flex-1 h-1 accent-neutral-400"
        />
        <span className="text-[10px] text-neutral-500 w-8 text-right">
          {Math.round(background.alpha * 100)}%
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
