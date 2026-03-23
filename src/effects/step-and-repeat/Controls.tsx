import type { EffectControlsProps } from '../types'
import { getFontEntry } from '../../engine/font-loader'
import ParamControl from '../../ui/ParamControl'

/** Keys for font axis params — rendered dynamically, not via paramDefs auto-gen */
const AXIS_KEYS = new Set(['fontWeight', 'fontWidth', 'fontSlant', 'fontCasual'])

export default function TextRepeatControls({ params, paramDefs, onChange }: EffectControlsProps) {
  const fontId = (params.font as string) ?? 'inter'
  const entry = getFontEntry(fontId)

  const wghtAxis = entry?.axes.find((a) => a.tag === 'wght')
  const wdthAxis = entry?.axes.find((a) => a.tag === 'wdth')
  const slntAxis = entry?.axes.find((a) => a.tag === 'slnt')
  const caslAxis = entry?.axes.find((a) => a.tag === 'CASL')
  const bledAxis = entry?.axes.find((a) => a.tag === 'BLED')
  const scanAxis = entry?.axes.find((a) => a.tag === 'SCAN')

  // Render a font axis slider
  const axisSlider = (
    label: string,
    paramKey: string,
    axis: { min: number; max: number; step: number; default: number },
    decimals: number = 0
  ) => {
    const val = (params[paramKey] as number) ?? axis.default
    const displayVal = decimals > 0 ? val.toFixed(decimals) : val
    return (
      <div key={paramKey} className="px-1">
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-[10px] text-neutral-500">{label}</label>
          <span className="text-[10px] text-neutral-600 font-mono">{displayVal}</span>
        </div>
        <input
          type="range"
          min={axis.min}
          max={axis.max}
          step={axis.step}
          value={val}
          onChange={(e) => onChange(paramKey, Number(e.target.value))}
          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-neutral-400
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
        />
      </div>
    )
  }

  // Find where to insert axis controls (after 'font' param)
  const standardParams = paramDefs.filter((p) => !AXIS_KEYS.has(p.key))

  return (
    <div className="p-2 space-y-3">
      <h3 className="text-xs font-bold text-neutral-300 px-1">Text Repeat</h3>
      <p className="text-[10px] text-neutral-600 px-1">Typographic pattern with accumulated drift and vertical scaling</p>

      {standardParams.map((param) => {
        const el = (
          <ParamControl
            key={param.key}
            param={param}
            value={params[param.key]}
            onChange={(v) => onChange(param.key, v)}
          />
        )

        // Insert font axis controls after the 'font' param
        if (param.key === 'font') {
          return (
            <div key="font-group" className="space-y-3">
              {el}
              {/* Dynamic font axes */}
              {wghtAxis && axisSlider('Weight', 'fontWeight', wghtAxis)}
              {wdthAxis && axisSlider('Width', 'fontWidth', wdthAxis)}
              {bledAxis && axisSlider('Bleed', 'fontWidth', bledAxis)}
              {slntAxis && axisSlider('Slant', 'fontSlant', slntAxis)}
              {scanAxis && axisSlider('Scan', 'fontSlant', scanAxis)}
              {caslAxis && axisSlider('Casual', 'fontCasual', caslAxis, 2)}
            </div>
          )
        }

        return el
      })}
    </div>
  )
}
