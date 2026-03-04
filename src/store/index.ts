import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { EffectInstance, EffectParams, BlendMode } from '../effects/types'
import { getEffect } from '../effects/registry'
import { uid } from '../utils/math'
import type { CanvasDocument, Frame, FrameContent, GridConfig } from '../types/canvas'
import { DEFAULT_DOCUMENT } from '../types/canvas'

// ---- Persisted types ----

export interface Preset {
  id: string
  name: string
  description: string
  chain: EffectInstance[]
  thumbnail?: string
  source: 'builtin' | 'user'
  tags: string[]
  createdAt: number
}

export interface PromptHistoryEntry {
  prompt: string
  response: unknown
  kept: boolean
  timestamp: number
}

// ---- Helpers ----

function findSelectedFrame(state: GlitchState): Frame | undefined {
  if (!state.selectedFrameId) return undefined
  return state.document.frames.find((f) => f.id === state.selectedFrameId)
}

function findEffectInFrame(frame: Frame, instanceId: string): EffectInstance | undefined {
  return frame.effectChain.find((e) => e.id === instanceId)
}

function createEffectInstance(effectId: string): EffectInstance | null {
  const def = getEffect(effectId)
  if (!def) return null
  const defaults: EffectParams = {}
  for (const p of def.paramDefs) {
    defaults[p.key] = p.default
  }
  return {
    id: uid(),
    effectId,
    params: defaults,
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
  }
}

// ---- State interface ----

interface GlitchState {
  // Document model
  document: CanvasDocument

  // Selection
  selectedFrameId: string | null
  selectedEffectId: string | null

  // Frame CRUD
  addFrame: (content: FrameContent, rect?: { x: number; y: number; width: number; height: number }) => string
  removeFrame: (frameId: string) => void
  updateFrame: (frameId: string, patch: Partial<Omit<Frame, 'id' | 'effectChain'>>) => void
  selectFrame: (frameId: string | null) => void
  reorderFramesByIds: (orderedIds: string[]) => void

  // Canvas
  setCanvasSize: (width: number, height: number) => void
  setBackgroundColor: (color: [number, number, number]) => void
  setBackgroundAlpha: (alpha: number) => void
  updateGrid: (patch: Partial<GridConfig>) => void

  // Effect actions — operate on selected frame's effectChain (backward compat)
  addEffect: (effectId: string) => void
  removeEffect: (instanceId: string) => void
  reorderEffect: (fromIndex: number, toIndex: number) => void
  updateEffectParams: (instanceId: string, params: Partial<EffectParams>) => void
  toggleEffect: (instanceId: string) => void
  setEffectOpacity: (instanceId: string, opacity: number) => void
  setEffectBlendMode: (instanceId: string, blendMode: BlendMode) => void
  replaceChain: (chain: EffectInstance[]) => void
  clearChain: () => void

  // Canvas interaction
  canvasMode: 'select' | 'draw' | 'shape' | 'lasso' | 'text'
  setCanvasMode: (mode: 'select' | 'draw' | 'shape' | 'lasso' | 'text') => void
  selectedShapeType: 'rectangle' | 'circle' | 'triangle'
  setSelectedShapeType: (shape: 'rectangle' | 'circle' | 'triangle') => void

  // UI
  selectEffect: (instanceId: string | null) => void
  isRendering: boolean
  setIsRendering: (v: boolean) => void

  // Undo/redo (snapshots the document)
  history: CanvasDocument[]
  historyIndex: number
  pushHistory: () => void
  undo: () => void
  redo: () => void

  // Presets (persisted)
  presets: Preset[]
  savePreset: (name: string, tags: string[], thumbnail?: string) => void
  deletePreset: (id: string) => void
  applyPreset: (preset: Preset) => void

  // Prompt history (persisted)
  promptHistory: PromptHistoryEntry[]
  addPromptEntry: (entry: Omit<PromptHistoryEntry, 'timestamp'>) => void

  // Render generation (for stale-check)
  generation: number
  bumpGeneration: () => void

