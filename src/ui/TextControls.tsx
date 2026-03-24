import { useStore } from '../store'
import type { TextContent } from '../types/canvas'
import { FONT_CATALOG, getFontEntry, getRandomFont, loadFont } from '../engine/font-loader'

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

const versatile = FONT_CATALOG.filter((f) => f.category === 'versatile')
const experimental = FONT_CATALOG.filter((f) => f.category === 'experimental')

export default function TextControls() {
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const frame = useStore((s) => {
    if (!s.selectedFrameId) return null
    return s.document.frames.find((f) => f.id === s.selectedFrameId) ?? null
  })
  const updateFrame = useStore((s) => s.updateFrame)
  const bumpGeneration = useStore((s) => s.bumpGeneration)

  if (!frame || !selectedFrameId || frame.content.type !== 'text') return null

  const content = frame.content as TextContent
  const entry = getFontEntry(content.fontFamily)

  const updateContent = (patch: Partial<TextContent>) => {
    updateFrame(selectedFrameId, {
      content: { ...content, ...patch } as any,
    })
    bumpGeneration()
  }

  const handleFontChange = (fontId: string) => {
    loadFont(fontId)
    // Reset axis values that don't apply to the new font
    const newEntry = getFontEntry(fontId)
    const patch: Partial<TextContent> = { fontFamily: fontId }
    if (!newEntry?.axes.find((a) => a.tag === 'wdth')) patch.fontWidth = undefined
    if (!newEntry?.axes.find((a) => a.tag === 'slnt')) patch.fontSlant = undefined
    if (!newEntry?.axes.find((a) => a.tag === 'CASL')) patch.fontCasual = undefined
    // Set weight to new font's default if current weight is out of range
    const wghtAxis = newEntry?.axes.find((a) => a.tag === 'wght')
    if (wghtAxis && (content.fontWeight < wghtAxis.min || content.fontWeight > wghtAxis.max)) {
      patch.fontWeight = wghtAxis.default
    }
    updateContent(patch)
  }

  const handleSurpriseMe = () => {
    const random = getRandomFont()
    loadFont(random.fontFamily)
    const patch: Partial<TextContent> = {
      fontFamily: random.fontFamily,
      fontWeight: random.fontWeight,
      fontWidth: random.axes['wdth'],
      fontSlant: random.axes['slnt'],
      fontCasual: random.axes['CASL'],
    }
    updateContent(patch)
  }

  const wghtAxis = entry?.axes.find((a) => a.tag === 'wght')
  const wdthAxis = entry?.axes.find((a) => a.tag === 'wdth')
  const slntAxis = entry?.axes.find((a) => a.tag === 'slnt')
  const caslAxis = entry?.axes.find((a) => a.tag === 'CASL')
  // Sixtyfour-specific axes
  const bledAxis = entry?.axes.find((a) => a.tag === 'BLED')
  const scanAxis = entry?.axes.find((a) => a.tag === 'SCAN')

  return (
    <div className="px-2 py-2 border-b border-neutral-800 space-y-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Text
      </div>

      {/* Text input */}
      <textarea
        value={content.text}
        onChange={(e) => updateContent({ text: e.target.value })}
        className="w-full px-1.5 py-1 text-[11px] bg-neutral-800 text-neutral-200 rounded
                 border border-neutral-700 focus:outline-none focus:border-neutral-500 resize-y"
        rows={3}
        placeholder="Type here..."
      />

      {/* Font picker */}
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Font</label>
        <select
          value={content.fontFamily}
          onChange={(e) => handleFontChange(e.target.value)}
          className="flex-1 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                   border border-neutral-700 focus:outline-none focus:border-neutral-500"
        >
          <optgroup label="Versatile">
            {versatile.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </optgroup>
          <optgroup label="Experimental">
            {experimental.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </optgroup>
        </select>
        <button
          onClick={handleSurpriseMe}
          className="px-1.5 py-0.5 text-[10px] rounded border border-neutral-700
                   text-neutral-400 hover:text-white hover:border-neutral-500"
          title="Random experimental font"
        >
          🎲
        </button>
      </div>

      {/* Size */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Size</label>
        <input
          type="range"
          min={8}
          max={200}
          value={content.fontSize}
          onChange={(e) => updateContent({ fontSize: Number(e.target.value) })}
          className="flex-1 h-1 accent-neutral-400"
        />
        <input
          type="number"
          min={1}
          max={999}
          value={content.fontSize}
          onChange={(e) => updateContent({ fontSize: Number(e.target.value) || 48 })}
          className="w-10 px-1 py-0.5 text-[10px] bg-neutral-800 text-neutral-300 rounded
                   border border-neutral-700 text-right"
        />
      </div>

      {/* Weight (always shown — most fonts support it) */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Weight</label>
        <input
          type="range"
          min={wghtAxis?.min ?? 100}
          max={wghtAxis?.max ?? 900}
          step={1}
          value={content.fontWeight}
          onChange={(e) => updateContent({ fontWeight: Number(e.target.value) })}
          className="flex-1 h-1 accent-neutral-400"
        />
        <span className="text-[10px] text-neutral-500 w-8 text-right">{content.fontWeight}</span>
      </div>

      {/* Width axis (only if supported) */}
      {wdthAxis && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-10 shrink-0">Width</label>
          <input
            type="range"
            min={wdthAxis.min}
            max={wdthAxis.max}
            step={wdthAxis.step}
            value={content.fontWidth ?? wdthAxis.default}
            onChange={(e) => updateContent({ fontWidth: Number(e.target.value) })}
            className="flex-1 h-1 accent-neutral-400"
          />
          <span className="text-[10px] text-neutral-500 w-8 text-right">{content.fontWidth ?? wdthAxis.default}</span>
        </div>
      )}

      {/* Slant axis */}
      {slntAxis && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-10 shrink-0">Slant</label>
          <input
            type="range"
            min={slntAxis.min}
            max={slntAxis.max}
            step={slntAxis.step}
            value={content.fontSlant ?? slntAxis.default}
            onChange={(e) => updateContent({ fontSlant: Number(e.target.value) })}
            className="flex-1 h-1 accent-neutral-400"
          />
          <span className="text-[10px] text-neutral-500 w-8 text-right">{content.fontSlant ?? slntAxis.default}</span>
        </div>
      )}

      {/* Casual axis (Recursive) */}
      {caslAxis && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-10 shrink-0">Casual</label>
          <input
            type="range"
            min={caslAxis.min}
            max={caslAxis.max}
            step={caslAxis.step}
            value={content.fontCasual ?? caslAxis.default}
            onChange={(e) => updateContent({ fontCasual: Number(e.target.value) })}
            className="flex-1 h-1 accent-neutral-400"
          />
          <span className="text-[10px] text-neutral-500 w-8 text-right">
            {(content.fontCasual ?? caslAxis.default).toFixed(2)}
          </span>
        </div>
      )}

      {/* Sixtyfour Bleed axis */}
      {bledAxis && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-10 shrink-0">Bleed</label>
          <input
            type="range"
            min={bledAxis.min}
            max={bledAxis.max}
            step={bledAxis.step}
            value={content.fontWidth ?? bledAxis.default}
            onChange={(e) => updateContent({ fontWidth: Number(e.target.value) })}
            className="flex-1 h-1 accent-neutral-400"
          />
        </div>
      )}

      {/* Sixtyfour Scan axis */}
      {scanAxis && (
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-neutral-500 w-10 shrink-0">Scan</label>
          <input
            type="range"
            min={scanAxis.min}
            max={scanAxis.max}
            step={scanAxis.step}
            value={content.fontSlant ?? scanAxis.default}
            onChange={(e) => updateContent({ fontSlant: Number(e.target.value) })}
            className="flex-1 h-1 accent-neutral-400"
          />
        </div>
      )}

      {/* Color */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Color</label>
        <input
          type="color"
          value={colorToHex(content.color)}
          onChange={(e) => updateContent({ color: hexToColor(e.target.value) })}
          className="w-6 h-5 border border-neutral-700 rounded cursor-pointer bg-transparent"
        />
        <span className="text-[10px] text-neutral-600">{colorToHex(content.color)}</span>
      </div>

      {/* Align */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Align</label>
        <div className="flex gap-0.5">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              onClick={() => updateContent({ align: a })}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                content.align === a
                  ? 'border-neutral-500 text-white bg-neutral-700'
                  : 'border-neutral-700 text-neutral-600 bg-neutral-800'
              }`}
            >
              {a === 'left' ? '◀' : a === 'center' ? '◆' : '▶'}
            </button>
          ))}
        </div>
      </div>

      {/* Letter Spacing */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Spacing</label>
        <input
          type="range"
          min={-0.1}
          max={0.5}
          step={0.005}
          value={content.letterSpacing}
          onChange={(e) => updateContent({ letterSpacing: Number(e.target.value) })}
          className="flex-1 h-1 accent-neutral-400"
        />
        <span className="text-[10px] text-neutral-500 w-8 text-right">
          {content.letterSpacing.toFixed(2)}
        </span>
      </div>

      {/* Line Height */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Leading</label>
        <input
          type="range"
          min={0.8}
          max={3}
          step={0.05}
          value={content.lineHeight}
          onChange={(e) => updateContent({ lineHeight: Number(e.target.value) })}
          className="flex-1 h-1 accent-neutral-400"
        />
        <span className="text-[10px] text-neutral-500 w-8 text-right">
          {content.lineHeight.toFixed(1)}
        </span>
      </div>

      {/* Text Transform */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Case</label>
        <div className="flex gap-0.5">
          {([['none', 'Aa'], ['uppercase', 'AA'], ['lowercase', 'aa']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => updateContent({ textTransform: val })}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                content.textTransform === val
                  ? 'border-neutral-500 text-white bg-neutral-700'
                  : 'border-neutral-700 text-neutral-600 bg-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Decorations */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Style</label>
        <button
          onClick={() => updateContent({ strikethrough: !content.strikethrough })}
          className={`px-2 py-0.5 text-[10px] rounded border ${
            content.strikethrough
              ? 'border-neutral-500 text-white bg-neutral-700'
              : 'border-neutral-700 text-neutral-600 bg-neutral-800'
          }`}
        >
          <span className="line-through">S</span>
        </button>
        <button
          onClick={() => updateContent({ underline: !content.underline })}
          className={`px-2 py-0.5 text-[10px] rounded border ${
            content.underline
              ? 'border-neutral-500 text-white bg-neutral-700'
              : 'border-neutral-700 text-neutral-600 bg-neutral-800'
          }`}
        >
          <span className="underline">U</span>
        </button>
      </div>

      {/* Aliasing */}
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-neutral-500 w-10 shrink-0">Aliasing</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={content.aliased || 0}
          onChange={(e) => updateContent({ aliased: parseFloat(e.target.value) || undefined })}
          className="flex-1 h-1 accent-neutral-400"
          title="Aliased rendering intensity"
        />
        <span className="text-[10px] text-neutral-500 w-6 text-right">{content.aliased ? Math.round((content.aliased) * 100) + '%' : 'Off'}</span>
      </div>
    </div>
  )
}
