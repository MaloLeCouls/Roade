import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import Icon from '../Icon'

// A tiny "cap" you connect to an output to say: this output is left closed on
// PURPOSE (not a forgotten wire). It carries an editable note shown on hover,
// produces no data and is skipped at run time.
export default function StopNode({ id, data, selected }) {
  const { onNodeDataChange } = useEditor()
  const [editing, setEditing] = useState(false)
  const note = data.note || ''
  const set = (patch) => onNodeDataChange?.(id, patch)
  const title = note
    ? `Sortie fermée volontairement — ${note}`
    : 'Sortie fermée volontairement (double-clic pour ajouter une note)'

  return (
    <div className={`node-stop ${selected ? 'sel' : ''}`} title={title}>
      <Handle type="target" position={Position.Left} id="in" className="anchor anchor-in" />
      <span className="stop-cap" onDoubleClick={() => setEditing(true)}><Icon name="stop" size={12} /></span>
      {editing ? (
        <input autoFocus className="stop-note-input nodrag" value={note} placeholder="pourquoi fermée ?"
          onChange={(e) => set({ note: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(false) }} />
      ) : note ? (
        <span className="stop-note" onDoubleClick={() => setEditing(true)} title="double-clic pour modifier la note">{note}</span>
      ) : null}
    </div>
  )
}
