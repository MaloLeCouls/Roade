import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { LockBadge } from './SourceNode'
import Icon from '../Icon'

export default function CleanNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const ops = (data.operations || []).filter((o) => o.enabled !== false)
  const failed = (st.cleanReport || []).reduce((a, r) => a + (r.failed || 0), 0)
  return (
    <div className={`node node-clean ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 34 }} className="anchor anchor-in" />
      <div className="node-head">
        <span className="node-title">{data.label || 'Nettoyage'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">{ops.length} opération(s)</div>
        {ops.slice(0, 3).map((o, i) => (
          <div className="node-sub mini-op" key={i}>• {o.op} → {o.column}</div>
        ))}
        {ops.length > 3 && <div className="node-sub">… +{ops.length - 3}</div>}
      </div>
      <div className="node-foot">
        {running === id ? <span className="badge run">nettoyage…</span>
          : st.error ? <span className="badge err" title={st.error}>erreur</span>
          : st.ran ? (failed > 0
              ? <span className="badge warn" title={`${failed} valeurs non converties`}>{failed} échec(s)</span>
              : <span className="badge ok">{st.rows?.toLocaleString('fr-FR')} lignes</span>)
          : <span className="badge idle">non exécuté</span>}
        <div className="node-actions">
          <button className="mini" onClick={(e) => { e.stopPropagation(); onRunNode(id) }} title="Exécuter jusqu'ici"><Icon name="play" /></button>
          <button className="mini" disabled={!st.ran} onClick={(e) => { e.stopPropagation(); onPreview(id, 'clean') }} title="Voir le rapport de nettoyage"><Icon name="list" /></button>
          <button className="mini" disabled={!st.ran} onClick={(e) => { e.stopPropagation(); onPreview(id) }} title="Aperçu des données"><Icon name="eye" /></button>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}
