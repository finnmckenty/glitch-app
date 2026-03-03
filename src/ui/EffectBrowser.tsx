import { getAllEffects } from '../effects/registry'
import { useStore } from '../store'
import type { EffectCategory } from '../effects/types'

const CATEGORY_LABELS: Record<EffectCategory, string> = {
  'pixel-manipulation': 'Pixel',
  'distortion': 'Distortion',
  'noise-artifacts': 'Noise',
  'color': 'Color',
  'overlay': 'Overlay',
}

export default function EffectBrowser() {
  const addEffect = useStore((s) => s.addEffect)
  const effects = getAllEffects()

  const grouped = effects.reduce((acc, eff) => {
    if (!acc[eff.category]) acc[eff.category] = []
    acc[eff.category].push(eff)
    return acc
  }, {} as Record<string, typeof effects>)

  return (
    <div className="p-2 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 px-1">
        Add Effect
      </h3>
      {Object.entries(grouped).map(([category, effs]) => (
        <div key={category}>
          <div className="text-[10px] uppercase tracking-wider text-neutral-600 px-1 mb-1">
            {CATEGORY_LABELS[category as EffectCategory] ?? category}
          </div>
          <div className="space-y-0.5">
            {effs.map((eff) => (
              <button
                key={eff.id}
                onClick={() => addEffect(eff.id)}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-neutral-800
                         text-neutral-300 hover:text-white transition-colors"
                title={eff.description}
              >
                {eff.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
