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
  const { onDeleteEdge } = useEditor()
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
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
          onClick={(e) => {
            e.stopPropagation()
            onDeleteEdge(id)
          }}
        >
          <Icon name="x" size={11} />
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
