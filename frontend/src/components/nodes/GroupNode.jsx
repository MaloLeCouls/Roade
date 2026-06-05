import { useState } from 'react'
import { NodeResizer } from '@xyflow/react'
import { useEditor } from '../editorContext'

// A ComfyUI-style frame: a resizable, named rectangle rendered behind the blocks.
// Dragging its title bar moves every block whose centre sits inside it (handled
// in WorkflowEditor's onNodeDrag — positions stay absolute, no strict parenting).
export default function GroupNode({ id, data, selected }) {
  const { onNodeDataChange } = useEditor()
  const [editing, setEditing] = useState(false)
  const w = data.w || 420
  const h = data.h || 280
  const color = data.color || '#5b6bb0'
  const set = (patch) => onNodeDataChange?.(id, patch)

  return (
    <div className={`node-group ${selected ? 'sel' : ''}`} style={{ width: w, height: h, '--gc': color }}>
      <NodeResizer color={color} isVisible={selected} minWidth={180} minHeight={120}
        onResize={(_, p) => set({ w: Math.round(p.width), h: Math.round(p.height) })} />
      <div className="group-titlebar" style={{ background: color }}>
        {editing ? (
          <input autoFocus className="group-title-input nodrag" value={data.label || ''} placeholder="Groupe"
            onChange={(e) => set({ label: e.target.value })}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false) }} />
        ) : (
          <span className="group-title" title="Glisser pour déplacer le cadre et son contenu · double-clic pour renommer"
            onDoubleClick={() => setEditing(true)}>{data.label || 'Groupe'}</span>
        )}
      </div>
    </div>
  )
}
