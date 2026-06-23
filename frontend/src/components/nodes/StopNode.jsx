import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import Icon from '../Icon'

// A tiny "cap" you stick on an output to say: this output is left closed on
// PURPOSE (not a forgotten wire). It carries an editable note shown on hover,
// produces no data and is skipped at run time. Once attached to a block (via
// connecting from one of its outputs), the cap is glued to that block — no edge
// is drawn; React Flow parentNode handles co-movement.
export default function StopNode({ id, data, selected }) {
  const { onNodeDataChange } = useEditor()
  const [editing, setEditing] = useState(false)
  const note = data.note || ''
  const attached = !!data.attachedTo
  const set = (patch) => onNodeDataChange?.(id, patch)
  const title = note
    ? `Sortie fermée volontairement — ${note}`
    : 'Sortie fermée volontairement (double-clic pour ajouter une note)'

  return (
    <div
      className={`node-stop ${attached ? 'attached' : ''} ${selected ? 'sel' : ''}`}
      title={title}
      onDoubleClick={(e) => {
        // Double-clic n'importe où sur le bouchon (pas seulement la pastille de
        // 18px, difficile à viser) → édite la note. stopPropagation : évite que
        // React Flow traite aussi le double-clic (sélection/zoom).
        e.stopPropagation()
        setEditing(true)
      }}
    >
      {!attached && (
        <Handle type="target" position={Position.Left} id="in" className="anchor anchor-in" />
      )}
      <span className="stop-cap">
        <Icon name="stop" size={12} />
      </span>
      {editing ? (
        <input
          autoFocus
          className="stop-note-input nodrag"
          value={note}
          placeholder="pourquoi fermée ?"
          // Sans ça, React Flow capte le mousedown et vole le focus → on ne peut
          // pas taper dans le champ (le bug « impossible de mettre une note »).
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => set({ note: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setEditing(false)
          }}
        />
      ) : note ? (
        <span className="stop-note-pop" role="tooltip">
          {note}
        </span>
      ) : null}
    </div>
  )
}
