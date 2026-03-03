import { useStore } from '../store'
import type { BlendMode } from '../effects/types'

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'add', label: 'Add' },
  { value: 'difference', label: 'Difference' },
]

export default function FrameProperties() {
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const frame = useStore((s) => {
    if (!s.selectedFrameId) return null
    return s.document.frames.find((f) => f.id === s.selectedFrameId) ?? null
  })
  const updateFrame = useStore((s) => s.updateFrame)

  if (!frame || !selectedFrameId) return null

  return (
    <div className="px-2 py-2 border-b border-neutral-800 space-y-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Frame
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Opacity</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(frame.opacity * 100)}
          onChange={(e) => updateFrame(selectedFrameId, { opacity: Number(e.target.value) / 100 })}
          className="flex-1 h-1 accent-neutral-400"
        />
        <span className="text-[10px] text-neutral-500 w-8 text-right">
          {Math.round(frame.opacity * 100)}%
        </span>
      </div>

      {/* Rotation */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Rotation</label>
        <input
          type="range"
          min={-180}
          max={180}
          value={frame.rotation ?? 0}
          onChange={(e) => updateFrame(selectedFrameId, { rotation: Number(e.target.value) })}
          className="flex-1 h-1 accent-neutral-400"
        />
        <input
          type="number"
          value={Math.round(frame.rotation ?? 0)}
          onChange={(e) => updateFrame(selectedFrameId, { rotation: Number(e.target.value) || 0 })}
          className="w-10 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                   border border-neutral-700 focus:outline-none focus:border-neutral-500 text-right
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-neutral-500">°</span>
      </div>

      {/* Blend Mode */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-14 shrink-0">Blend</label>
        <select
          value={frame.blendMode || 'normal'}
          onChange={(e) => updateFrame(selectedFrameId, { blendMode: e.target.value as BlendMode })}
          className="flex-1 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                   border border-neutral-700 focus:outline-none focus:border-neutral-500"
        >
          {BLEND_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Mask controls — shown when frame has a polygon mask */}
      {frame.mask && frame.mask.points.length >= 3 && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-14 shrink-0">Mask</label>
          <button
            onClick={() =>
              updateFrame(selectedFrameId, {
                mask: { ...frame.mask!, inverted: !frame.mask!.inverted },
              } as any)
            }
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              frame.mask.inverted
                ? 'border-blue-500 text-blue-300 bg-blue-900/30'
                : 'border-neutral-700 text-neutral-400 bg-neutral-800'
            }`}
          >
            {frame.mask.inverted ? 'Inverted' : 'Invert'}
          </button>
          <button
            onClick={() => {
              updateFrame(selectedFrameId, { mask: undefined } as any)
              useStore.getState().pushHistory()
            }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-700 text-neutral-600 hover:text-red-400 bg-neutral-800"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
