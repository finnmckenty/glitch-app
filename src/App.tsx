import { useState, useEffect, useCallback } from 'react'
import { useStore } from './store'
import { loadImageFromFile, getImageFromClipboard } from './engine/image-loader'
import { cacheBitmap } from './engine/bitmap-cache'
import './effects' // Register all effects

import Toolbar from './ui/Toolbar'
import PromptBar from './ui/PromptBar'
import PresetPanel from './ui/PresetPanel'
import Canvas from './ui/Canvas'
import EmptyState from './ui/EmptyState'
import EffectBrowser from './ui/EffectBrowser'
import EffectChain from './ui/EffectChain'
import EffectControls from './ui/EffectControls'
import AIImageDialog from './ui/AIImageDialog'
import FramesPanel from './ui/FramesPanel'
import FrameProperties from './ui/FrameProperties'
import ShapeControls from './ui/ShapeControls'

export default function App() {
  const hasFrames = useStore((s) => s.document.frames.length > 0)
  const [showPresets, setShowPresets] = useState(false)
  const [showAIDialog, setShowAIDialog] = useState(false)

  // Global paste handler — creates an image frame at native aspect ratio
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const file = getImageFromClipboard(e)
      if (file) {
        const result = await loadImageFromFile(file)
        const store = useStore.getState()
        const doc = store.document
        // Fit at native aspect ratio, centered (no upscale)
        const imgW = result.meta.width
        const imgH = result.meta.height
        const s = Math.min(doc.width / imgW, doc.height / imgH, 1)
        const w = Math.round(imgW * s)
        const h = Math.round(imgH * s)
        const frameId = store.addFrame(
          {
            type: 'image',
            sourceUrl: URL.createObjectURL(file),
            meta: result.meta,
          },
          {
            x: Math.round((doc.width - w) / 2),
            y: Math.round((doc.height - h) / 2),
            width: w,
            height: h,
          }
        )
        cacheBitmap(frameId, result.bitmap)
      }
    },
    []
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA'

      // Undo/redo (always active)
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          useStore.getState().undo()
        }
        if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          useStore.getState().redo()
        }
        return
      }

      // Tool/frame shortcuts — skip if typing in an input
      if (isTyping) return

      const store = useStore.getState()

      if (e.key === 'v' || e.key === 'V') {
        store.setCanvasMode('select')
      }
      if (e.key === 'f' || e.key === 'F') {
        store.setCanvasMode('draw')
      }
      if (e.key === 's' || e.key === 'S') {
        store.setCanvasMode('shape')
      }
      if (e.key === 'l' || e.key === 'L') {
        if (store.selectedFrameId) {
          store.setCanvasMode('lasso')
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedFrameId) {
          store.removeFrame(store.selectedFrameId)
        }
      }
      if (e.key === 'Escape') {
        store.setCanvasMode('select')
        store.selectFrame(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (!hasFrames) {
    return (
      <div className="h-full flex flex-col">
        <Toolbar onOpenPresets={() => setShowPresets(true)} onShowAIDialog={() => setShowAIDialog(true)} />
        <EmptyState onShowAIDialog={() => setShowAIDialog(true)} />
        {showPresets && <PresetPanel onClose={() => setShowPresets(false)} />}
        {showAIDialog && <AIImageDialog onClose={() => setShowAIDialog(false)} />}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <Toolbar onOpenPresets={() => setShowPresets(true)} onShowAIDialog={() => setShowAIDialog(true)} />
      <PromptBar />
      {showPresets && <PresetPanel onClose={() => setShowPresets(false)} />}
      {showAIDialog && <AIImageDialog onClose={() => setShowAIDialog(false)} />}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: frames + effect browser */}
        <div className="w-44 bg-neutral-900 border-r border-neutral-800 overflow-y-auto flex flex-col">
          <FramesPanel />
          <div className="border-t border-neutral-800">
            <EffectBrowser />
          </div>
        </div>

        {/* Center: canvas */}
        <Canvas />

        {/* Right panel: frame properties + shape controls + effect chain + effect controls */}
        <div className="w-52 bg-neutral-900 border-l border-neutral-800 overflow-y-auto">
          <FrameProperties />
          <ShapeControls />
          <div className="border-t border-neutral-800">
            <EffectChain />
          </div>
          <EffectControls />
        </div>
      </div>
    </div>
  )
}
