import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { LockBadge } from './SourceNode'
import Icon from '../Icon'

export default function ValidateNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const outs = st.outputs || {}

  const outputs = [
    ...(data.outputs || []).map((o) => ({
      handle: o.id,
      label: o.label || o.id,
      color: o.color,
      empty: 'value' in o && o.value === '',
    })),
    ...(data.else_enabled !== false
      ? [
          {
            handle: 'else',
            label: data.else_label || 'Non classé',
            color: data.else_color || '#9aa3b2',
          },
        ]
      : []),
  ]
  const list = outputs.length
    ? outputs
    : [
        { handle: 'valid', label: 'Conformes', color: '#59A14F' },
        { handle: 'invalid', label: 'Non conformes', color: '#E15759' },
      ]

  return (
    <div className={`node node-validate ${selected ? 'sel' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 34 }}
        className="anchor anchor-in"
      />
      <div className="node-head">
        <span className="node-title">{data.label || 'Validation'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div
          className="node-sub"
          title={`aiguillage sur ${data.target_column || '(colonne non choisie)'}`}
        >
          aiguillage sur <b>{data.target_column || '?'}</b>
        </div>
        <div className="dedup-outs">
          {list.map((o) => (
            <div className="dedup-out" key={o.handle}>
              <span className="odot" style={o.color ? { background: o.color } : undefined} />
              <span className={`oname ${o.empty ? 'oname-empty' : ''}`}>{o.label}</span>
              {st.ran && (
                <span className="ocount">{(outs[o.handle] ?? 0).toLocaleString('fr-FR')}</span>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={o.handle}
                className="anchor anchor-out"
                style={o.color ? { background: o.color, borderColor: o.color } : undefined}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="node-foot">
        {running === id ? (
          <span className="badge run">tri…</span>
        ) : st.error ? (
          <span className="badge err" title={st.error}>
            erreur
          </span>
        ) : st.ran ? (
          <span className="badge ok">réparti</span>
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
