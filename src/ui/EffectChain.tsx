import { useCallback, useState } from 'react'
import { useStore } from '../store'
import { getEffect } from '../effects/registry'

export default function EffectChain() {
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const frames = useStore((s) => s.document.frames)
  const selectedEffectId = useStore((s) => s.selectedEffectId)
  const selectEffect = useStore((s) => s.selectEffect)
  const toggleEffect = useStore((s) => s.toggleEffect)
  const removeEffect = useStore((s) => s.removeEffect)
  const reorderEffect = useStore((s) => s.reorderEffect)

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)

  const chain = frames.find((f) => f.id === selectedFrameId)?.effectChain ?? []
  const selectedInstanceId = selectedEffectId

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetIdx(idx)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    if (draggedIdx === null || draggedIdx === dropIdx) {
      setDraggedIdx(null)
      setDropTargetIdx(null)
      return
    }
    reorderEffect(draggedIdx, dropIdx)
    setDraggedIdx(null)
    setDropTargetIdx(null)
  }, [draggedIdx, reorderEffect])

  const handleDragEnd = useCallback(() => {
    setDraggedIdx(null)
    setDropTargetIdx(null)
  }, [])

  if (chain.length === 0) {
    return (
      <div className="p-2 text-xs text-neutral-600 text-center">
        No effects added yet
      </div>
    )
  }

  return (
    <div className="space-y-0.5 p-1">
      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 px-1 mb-1">
        Chain
      </h3>
      {chain.map((inst, idx) => {
        const def = getEffect(inst.effectId)
        const isSelected = inst.id === selectedInstanceId
        return (
          <div
            key={inst.id}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer select-none
              ${isSelected ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}
              ${!inst.enabled ? 'opacity-40' : ''}
              ${dropTargetIdx === idx ? 'border-t border-blue-500' : ''}
              ${draggedIdx === idx ? 'opacity-40' : ''}`}
            onClick={() => selectEffect(inst.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle */}
            <span className="text-neutral-600 cursor-grab text-[9px]">&equiv;</span>

            <button
              onClick={(e) => { e.stopPropagation(); toggleEffect(inst.id) }}
              className="w-5 h-5 flex items-center justify-center text-xs hover:text-white"
              title={inst.enabled ? 'Disable' : 'Enable'}
            >
              {inst.enabled ? '\u25C9' : '\u25CB'}
            </button>
            <span className="flex-1 truncate">{def?.name ?? inst.effectId}</span>
            <button
              onClick={(e) => { e.stopPropagation(); removeEffect(inst.id) }}
              className="w-5 h-5 flex items-center justify-center text-xs text-neutral-600 hover:text-red-400"
              title="Remove"
            >
              {'\u2715'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
