import { getAllEffects } from '../effects/registry'
import type { EffectInstance, EffectParamDef } from '../effects/types'
import { uid } from '../utils/math'

export function randomParamValue(param: EffectParamDef): unknown {
  switch (param.type) {
    case 'number': {
      const min = param.min ?? 0
      const max = param.max ?? 100
      const step = param.step ?? 1
      const range = max - min
      const value = min + Math.random() * range
      return Math.round(value / step) * step
    }
    case 'boolean':
      return Math.random() > 0.5
    case 'select': {
      const options = param.options ?? []
      return options[Math.floor(Math.random() * options.length)]?.value ?? param.default
    }
    case 'color':
      return [Math.random(), Math.random(), Math.random()]
    case 'vec2':
      return [Math.random() * 100 - 50, Math.random() * 100 - 50]
    default:
      return param.default
  }
}

export function generateRandomChain(count?: number): EffectInstance[] {
  const all = getAllEffects()
  // Filter to GPU effects for the random chain (CPU effects are slow)
  const gpuEffects = all.filter((e) => e.execution === 'gpu')

  const numEffects = count ?? (2 + Math.floor(Math.random() * 4)) // 2–5 effects
  const selected: EffectInstance[] = []

  // Shuffle and pick
  const shuffled = [...gpuEffects].sort(() => Math.random() - 0.5)
  for (let i = 0; i < Math.min(numEffects, shuffled.length); i++) {
    const def = shuffled[i]
    const params: Record<string, unknown> = {}
    for (const p of def.paramDefs) {
      params[p.key] = randomParamValue(p)
    }
    selected.push({
      id: uid(),
      effectId: def.id,
      params,
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
    })
  }

  return selected
}

