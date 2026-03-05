import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store'
import type { FrameContent } from '../types/canvas'

function contentTypeIcon(content: FrameContent): string {
  switch (content.type) {
    case 'image': return '\u{1F5BC}' // framed picture
    case 'solid-color': return '\u25A0' // filled square
    case 'shape': return '\u25CB' // circle
    case 'ai-image': return '\u2728' // sparkles
    case 'text': return 'T'
    case 'gradient': return '\u25A8' // patterned square
    case 'pattern': return '\u25A6' // patterned square alt
    default: return '\u25A1' // empty square
  }
}

export default function FramesPanel() {
  const frames = useStore((s) => s.document.frames)
  const selectedFrameId = useStore((s) => s.selectedFrameId)
  const selectFrame = useStore((s) => s.selectFrame)
  const updateFrame = useStore((s) => s.updateFrame)
  const reorderFramesByIds = useStore((s) => s.reorderFramesByIds)

  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Frames sorted by zIndex descending (topmost first in the list)
  const sortedFrames = [...frames].sort((a, b) => b.zIndex - a.zIndex)

  const handleNameDoubleClick = useCallback((frameId: string) => {
    setEditingNameId(frameId)
    // Focus after React renders the input
    setTimeout(() => nameInputRef.current?.select(), 0)
  }, [])

  const commitName = useCallback((frameId: string, name: string) => {
    if (name.trim()) {
      updateFrame(frameId, { name: name.trim() })
    }
    setEditingNameId(null)
  }, [updateFrame])

  const handleDragStart = useCallback((e: React.DragEvent, frameId: string) => {
    setDraggedId(frameId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', frameId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetIdx(idx)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    if (!draggedId) return
    // Build new ordered array: remove dragged, insert at drop position
    const ids = sortedFrames.map((f) => f.id)
    const fromIdx = ids.indexOf(draggedId)
    if (fromIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(dropIdx, 0, draggedId)
    // Reverse because sortedFrames is highest-zIndex-first, but reorderFramesByIds
    // expects bottom-to-top order (index 0 = lowest zIndex)
    reorderFramesByIds([...ids].reverse())
    setDraggedId(null)
    setDropTargetIdx(null)
  }, [draggedId, sortedFrames, reorderFramesByIds])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
    setDropTargetIdx(null)
  }, [])

  return (
    <div className="py-1">
      <div className="px-2 py-1 text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
        Frames
      </div>
      <div className="space-y-px">
        {sortedFrames.map((frame, idx) => (
          <div
            key={frame.id}
            className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[11px] select-none
              ${frame.id === selectedFrameId ? 'bg-neutral-700/50 text-white' : 'text-neutral-400 hover:bg-neutral-800/50'}
              ${dropTargetIdx === idx ? 'border-t border-blue-500' : ''}
              ${draggedId === frame.id ? 'opacity-40' : ''}`}
            onClick={() => selectFrame(frame.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, frame.id)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
          >
            {/* Drag handle */}
            <span className="text-neutral-600 cursor-grab text-[9px]">&equiv;</span>

            {/* Content type icon */}
            <span className="text-[10px] w-4 text-center shrink-0 opacity-60">
              {contentTypeIcon(frame.content)}
            </span>

            {/* Frame name (editable on double click) */}
            <div className="flex-1 min-w-0 truncate" onDoubleClick={() => handleNameDoubleClick(frame.id)}>
              {editingNameId === frame.id ? (
                <input
                  ref={nameInputRef}
                  defaultValue={frame.name}
                  className="w-full bg-neutral-800 text-white text-[11px] px-1 rounded outline-none border border-neutral-600"
                  onBlur={(e) => commitName(frame.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitName(frame.id, (e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setEditingNameId(null)
                  }}
                />
              ) : (
                <span className="truncate block">{frame.name}</span>
              )}
            </div>

            {/* Visibility toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateFrame(frame.id, { visible: !frame.visible })
              }}
              className={`text-[10px] w-4 text-center shrink-0 ${
                frame.visible ? 'text-neutral-400 hover:text-white' : 'text-neutral-700'
              }`}
              title={frame.visible ? 'Hide' : 'Show'}
            >
              {frame.visible ? '\u{1F441}' : '\u2014'}
            </button>

            {/* Lock toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateFrame(frame.id, { locked: !frame.locked })
              }}
              className={`text-[10px] w-4 text-center shrink-0 ${
                frame.locked ? 'text-orange-400' : 'text-neutral-700 hover:text-neutral-400'
              }`}
              title={frame.locked ? 'Unlock' : 'Lock'}
            >
              {frame.locked ? '\u{1F512}' : '\u{1F513}'}
            </button>
          </div>
        ))}
        {sortedFrames.length === 0 && (
          <div className="px-2 py-2 text-[10px] text-neutral-700 text-center">No frames</div>
        )}
      </div>
    </div>
  )
}
