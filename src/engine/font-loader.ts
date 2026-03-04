/**
 * Curated font catalog + on-demand Google Fonts loading.
 * Fonts are loaded via CSS Font Loading API (FontFace).
 */

export interface FontAxis {
  tag: string       // e.g. 'wght', 'wdth', 'slnt', 'CASL'
  label: string
  min: number
  max: number
  default: number
  step: number
}

export interface FontEntry {
  id: string
  name: string
  category: 'versatile' | 'experimental'
  /** Google Fonts family name (used in URL) */
  googleFamily: string
  /** Variable axes supported */
  axes: FontAxis[]
  /** Google Fonts axis range string for URL, e.g. "wght@100..900" */
  axisUrl: string
}

export const FONT_CATALOG: FontEntry[] = [
  // ---- Versatile variable fonts ----
  {
    id: 'inter',
    name: 'Inter',
    category: 'versatile',
    googleFamily: 'Inter',
    axes: [
      { tag: 'wght', label: 'Weight', min: 100, max: 900, default: 400, step: 1 },
    ],
    // wdth and slnt axes not served by Google Fonts CSS API; opsz included for better rendering
    axisUrl: 'ital,opsz,wght@0,14..32,100..900;1,14..32,100..900',
  },
  {
    id: 'source-serif-4',
    name: 'Source Serif 4',
    category: 'versatile',
    googleFamily: 'Source+Serif+4',
    axes: [
      { tag: 'wght', label: 'Weight', min: 200, max: 900, default: 400, step: 1 },
    ],
    // opsz included for better rendering but no UI control
    axisUrl: 'ital,opsz,wght@0,8..60,200..900;1,8..60,200..900',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'versatile',
    googleFamily: 'JetBrains+Mono',
    axes: [
      { tag: 'wght', label: 'Weight', min: 100, max: 800, default: 400, step: 1 },
    ],
    axisUrl: 'ital,wght@0,100..800;1,100..800',
  },
  {
    id: 'recursive',
    name: 'Recursive',
    category: 'versatile',
    googleFamily: 'Recursive',
    axes: [
      { tag: 'wght', label: 'Weight', min: 300, max: 1000, default: 400, step: 1 },
      { tag: 'CASL', label: 'Casual', min: 0, max: 1, default: 0, step: 0.01 },
      { tag: 'MONO', label: 'Mono', min: 0, max: 1, default: 0, step: 0.01 },
      { tag: 'slnt', label: 'Slant', min: -15, max: 0, default: 0, step: 0.5 },
    ],
    axisUrl: 'CASL,CRSV,MONO,slnt,wght@0..1,0..1,0..1,-15..0,300..1000',
  },

  // ---- Experimental / unusual ----
  {
    id: 'rubik-glitch',
    name: 'Rubik Glitch',
    category: 'experimental',
    googleFamily: 'Rubik+Glitch',
    axes: [],
    axisUrl: '',
  },
  {
    id: 'unifraktur-maguntia',
    name: 'UnifrakturMaguntia',
    category: 'experimental',
    googleFamily: 'UnifrakturMaguntia',
    axes: [],
    axisUrl: '',
  },
  {
    id: 'sixtyfour',
    name: 'Sixtyfour',
    category: 'experimental',
    googleFamily: 'Sixtyfour',
    axes: [
      { tag: 'BLED', label: 'Bleed', min: 0, max: 24, default: 8, step: 1 },
    ],
    axisUrl: 'BLED@0..24',
  },
  {
    id: 'jacquard-24',
    name: 'Jacquard 24',
    category: 'experimental',
    googleFamily: 'Jacquard+24',
    axes: [],
    axisUrl: '',
  },
  {
    id: 'bungee-shade',
    name: 'Bungee Shade',
    category: 'experimental',
    googleFamily: 'Bungee+Shade',
    axes: [],
    axisUrl: '',
  },
  {
    id: 'fascinate',
    name: 'Fascinate',
    category: 'experimental',
    googleFamily: 'Fascinate',
    axes: [],
    axisUrl: '',
  },
  {
    id: 'creepster',
    name: 'Creepster',
    category: 'experimental',
    googleFamily: 'Creepster',
    axes: [],
    axisUrl: '',
  },
  {
    id: 'pixelify-sans',
    name: 'Pixelify Sans',
    category: 'experimental',
    googleFamily: 'Pixelify+Sans',
    axes: [
      { tag: 'wght', label: 'Weight', min: 400, max: 700, default: 400, step: 1 },
    ],
    axisUrl: 'wght@400..700',
  },
]

const loadedFonts = new Set<string>()
const loadingFonts = new Map<string, Promise<void>>()

/** Listeners notified when any font finishes loading */
const listeners = new Set<() => void>()

export function onFontLoaded(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notifyListeners() {
  for (const cb of listeners) cb()
}

export function getFontEntry(id: string): FontEntry | undefined {
  return FONT_CATALOG.find((f) => f.id === id)
}

export function isFontLoaded(id: string): boolean {
  return loadedFonts.has(id)
}

/**
 * Load a font from Google Fonts. Returns immediately if already loaded.
 * Uses a <link> tag to load the full variable font CSS.
 */
export function loadFont(id: string): Promise<void> {
  if (loadedFonts.has(id)) return Promise.resolve()

  const existing = loadingFonts.get(id)
  if (existing) return existing

  const entry = getFontEntry(id)
  if (!entry) return Promise.reject(new Error(`Unknown font: ${id}`))

  const promise = new Promise<void>((resolve, reject) => {
    // Build Google Fonts URL
    const axisStr = entry.axisUrl ? `:${entry.axisUrl}` : ''
    const url = `https://fonts.googleapis.com/css2?family=${entry.googleFamily}${axisStr}&display=swap`

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.onload = () => {
      // Explicitly trigger font download and wait for it to be available.
      // document.fonts.ready can resolve prematurely since CSS fonts are
      // lazy-loaded (only downloaded when needed by a DOM element).
      // document.fonts.load() forces the download regardless.
      const familyName = entry.googleFamily.replace(/\+/g, ' ')
      document.fonts.load(`16px "${familyName}"`).then(() => {
        loadedFonts.add(id)
        loadingFonts.delete(id)
        notifyListeners()
        resolve()
      }).catch(() => {
        loadingFonts.delete(id)
        reject(new Error(`Failed to load font: ${entry.name}`))
      })
    }
    link.onerror = () => {
      loadingFonts.delete(id)
      reject(new Error(`Failed to load font: ${entry.name}`))
    }
    document.head.appendChild(link)
  })

  loadingFonts.set(id, promise)
  return promise
}

/**
 * Get a random experimental font entry + randomized axis values.
 */
export function getRandomFont(): { fontFamily: string; fontWeight: number; axes: Record<string, number> } {
  const experimental = FONT_CATALOG.filter((f) => f.category === 'experimental')
  const entry = experimental[Math.floor(Math.random() * experimental.length)]

  const axes: Record<string, number> = {}
  for (const axis of entry.axes) {
    axes[axis.tag] = axis.min + Math.random() * (axis.max - axis.min)
  }

  // Random weight — use weight axis range if available, else pick from common values
  const wghtAxis = entry.axes.find((a) => a.tag === 'wght')
  const fontWeight = wghtAxis
    ? Math.round(wghtAxis.min + Math.random() * (wghtAxis.max - wghtAxis.min))
    : [400, 700, 900][Math.floor(Math.random() * 3)]

  return { fontFamily: entry.id, fontWeight, axes }
}
