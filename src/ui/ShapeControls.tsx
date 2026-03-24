import { useStore } from '../store'
import type { ShapeContent } from '../types/canvas'

const SHAPE_TYPES: { value: ShapeContent['shape']; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'triangle', label: 'Triangle' },
]

function colorToHex(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0')
  const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0')
  const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function hexToColor(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

export default function ShapeControls() {
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const frame = useStore((s) => {
    if (!s.selectedFrameId) return null
    return s.document.frames.find((f) => f.id === s.selectedFrameId) ?? null
  })
  const updateFrame = useStore((s) => s.updateFrame)
  const bumpGeneration = useStore((s) => s.bumpGeneration)

  if (!frame || !selectedFrameId || frame.content.type !== 'shape') return null

  const content = frame.content as ShapeContent

  const updateContent = (patch: Partial<ShapeContent>) => {
    updateFrame(selectedFrameId, {
      content: { ...content, ...patch } as any,
    })
    bumpGeneration()
  }

  return (
    <div className="px-2 py-2 border-b border-neutral-800 space-y-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Shape
      </div>

      {/* Shape type */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Type</label>
        <select
          value={content.shape}
          onChange={(e) => updateContent({ shape: e.target.value as ShapeContent['shape'] })}
          className="flex-1 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                   border border-neutral-700 focus:outline-none focus:border-neutral-500"
        >
          {SHAPE_TYPES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Fill color */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Fill</label>
        <input
          type="color"
          value={colorToHex(content.fill)}
          onChange={(e) => updateContent({ fill: hexToColor(e.target.value) })}
          className="w-6 h-5 border border-neutral-700 rounded cursor-pointer bg-transparent"
        />
        <span className="text-[10px] text-neutral-600">{colorToHex(content.fill)}</span>
      </div>

      {/* Stroke toggle + color */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Stroke</label>
        <button
          onClick={() =>
            updateContent({
              stroke: content.stroke ? null : [1, 1, 1],
            })
          }
          className={`text-[10px] px-1.5 py-0.5 rounded border ${
            content.stroke
              ? 'border-neutral-500 text-white bg-neutral-700'
              : 'border-neutral-700 text-neutral-600 bg-neutral-800'
          }`}
        >
          {content.stroke ? 'On' : 'Off'}
        </button>
        {content.stroke && (
          <input
            type="color"
            value={colorToHex(content.stroke)}
            onChange={(e) => updateContent({ stroke: hexToColor(e.target.value) })}
            className="w-6 h-5 border border-neutral-700 rounded cursor-pointer bg-transparent"
          />
        )}
      </div>

      {/* Stroke width */}
      {content.stroke && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-14 shrink-0">Width</label>
          <input
            type="range"
            min={1}
            max={20}
            value={content.strokeWidth}
            onChange={(e) => updateContent({ strokeWidth: Number(e.target.value) })}
            className="flex-1 h-1 accent-neutral-400"
          />
          <span className="text-[10px] text-neutral-500 w-6 text-right">
            {content.strokeWidth}
          </span>
        </div>
      )}

      {/* Aliased edges */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Aliased</label>
        <select
          value={content.aliased || 0}
          onChange={(e) => updateContent({ aliased: parseFloat(e.target.value) || undefined })}
          className="text-[10px] px-1 py-0.5 rounded border border-neutral-700 bg-neutral-800 text-neutral-300 outline-none"
        >
          <option value={0}>Off</option>
          <option value={0.25}>Light</option>
          <option value={0.15}>Medium</option>
          <option value={0.08}>Heavy</option>
          <option value={0.04}>Extreme</option>
        </select>
      </div>
    </div>
  )
}
