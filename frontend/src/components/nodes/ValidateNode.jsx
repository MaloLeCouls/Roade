import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { LockBadge } from './SourceNode'
import Icon from '../Icon'

const OUTPUTS = [
  { handle: 'valid', label: 'Conformes', cls: 'kept' },
  { handle: 'invalid', label: 'Non conformes', cls: 'dups' },
]

export default function ValidateNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const outs = st.outputs || {}
  return (
    <div className={`node node-validate ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 34 }} className="anchor anchor-in" />
      <div className="node-head">
        <span className="node-title">{data.label || 'Validation'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">
          {data.mode === 'mask' ? 'masque' : 'règles'} sur <b>{data.target_column || '?'}</b>
        </div>
        <div className="dedup-outs">
          {OUTPUTS.map((o) => (
            <div className="dedup-out" key={o.handle}>
              <span className={`odot ${o.cls}`} />
              <span className="oname">{o.label}</span>
              {st.ran && <span className="ocount">{(outs[o.handle] ?? 0).toLocaleString('fr-FR')}</span>}
              <Handle type="source" position={Position.Right} id={o.handle}
                className={`anchor anchor-out anchor-${o.cls}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="node-foot">
        {running === id ? <span className="badge run">contrôle…</span>
          : st.error ? <span className="badge err" title={st.error}>erreur</span>
          : st.ran ? <span className="badge ok">contrôlé</span>
          : <span className="badge idle">non exécuté</span>}
        <div className="node-actions">
          <button className="mini" onClick={(e) => { e.stopPropagation(); onRunNode(id) }} title="Exécuter jusqu'ici"><Icon name="play" /></button>
          <button className="mini" disabled={!st.ran} onClick={(e) => { e.stopPropagation(); onPreview(id) }} title="Aperçu des sorties"><Icon name="eye" /></button>
        </div>
      </div>
    </div>
  )
}
