import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import { NodeFooter, LockBadge } from './SourceNode'

export default function UnionNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  return (
    <div className={`node node-union ${selected ? 'sel' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ top: 40 }}
        className="anchor anchor-in"
      />
      <div className="node-head">
        <span className="node-title">{data.label || 'Union'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        <div className="node-sub">Empile toutes les entrées connectées</div>
        <div
          className="node-sub"
          title={
            data.by_name === false
              ? 'Alignement par position : la 1ʳᵉ colonne avec la 1ʳᵉ. Les noms du premier bloc gagnent.'
              : 'Alignement par nom : colonnes rapprochées par leur nom. Les manquantes deviennent NULL.'
          }
        >
          {data.by_name === false ? 'par position' : 'par nom de colonne'}
          {data.distinct ? ' · sans doublons' : ''}
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
