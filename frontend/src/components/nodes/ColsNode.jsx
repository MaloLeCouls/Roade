import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

export default function ColsNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const items = data.columns || []
  const kept = items.filter((c) => c.keep !== false)
  const dropped = items.filter((c) => c.keep === false)
  const renamed = items.filter((c) => c.keep !== false && (c.rename || '').trim() && c.rename !== c.name)
  return (
    <div className={`node node-cols ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 34 }} className="anchor anchor-in" />
      <div className="node-head">
        <span className="node-title">{data.label || 'Colonnes'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        {items.length === 0 ? (
          <div className="node-sub muted">configurer les colonnes</div>
        ) : (
          <>
            <div className="node-sub">{kept.length} gardée(s){dropped.length ? ` · ${dropped.length} supprimée(s)` : ''}</div>
            {renamed.length > 0 && <div className="node-sub">{renamed.length} renommée(s)</div>}
          </>
        )}
      </div>
      <NodeFooter st={st} running={running === id} onPreview={() => onPreview(id)} onRun={() => onRunNode(id)} />
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}
