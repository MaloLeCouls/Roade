import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

export default function SqlNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  const summary = describeQuery(data)
  return (
    <div className={`node node-sql ${selected ? 'sel' : ''}`}>
      <Handle type="target" position={Position.Left} id="in1" style={{ top: 42 }} className="anchor anchor-in"
        title="Entrée 1 — table principale (FROM)" />
      <span className="sql-inlabel" style={{ top: 42 }}>1</span>
      <Handle type="target" position={Position.Left} id="in2" style={{ top: 72 }} className="anchor anchor-in anchor-in2"
        title="Entrée 2 — table à joindre (optionnelle, pour une jointure)" />
      <span className="sql-inlabel" style={{ top: 72 }}>2</span>
      <div className="node-head">
        <span className="node-title">{data.label || 'SQL'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">{summary}</div>
      </div>
      <NodeFooter st={st} running={running === id} onPreview={() => onPreview(id)} onRun={() => onRunNode(id)} />
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}

function describeQuery(data) {
  if (data.mode === 'raw') return 'SQL brut'
  const q = data.query || {}
  const bits = []
  bits.push(q.select?.length ? `${q.select.length} colonne(s)` : 'toutes colonnes')
  if (q.joins?.length) bits.push(`${q.joins.length} jointure(s)`)
  if (q.where?.length) bits.push(`${q.where.length} filtre(s)`)
  if (q.group_by?.length) bits.push('regroupé')
  return bits.join(' · ')
}
