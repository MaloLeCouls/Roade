import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

// Position verticale des ancres d'entrée. in1 reste à 42px (compat historique),
// chaque entrée suivante 30px plus bas.
const IN_BASE = 42
const IN_STEP = 30

export default function SqlNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running, onNodeDataChange } = useEditor()
  const st = status[id] || {}
  const summary = describeQuery(data)
  // Nombre d'entrées (tables in1, in2, in3…). Défaut 2 = comportement d'avant.
  const nIn = Math.max(1, data.inputCount || 2)
  // Hauteur mini pour que toutes les ancres tiennent sans déborder du bloc.
  const minHeight = IN_BASE + (nIn - 1) * IN_STEP + 46
  const setInputs = (n) => onNodeDataChange?.(id, { inputCount: Math.max(1, n) })

  return (
    <div className={`node node-sql ${selected ? 'sel' : ''}`} style={{ minHeight }}>
      {Array.from({ length: nIn }, (_, i) => {
        const n = i + 1
        const top = IN_BASE + i * IN_STEP
        return (
          <Handle
            key={`h${n}`}
            type="target"
            position={Position.Left}
            id={`in${n}`}
            style={{ top }}
            className={`anchor anchor-in${n > 1 ? ' anchor-in2' : ''}`}
            title={
              n === 1
                ? 'Entrée 1 — table principale (in1, le FROM)'
                : `Entrée ${n} — table in${n} (jointure / table additionnelle)`
            }
          />
        )
      })}
      {Array.from({ length: nIn }, (_, i) => (
        <span key={`l${i + 1}`} className="sql-inlabel" style={{ top: IN_BASE + i * IN_STEP }}>
          {i + 1}
        </span>
      ))}
      <div className="node-head">
        <span className="node-title">{data.label || 'SQL'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">{summary}</div>
        {onNodeDataChange && (
          <div className="sql-in-edit nodrag" title="Nombre de tables en entrée (in1, in2, in3…)">
            <button
              type="button"
              className="sql-in-btn"
              disabled={nIn <= 1}
              onClick={(e) => {
                e.stopPropagation()
                setInputs(nIn - 1)
              }}
              aria-label="Retirer la dernière entrée"
            >
              –
            </button>
            <span className="sql-in-count">
              {nIn} entrée{nIn > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="sql-in-btn"
              onClick={(e) => {
                e.stopPropagation()
                setInputs(nIn + 1)
              }}
              aria-label="Ajouter une entrée"
            >
              +
            </button>
          </div>
        )}
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
