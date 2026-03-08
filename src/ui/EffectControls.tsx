import { useStore } from '../store'
import { getEffect } from '../effects/registry'
import type { EffectParamDef } from '../effects/types'

export default function EffectControls() {
  const selectedId = useStore((s) => s.selectedEffectId)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const frames = useStore((s) => s.document.frames)
  const updateParams = useStore((s) => s.updateEffectParams)

  const chain = frames.find((f) => f.id === selectedFrameId)?.effectChain ?? []

  const instance = chain.find((e) => e.id === selectedId)
  if (!instance) {
    return (
      <div className="p-3 text-xs text-neutral-600 text-center">
        Select an effect to edit
      </div>
    )
  }

  const def = getEffect(instance.effectId)
  if (!def) return null

  // If effect has custom Controls, use those
  if (def.Controls) {
    return (
      <def.Controls
        params={instance.params}
        paramDefs={def.paramDefs}
        onChange={(key, value) => updateParams(instance.id, { [key]: value })}
      />
    )
  }

  // Auto-generate controls from paramDefs
  return (
    <div className="p-2 space-y-3">
      <h3 className="text-xs font-bold text-neutral-300 px-1">{def.name}</h3>
      <p className="text-[10px] text-neutral-600 px-1">{def.description}</p>
      {def.paramDefs
        .filter((param) => {
          if (!param.showWhen) return true
          const depValue = instance.params[param.showWhen.key] ?? def.paramDefs.find((p) => p.key === param.showWhen!.key)?.default
          return param.showWhen.values.includes(depValue)
        })
        .map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={instance.params[param.key]}
            onChange={(v) => updateParams(instance.id, { [param.key]: v })}
          />
        ))}
    </div>
  )
}

function ParamControl({
  param,
  value,
  onChange,
}: {
  param: EffectParamDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (param.type) {
    case 'number': {
      const numVal = (value as number) ?? param.default
      const step = param.step ?? 1
      // Determine decimal places from step to avoid floating-point display artifacts
      const decimals = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)))
      const displayVal = typeof numVal === 'number' ? parseFloat(numVal.toFixed(decimals)) : numVal
      return (
        <div className="px-1">
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-neutral-500">{param.label}</label>
              {param.randomize && (
                <button
                  onClick={() => {
                    const min = param.min ?? 0
                    const max = param.max ?? 100
                    const val = min + Math.random() * (max - min)
                    onChange(parseFloat((Math.round(val / step) * step).toFixed(decimals)))
                  }}
                  className="text-[10px] text-neutral-600 hover:text-white transition-colors"
                  title="Regenerate"
                >
                  🎲
                </button>
              )}
            </div>
            <span className="text-[10px] text-neutral-600 font-mono">{displayVal}</span>
          </div>
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={numVal as number}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                     [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-neutral-400
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
          />
        </div>
      )
    }
    case 'boolean': {
      const boolVal = (value as boolean) ?? param.default
      return (
        <div className="px-1 flex items-center justify-between">
          <label className="text-[10px] text-neutral-500">{param.label}</label>
          <button
            onClick={() => onChange(!boolVal)}
            className={`w-8 h-4 rounded-full transition-colors ${
              boolVal ? 'bg-blue-600' : 'bg-neutral-700'
            }`}
          >
            <div
              className={`w-3 h-3 rounded-full bg-white transition-transform mx-0.5 ${
                boolVal ? 'translate-x-3.5' : ''
              }`}
            />
          </button>
        </div>
      )
    }
    case 'color': {
      const colorVal = (value as number[]) ?? param.default
      // Convert [0-1, 0-1, 0-1] to hex
      const toHex = (c: number[]) =>
        '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
      const fromHex = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255
        const g = parseInt(hex.slice(3, 5), 16) / 255
        const b = parseInt(hex.slice(5, 7), 16) / 255
        return [r, g, b]
      }
      return (
        <div className="px-1 flex items-center justify-between">
          <label className="text-[10px] text-neutral-500">{param.label}</label>
          <input
            type="color"
            value={toHex(colorVal)}
            onChange={(e) => onChange(fromHex(e.target.value))}
            className="w-6 h-6 rounded border border-neutral-700 bg-transparent cursor-pointer"
          />
        </div>
      )
    }
    case 'select': {
      return (
        <div className="px-1">
          <label className="text-[10px] text-neutral-500 block mb-0.5">{param.label}</label>
          <select
            value={String(value ?? param.default)}
            onChange={(e) => {
              const v = e.target.value
              // Try to parse as number if the original default is a number
              const numV = Number(v)
              onChange(isNaN(numV) ? v : numV)
            }}
            className="w-full bg-neutral-800 text-xs text-neutral-300 rounded px-1 py-0.5 border border-neutral-700"
          >
            {param.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )
    }
    case 'image': {
      const imgVal = value as string | null
      return (
        <div className="px-1">
          <label className="text-[10px] text-neutral-500 block mb-0.5">{param.label}</label>
          {imgVal && (
            <div className="relative mb-1">
              <img src={imgVal} className="w-full h-16 object-contain bg-neutral-900 rounded border border-neutral-700" />
              <button
                onClick={() => onChange(null)}
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-neutral-800 rounded-full text-[8px] text-neutral-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => onChange(reader.result as string)
              reader.readAsDataURL(file)
              e.target.value = '' // reset so same file can be re-selected
            }}
            className="w-full text-[10px] text-neutral-500
                     file:bg-neutral-800 file:text-neutral-300 file:border-0
                     file:rounded file:text-[10px] file:px-2 file:py-0.5
                     file:mr-2 file:cursor-pointer"
          />
        </div>
      )
    }
    default:
      return null
  }
}