  // Convenience getters
  /** Returns the selected frame's effect chain (or empty array) */
  readonly chain: EffectInstance[]
  /** Returns the selected frame's instance id mapping to old selectedInstanceId */
  readonly selectedInstanceId: string | null
}

// ---- Persisted state shape ----

interface PersistedState {
  presets: Preset[]
  promptHistory: PromptHistoryEntry[]
}

// ---- Store ----

export const useStore = create<GlitchState>()(
  immer(
    persist(
      (set, get) => ({
        // Document
        document: { ...DEFAULT_DOCUMENT, frames: [], globalEffectChain: [], grid: { ...DEFAULT_DOCUMENT.grid } },

        // Selection
        selectedFrameId: null,
        selectedEffectId: null,

        // Frame CRUD
        addFrame: (content, rect) => {
          const doc = get().document
          const frameId = uid()
          const maxZ = doc.frames.reduce((max, f) => Math.max(max, f.zIndex), 0)
          const frame: Frame = {
            id: frameId,
            name: `Frame ${doc.frames.length + 1}`,
            x: rect?.x ?? 0,
            y: rect?.y ?? 0,
            width: rect?.width ?? doc.width,
            height: rect?.height ?? doc.height,
            zIndex: maxZ + 1,
            content,
            effectChain: [],
            locked: false,
            visible: true,
            opacity: 1,
            blendMode: 'normal',
            rotation: 0,
          }
          set((s) => {
            s.document.frames.push(frame as any)
            s.selectedFrameId = frameId
            s.selectedEffectId = null
          })
          get().pushHistory()
          get().bumpGeneration()
          return frameId
        },

        removeFrame: (frameId) => {
          set((s) => {
            s.document.frames = s.document.frames.filter((f) => f.id !== frameId)
            if (s.selectedFrameId === frameId) {
              s.selectedFrameId = s.document.frames.length > 0 ? s.document.frames[s.document.frames.length - 1].id : null
              s.selectedEffectId = null
            }
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        updateFrame: (frameId, patch) => {
          set((s) => {
            const frame = s.document.frames.find((f) => f.id === frameId)
            if (frame) Object.assign(frame, patch)
          })
          get().bumpGeneration()
        },

        selectFrame: (frameId) => {
          set((s) => {
            s.selectedFrameId = frameId
            s.selectedEffectId = null
          })
        },

        reorderFramesByIds: (orderedIds) => {
          set((s) => {
            // Assign zIndex based on array position (0 = bottom, N-1 = top)
            for (let i = 0; i < orderedIds.length; i++) {
              const frame = s.document.frames.find((f) => f.id === orderedIds[i])
              if (frame) frame.zIndex = i + 1
            }
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        // Canvas
        setCanvasSize: (width, height) => {
          set((s) => {
            s.document.width = width
            s.document.height = height
          })
          get().bumpGeneration()
        },

        setBackgroundColor: (color) => {
          set((s) => { s.document.backgroundColor = color as any })
          get().bumpGeneration()
        },

        setBackgroundAlpha: (alpha) => {
          set((s) => { s.document.backgroundAlpha = alpha })
          get().bumpGeneration()
        },

        updateGrid: (patch) => {
          set((s) => { Object.assign(s.document.grid, patch) })
        },

        // Effect actions — scoped to selected frame
        addEffect: (effectId) => {
          const frame = findSelectedFrame(get())
          if (!frame) return
          const inst = createEffectInstance(effectId)
          if (!inst) return
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) f.effectChain.push(inst as any)
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        removeEffect: (instanceId) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              f.effectChain = f.effectChain.filter((e) => e.id !== instanceId)
              if (s.selectedEffectId === instanceId) s.selectedEffectId = null
            }
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        reorderEffect: (from, to) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              const [item] = f.effectChain.splice(from, 1)
              f.effectChain.splice(to, 0, item)
            }
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        updateEffectParams: (instanceId, params) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              const inst = findEffectInFrame(f as Frame, instanceId)
              if (inst) Object.assign(inst.params, params)
            }
          })
          get().bumpGeneration()
        },

        toggleEffect: (instanceId) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              const inst = findEffectInFrame(f as Frame, instanceId)
              if (inst) inst.enabled = !inst.enabled
            }
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        setEffectOpacity: (instanceId, opacity) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              const inst = findEffectInFrame(f as Frame, instanceId)
              if (inst) inst.opacity = opacity
            }
          })
          get().bumpGeneration()
        },

        setEffectBlendMode: (instanceId, blendMode) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              const inst = findEffectInFrame(f as Frame, instanceId)
              if (inst) inst.blendMode = blendMode
            }
          })
          get().bumpGeneration()
        },

        replaceChain: (chain) => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) f.effectChain = chain as any
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        clearChain: () => {
          set((s) => {
            const f = s.document.frames.find((f) => f.id === s.selectedFrameId)
            if (f) {
              f.effectChain = []
              s.selectedEffectId = null
            }
          })
          get().pushHistory()
          get().bumpGeneration()
        },

        // Canvas interaction
        canvasMode: 'select' as 'select' | 'draw' | 'shape' | 'lasso' | 'text',
        setCanvasMode: (mode) => set((s) => { s.canvasMode = mode }),
        selectedShapeType: 'rectangle' as 'rectangle' | 'circle' | 'triangle',
        setSelectedShapeType: (shape) => set((s) => { s.selectedShapeType = shape }),

        // UI
        selectEffect: (id) => set((s) => { s.selectedEffectId = id }),
        isRendering: false,
        setIsRendering: (v) => set((s) => { s.isRendering = v }),

        // Undo/redo — snapshots entire document
        history: [JSON.parse(JSON.stringify(DEFAULT_DOCUMENT))],
        historyIndex: 0,
        pushHistory: () =>
          set((s) => {
            const snapshot = JSON.parse(JSON.stringify(s.document))
            s.history = s.history.slice(0, s.historyIndex + 1) as any
            s.history.push(snapshot)
            if (s.history.length > 50) s.history.shift()
            s.historyIndex = s.history.length - 1
          }),
        undo: () => {
          set((s) => {
            if (s.historyIndex > 0) {
              s.historyIndex--
              s.document = JSON.parse(JSON.stringify(s.history[s.historyIndex]))
            }
          })
          get().bumpGeneration()
        },
        redo: () => {
          set((s) => {
            if (s.historyIndex < s.history.length - 1) {
              s.historyIndex++
              s.document = JSON.parse(JSON.stringify(s.history[s.historyIndex]))
            }
          })
          get().bumpGeneration()
        },

        // Presets
        presets: [],
        savePreset: (name, tags, thumbnail) => {
          const frame = findSelectedFrame(get())
          set((s) => {
            s.presets.push({
              id: uid(),
              name,
              description: '',
              chain: JSON.parse(JSON.stringify(frame?.effectChain ?? [])),
              thumbnail,
              source: 'user',
              tags,
              createdAt: Date.now(),
            } as any)
          })
        },
        deletePreset: (id) =>
          set((s) => {
            s.presets = s.presets.filter((p) => p.id !== id)
          }),
        applyPreset: (preset) => {
          get().replaceChain(JSON.parse(JSON.stringify(preset.chain)))
        },

        // Prompt history
        promptHistory: [],
        addPromptEntry: (entry) =>
          set((s) => {
            s.promptHistory.push({ ...entry, timestamp: Date.now() } as any)
            if (s.promptHistory.length > 500) s.promptHistory.shift()
          }),

        // Generation
        generation: 0,
        bumpGeneration: () => set((s) => { s.generation++ }),

        // Computed getters — these provide backward compat for UI components
        get chain() {
          const state = get()
          const frame = state.document.frames.find((f) => f.id === state.selectedFrameId)
          return frame?.effectChain ?? []
        },
        get selectedInstanceId() {
          return get().selectedEffectId
        },
      }),
      {
        name: 'glitch-app-store',
        partialize: (state): PersistedState => ({
          presets: state.presets,
          promptHistory: state.promptHistory,
        }),
      }
    )
  )
)
