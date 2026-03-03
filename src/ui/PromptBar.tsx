import { useState, useCallback } from 'react'
import { useStore } from '../store'
import { interpretPrompt, interpretationToChain } from '../prompt/interpreter'

const API_KEY_STORAGE = 'glitch-app-api-key'

export default function PromptBar() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '')
  const replaceChain = useStore((s) => s.replaceChain)
  const addPromptEntry = useStore((s) => s.addPromptEntry)

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) return
    if (!apiKey) {
      setShowKeyInput(true)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await interpretPrompt(prompt, apiKey)
      const chain = interpretationToChain(result)
      replaceChain(chain)
      addPromptEntry({ prompt, response: result, kept: true })
      setPrompt('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      if (msg.includes('401') || msg.includes('invalid')) {
        setShowKeyInput(true)
      }
    } finally {
      setLoading(false)
    }
  }, [prompt, apiKey, replaceChain, addPromptEntry])

  const handleSaveKey = () => {
    localStorage.setItem(API_KEY_STORAGE, apiKey)
    setShowKeyInput(false)
    if (prompt.trim()) handleSubmit()
  }

  return (
    <div className="px-2 py-1 bg-neutral-900 border-b border-neutral-800">
      <div className="flex gap-1 items-center">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
          placeholder="Describe the aesthetic you want... (e.g., 'corrupted VHS tape')"
          className="flex-1 px-2 py-1 text-xs bg-neutral-800 text-neutral-300 rounded border border-neutral-700
                   placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !prompt.trim()}
          className="px-2 py-1 text-[10px] bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600
                   disabled:opacity-30 disabled:cursor-default whitespace-nowrap"
        >
          {loading ? 'Thinking...' : 'Generate'}
        </button>
        <button
          onClick={() => setShowKeyInput(!showKeyInput)}
          className="px-1.5 py-1 text-[10px] text-neutral-600 hover:text-neutral-300"
          title="API Key Settings"
        >
          {apiKey ? '\u2713' : '\u26A0'}
        </button>
      </div>

      {showKeyInput && (
        <div className="flex gap-1 items-center mt-1">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Claude API key (sk-ant-...)"
            className="flex-1 px-2 py-1 text-[10px] bg-neutral-800 text-neutral-300 rounded border border-neutral-700
                     placeholder:text-neutral-600 font-mono"
            onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
          />
          <button
            onClick={handleSaveKey}
            className="px-2 py-1 text-[10px] bg-neutral-700 text-neutral-300 rounded hover:bg-neutral-600"
          >
            Save
          </button>
        </div>
      )}

      {error && (
        <div className="text-[10px] text-red-400 mt-1 px-1">{error}</div>
      )}
    </div>
  )
}