/** Pre-built aesthetic presets */
export const BUILTIN_PRESETS = [
  {
    name: 'VHS Tape',
    description: 'Worn VHS tape look with tracking errors',
    tags: ['vhs', 'retro', 'tape', '90s'],
    effects: [
      { effectId: 'scanlines', params: { spacing: 3, thickness: 1.5, opacity: 0.2, speed: 15, vertical: false } },
      { effectId: 'channel-shift', params: { rX: 4, rY: 1, gX: 0, gY: 0, bX: -3, bY: -1 } },
      { effectId: 'static-noise', params: { amount: 0.08, colored: false, speed: 2 } },
      { effectId: 'wave-distortion', params: { amplitudeX: 3, amplitudeY: 0, frequencyX: 2, frequencyY: 0, speed: 0.5, waveType: 0 } },
      { effectId: 'slice-shift', params: { sliceCount: 40, maxOffset: 15, seed: 1, vertical: false } },
    ],
  },
  {
    name: 'CRT Monitor',
    description: 'Old CRT monitor with phosphor glow',
    tags: ['crt', 'monitor', 'retro', 'screen'],
    effects: [
      { effectId: 'crt-simulation', params: { curvature: 5, scanlineIntensity: 0.25, vignetteStrength: 0.4, bloomStrength: 0.2, rgbSplit: 2 } },
      { effectId: 'chromatic-aberration', params: { strength: 1.5, radial: true } },
    ],
  },
  {
    name: 'Vaporwave',
    description: 'Neon-tinged aesthetic with gradient colors',
    tags: ['vaporwave', 'aesthetic', 'neon', 'retro'],
    effects: [
      { effectId: 'gradient-map', params: { colorDark: [0.05, 0.0, 0.15], colorMid: [0.9, 0.1, 0.6], colorLight: [0.2, 0.9, 0.9], mix: 0.7 } },
      { effectId: 'scanlines', params: { spacing: 3, thickness: 1, opacity: 0.15, speed: 0, vertical: false } },
      { effectId: 'chromatic-aberration', params: { strength: 2, radial: true } },
    ],
  },
  {
    name: 'Corrupted Data',
    description: 'Heavy data corruption and byte manipulation',
    tags: ['corrupt', 'data', 'glitch', 'broken'],
    effects: [
      { effectId: 'slice-shift', params: { sliceCount: 15, maxOffset: 80, seed: 7, vertical: false } },
      { effectId: 'channel-shift', params: { rX: 12, rY: 3, gX: -5, gY: -2, bX: 8, bY: -4 } },
      { effectId: 'bit-depth', params: { bits: 3 } },
      { effectId: 'static-noise', params: { amount: 0.12, colored: true, speed: 3 } },
    ],
  },
  {
    name: 'Pixel Art',
    description: 'Retro pixel art style with dithering',
    tags: ['pixel', 'retro', '8bit', 'gameboy'],
    effects: [
      { effectId: 'mosaic', params: { blockSize: 4 } },
      { effectId: 'posterize', params: { levels: 6 } },
      { effectId: 'dither', params: { levels: 4, ditherType: 0, scale: 2 } },
    ],
  },
  {
    name: 'Acid Trip',
    description: 'Psychedelic color shifts and wave distortion',
    tags: ['psychedelic', 'acid', 'trippy', 'colorful'],
    effects: [
      { effectId: 'hue-shift', params: { hueShift: 60, saturation: 2.5, brightness: 1.2 } },
      { effectId: 'wave-distortion', params: { amplitudeX: 15, amplitudeY: 10, frequencyX: 8, frequencyY: 6, speed: 2, waveType: 0 } },
      { effectId: 'chromatic-aberration', params: { strength: 5, radial: true } },
      { effectId: 'channel-swap', params: { rSource: 2, gSource: 0, bSource: 1 } },
    ],
  },
  {
    name: 'Surveillance',
    description: 'CCTV/security camera footage look',
    tags: ['cctv', 'security', 'camera', 'surveillance'],
    effects: [
      { effectId: 'hue-shift', params: { hueShift: 0, saturation: 0.3, brightness: 0.9 } },
      { effectId: 'scanlines', params: { spacing: 2, thickness: 1, opacity: 0.3, speed: 30, vertical: false } },
      { effectId: 'static-noise', params: { amount: 0.06, colored: false, speed: 5 } },
      { effectId: 'posterize', params: { levels: 12 } },
    ],
  },
  {
    name: 'Neon Lines',
    description: 'Edge-detected neon outline aesthetic',
    tags: ['neon', 'lines', 'edges', 'outline', 'tron'],
    effects: [
      { effectId: 'edge-detection', params: { strength: 3, mix: 1, invert: false } },
      { effectId: 'gradient-map', params: { colorDark: [0.0, 0.0, 0.05], colorMid: [0.0, 0.8, 1.0], colorLight: [1.0, 0.2, 0.8], mix: 0.9 } },
      { effectId: 'chromatic-aberration', params: { strength: 2, radial: false } },
    ],
  },
  {
    name: 'Datamosh Chaos',
    description: 'Compression artifacts and block displacement',
    tags: ['datamosh', 'compress', 'blocks', 'corrupt'],
    effects: [
      { effectId: 'slice-shift', params: { sliceCount: 30, maxOffset: 60, seed: 3, vertical: false } },
      { effectId: 'mosaic', params: { blockSize: 8 } },
      { effectId: 'channel-shift', params: { rX: 8, rY: 0, gX: 0, gY: 0, bX: -6, bY: 0 } },
      { effectId: 'posterize', params: { levels: 8 } },
    ],
  },
  {
    name: 'Halftone Print',
    description: 'Newspaper/comic print style with dots',
    tags: ['halftone', 'print', 'newspaper', 'comic', 'dots'],
    effects: [
      { effectId: 'pattern-overlay', params: { patternType: 2, scale: 6, opacity: 0.5, rotation: 0.2 } },
      { effectId: 'posterize', params: { levels: 5 } },
      { effectId: 'hue-shift', params: { hueShift: 0, saturation: 0.6, brightness: 1.1 } },
    ],
  },
]

export function getBuiltinPresets() {
  return BUILTIN_PRESETS.map((preset, idx) => ({
    id: `builtin-${idx}`,
    name: preset.name,
    description: preset.description,
    tags: preset.tags,
    source: 'builtin' as const,
    createdAt: 0,
    chain: preset.effects.map((eff) => ({
      id: uid(),
      effectId: eff.effectId,
      params: eff.params,
      enabled: true,
      opacity: 1,
      blendMode: 'normal' as const,
    })),
  }))
}
