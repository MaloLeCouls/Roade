import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

// Terminal "Analyse" block: it has an input but no output anchor — nothing can be
// chained after it. Its job is to profile the data flowing in, for reporting.
export default function ReportNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const cols = data.columns || []
  return (
    <div className={`node node-report ${selected ? 'sel' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 34 }}
        className="anchor anchor-in"
      />
      <div className="node-head">
        <span className="node-title">{data.label || 'Analyse'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">
          {cols.length ? `${cols.length} colonne(s) analysée(s)` : 'toutes les colonnes'}
        </div>
        {data.note ? (
          <div className="node-sub mini-op">📝 {data.note}</div>
        ) : (
          <div className="node-sub muted">à titre d'info (non exporté)</div>
        )}
      </div>
      <NodeFooter
        st={st}
        running={running === id}
        onPreview={() => onPreview(id)}
        onRun={() => onRunNode(id)}
      />
    </div>
  )
}
