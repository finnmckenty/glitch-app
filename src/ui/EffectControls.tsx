import { useStore } from '../store'
import { getEffect } from '../effects/registry'
import ParamControl from './ParamControl'

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
