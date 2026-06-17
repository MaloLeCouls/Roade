import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

export default function PivotNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const unpivot = data.mode === 'unpivot'
  return (
    <div className={`node node-pivot ${selected ? 'sel' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 34 }}
        className="anchor anchor-in"
      />
      <div className="node-head">
        <span className="node-title">{data.label || 'Pivot'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">
          {unpivot ? 'Dépivot (colonnes → lignes)' : 'Pivot (lignes → colonnes)'}
        </div>
        <div className="node-sub">
          {unpivot ? (
            <>{(data.value_columns || []).length} colonne(s) dépivotée(s)</>
          ) : (
            <>
              éclate <b>{data.pivot_column || '?'}</b> · {data.agg || 'SUM'}(
              <b>{data.value_column || '?'}</b>)
            </>
          )}
        </div>
      </div>
      <NodeFooter
        st={st}
        running={running === id}
        onPreview={() => onPreview(id)}
        onRun={() => onRunNode(id)}
      />
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}
