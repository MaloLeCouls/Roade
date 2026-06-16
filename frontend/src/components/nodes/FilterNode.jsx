import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

export default function FilterNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const keep = data.mode !== 'exclude'
  // Effective pairs: new model first, legacy single-column as fallback.
  const pairs = (data.pairs && data.pairs.length)
    ? data.pairs.filter((p) => p.column || p.ref_column)
    : (data.column || data.ref_column ? [{ column: data.column, ref_column: data.ref_column }] : [])
  return (
    <div className={`node node-filter ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" style={{ top: 42 }} className="anchor anchor-in"
        title="Données — le tableau à filtrer" />
      <span className="sql-inlabel" style={{ top: 42 }}>D</span>
      <Handle type="target" position={Position.Left} id="ref" style={{ top: 72 }} className="anchor anchor-in anchor-in2"
        title="Référence — le tableau dont on lit les valeurs" />
      <span className="sql-inlabel" style={{ top: 72 }}>R</span>
      <div className="node-head">
        <span className="node-title">{data.label || 'Filtre'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">{keep ? 'garder si présent' : 'exclure si présent'}</div>
        {pairs.length <= 1 ? (
          <div className="node-sub">
            <b>{pairs[0]?.column || '—'}</b> {keep ? '∈' : '∉'} <b>{pairs[0]?.ref_column || '—'}</b>
          </div>
        ) : (
          <div className="node-sub" title={pairs.map((p) => `${p.column || '—'} = ${p.ref_column || '—'}`).join('\n')}>
            clé composite sur <b>{pairs.length} colonnes</b> {keep ? '∈' : '∉'} réf
          </div>
        )}
      </div>
      <NodeFooter st={st} running={running === id} onPreview={() => onPreview(id)} onRun={() => onRunNode(id)} />
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}
