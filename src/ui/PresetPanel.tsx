import { useState } from 'react'
import { useStore } from '../store'
import { getBuiltinPresets, generateRandomChain } from '../prompt/randomizer'
import type { Preset } from '../store'

export default function PresetPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'builtin' | 'user'>('builtin')
  const [saveName, setSaveName] = useState('')
  const userPresets = useStore((s) => s.presets)
  const applyPreset = useStore((s) => s.applyPreset)
  const savePreset = useStore((s) => s.savePreset)
  const deletePreset = useStore((s) => s.deletePreset)
  const replaceChain = useStore((s) => s.replaceChain)

  const builtins = getBuiltinPresets()

  const handleApply = (preset: Preset) => {
    applyPreset(preset)
    onClose()
  }

  const handleRandomize = () => {
    replaceChain(generateRandomChain())
    onClose()
  }

  const handleSave = () => {
    if (!saveName.trim()) return
    savePreset(saveName.trim(), [])
    setSaveName('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[500px] max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <h2 className="text-sm font-bold text-neutral-200">Presets</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white text-xs">
            {'\u2715'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800">
          <button
            onClick={() => setTab('builtin')}
            className={`flex-1 py-2 text-xs ${tab === 'builtin' ? 'text-white border-b-2 border-blue-500' : 'text-neutral-500'}`}
          >
            Built-in ({builtins.length})
          </button>
          <button
            onClick={() => setTab('user')}
            className={`flex-1 py-2 text-xs ${tab === 'user' ? 'text-white border-b-2 border-blue-500' : 'text-neutral-500'}`}
          >
            My Presets ({userPresets.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Randomize button */}
          <button
            onClick={handleRandomize}
            className="w-full text-left px-3 py-2 rounded bg-blue-900/30 border border-blue-800/40
                     text-blue-300 text-xs hover:bg-blue-800/40 transition-colors mb-2"
          >
            Randomize - surprise me with random effects
          </button>

          {tab === 'builtin' && builtins.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApply(preset)}
              className="w-full text-left px-3 py-2 rounded hover:bg-neutral-800 transition-colors group"
            >
              <div className="text-xs text-neutral-200 font-medium">{preset.name}</div>
              <div className="text-[10px] text-neutral-500">{preset.description}</div>
              <div className="flex gap-1 mt-1">
                {preset.tags.map((tag) => (
                  <span key={tag} className="text-[9px] px-1 py-0.5 bg-neutral-800 text-neutral-500 rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}

          {tab === 'user' && (
            <>
              {/* Save current */}
              <div className="flex gap-1 mb-2">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Preset name..."
                  className="flex-1 px-2 py-1 text-xs bg-neutral-800 text-neutral-300 rounded border border-neutral-700"
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="px-2 py-1 text-xs bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600 disabled:opacity-30"
                >
                  Save
                </button>
              </div>
              {userPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center px-3 py-2 rounded hover:bg-neutral-800 transition-colors"
                >
                  <button
                    onClick={() => handleApply(preset)}
                    className="flex-1 text-left"
                  >
                    <div className="text-xs text-neutral-200">{preset.name}</div>
                    <div className="text-[10px] text-neutral-500">
                      {preset.chain.length} effects
                    </div>
                  </button>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    className="text-neutral-600 hover:text-red-400 text-[10px] ml-2"
                  >
                    {'\u2715'}
                  </button>
                </div>
              ))}
              {userPresets.length === 0 && (
                <div className="text-xs text-neutral-600 text-center py-4">
                  No saved presets yet
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
