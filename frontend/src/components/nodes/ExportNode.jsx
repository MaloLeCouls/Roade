import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { LockBadge } from './SourceNode'
import Icon from '../Icon'

export default function ExportNode({ id, data, selected }) {
  const { status, onRunNode, running } = useEditor()
  const st = status[id] || {}
  return (
    <div className={`node node-export ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 38 }} className="anchor anchor-in" />
      <div className="node-head">
        <span className="node-title">{data.label || 'Export'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-line"><b>{data.filename || 'export'}</b></div>
        <div className="node-sub">format : {(data.format || 'xlsx').toUpperCase()}</div>
      </div>
      <div className="node-foot">
        {running === id ? <span className="badge run">export…</span>
          : st.error ? <span className="badge err" title={st.error}>erreur</span>
          : st.ran ? <span className="badge ok">{(st.rows ?? 0).toLocaleString('fr-FR')} lignes écrites</span>
          : <span className="badge idle">non exécuté</span>}
        <div className="node-actions">
          <button className="mini" onClick={(e) => { e.stopPropagation(); onRunNode(id) }} title="Générer l'export"><Icon name="play" /></button>
        </div>
      </div>
    </div>
  )
}
