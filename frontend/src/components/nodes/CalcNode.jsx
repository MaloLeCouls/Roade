import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

export default function CalcNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const cols = (data.columns || []).filter((c) => c.enabled !== false && (c.name || '').trim())
  return (
    <div className={`node node-calc ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 34 }} className="anchor anchor-in" />
      <div className="node-head">
        <span className="node-title">{data.label || 'Calcul'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">{cols.length} colonne(s) calculée(s)</div>
        {cols.slice(0, 3).map((c, i) => (
          <div className="node-sub mini-op" key={i}>• {c.name}</div>
        ))}
        {cols.length > 3 && <div className="node-sub">… +{cols.length - 3}</div>}
      </div>
      <NodeFooter st={st} running={running === id} onPreview={() => onPreview(id)} onRun={() => onRunNode(id)} />
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}
