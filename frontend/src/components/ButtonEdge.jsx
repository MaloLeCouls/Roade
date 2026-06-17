import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'
import { useEditor } from './editorContext'
import Icon from './Icon'

// Edge with a delete button that appears on hover / selection.
export default function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}) {
  const { onDeleteEdge, confirmDelete } = useEditor()
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  // E.5 — supprimer un lien sans filet, alors que les blocs sont confirmés,
  // est une incohérence interne. On demande confirmation. (Tant que l'undo
  // global de E.1 n'est pas en place, c'est le mini-filet qu'on a.)
  const onClick = async (e) => {
    e.stopPropagation()
    if (confirmDelete) {
      const ok = await confirmDelete({
        title: 'Supprimer ce lien ?',
        confirmLabel: 'Supprimer',
        danger: true,
      })
      if (!ok) return
    }
    onDeleteEdge(id)
  }
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="edge-del nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          title="Supprimer le lien"
          onClick={onClick}
        >
          <Icon name="x" size={11} />
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
