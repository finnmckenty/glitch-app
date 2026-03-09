import { useState } from 'react'
import { getAllEffects } from '../effects/registry'
import { useStore } from '../store'
import type { EffectCategory } from '../effects/types'

const BUILDING_BLOCK_ORDER: EffectCategory[] = [
  'overlay',
  'color',
  'distortion',
  'noise-artifacts',
  'pixel-manipulation',
]

const CATEGORY_LABELS: Record<string, string> = {
  'original': 'Originals',
  'overlay': 'Overlay',
  'color': 'Color',
  'distortion': 'Distortion',
  'noise-artifacts': 'Noise',
  'pixel-manipulation': 'Pixel',
}

export default function EffectBrowser() {
  const addEffect = useStore((s) => s.addEffect)
  const effects = getAllEffects()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    original: false, // expanded by default
    ...Object.fromEntries(BUILDING_BLOCK_ORDER.map((c) => [c, true])),
  })

  const grouped = effects.reduce((acc, eff) => {
    if (!acc[eff.category]) acc[eff.category] = []
    acc[eff.category].push(eff)
    return acc
  }, {} as Record<string, typeof effects>)

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

  const originals = grouped['original'] ?? []

  return (
    <div className="p-2 space-y-3">
      {/* Originals section */}
      {originals.length > 0 && (
        <div className="border-l-2 border-amber-500/50 pl-2">
          <button
            onClick={() => toggle('original')}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500 px-1 mb-1 hover:text-neutral-400 w-full text-left"
          >
            <span className={`text-[8px] transition-transform ${collapsed['original'] ? '' : 'rotate-90'}`}>
              &#9654;
            </span>
            Originals
          </button>
          {!collapsed['original'] && (
            <div className="space-y-0.5">
              {originals.map((eff) => (
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
          )}
        </div>
      )}

      {/* Building Blocks section */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-neutral-600 px-1 mb-1">
          Building Blocks
        </h3>
        {BUILDING_BLOCK_ORDER.filter((c) => grouped[c]).map((category) => (
          <div key={category} className="mb-1">
            <button
              onClick={() => toggle(category)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-600 px-1 mb-1 hover:text-neutral-400 w-full text-left"
            >
              <span className={`text-[8px] transition-transform ${collapsed[category] ? '' : 'rotate-90'}`}>
                &#9654;
              </span>
              {CATEGORY_LABELS[category] ?? category}
            </button>
            {!collapsed[category] && (
              <div className="space-y-0.5">
                {grouped[category].map((eff) => (
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
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
