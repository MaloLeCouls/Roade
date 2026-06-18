import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { LockBadge } from './SourceNode'
import Icon from '../Icon'

const OUTPUTS = [
  { handle: 'kept', label: 'Dédoublonné', cls: 'kept' },
  { handle: 'dups', label: 'Doublons', cls: 'dups' },
  { handle: 'uniques', label: 'Uniques', cls: 'uniq' },
]

export default function DedupNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const outs = st.outputs || {}
  const keys = data.key_columns || []
  return (
    <div className={`node node-dedup ${selected ? 'sel' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 34 }}
        className="anchor anchor-in"
      />
      <div className="node-head">
        <span className="node-title">{data.label || 'Doublons'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">
          clé : {keys.length ? <b>{keys.join(' + ')}</b> : <i>ligne entière</i>}
        </div>
        <div className="node-sub">doublons : {dupModeLabel(data.dups_mode)}</div>

        <div className="dedup-outs">
          {OUTPUTS.map((o) => (
            <div className="dedup-out" key={o.handle}>
              <span className={`odot ${o.cls}`} />
              <span className="oname">{o.label}</span>
              {st.ran && (
                <span className="ocount">{(outs[o.handle] ?? 0).toLocaleString('fr-FR')}</span>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={o.handle}
                className={`anchor anchor-out anchor-${o.cls}`}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="node-foot">
        {running === id ? (
          <span className="badge run">exécution…</span>
        ) : st.error ? (
          <span className="badge err" title={st.error}>
            erreur
          </span>
        ) : st.ran ? (
          <span className="badge ok">séparé</span>
        ) : (
          <span className="badge idle">non exécuté</span>
        )}
        <div className="node-actions">
          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation()
              onRunNode(id)
            }}
            title="Exécuter jusqu'ici"
            aria-label="Exécuter jusqu'ici"
          >
            <Icon name="play" />
          </button>
          <button
            className="mini"
            disabled={!st.ran}
            onClick={(e) => {
              e.stopPropagation()
              onPreview(id)
            }}
            title="Aperçu des sorties"
            aria-label="Aperçu des sorties"
          >
            <Icon name="eye" />
          </button>
        </div>
      </div>
    </div>
  )
}

function dupModeLabel(m) {
  return { all: 'toutes occurrences', exemplar: 'un exemplaire', extra: 'occurrences en trop' }[
    m || 'all'
  ]
}
