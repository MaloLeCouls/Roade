import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import Icon from '../Icon'

export default function SourceNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running } = useEditor()
  const st = status[id] || {}
  return (
    <div className={`node node-source ${selected ? 'sel' : ''}`}>
      <div className="node-head">
        <span className="node-title">{data.label || 'Source'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        {data.file ? (
          <>
            <div className="node-line">
              <b>{data.file}</b>
            </div>
            {data.sheet && <div className="node-sub">feuille : {data.sheet}</div>}
          </>
        ) : (
          <div className="node-sub muted">aucun fichier</div>
        )}
      </div>
      <NodeFooter
        st={st}
        running={running === id}
        onPreview={() => onPreview(id)}
        onRun={() => onRunNode(id)}
        onReload={() => onRunNode(id, true)}
      />
      <Handle type="source" position={Position.Right} id="out" className="anchor anchor-out" />
    </div>
  )
}

export function LockBadge({ locked }) {
  if (!locked) return null
  return (
    <span className="lockbadge" title="Verrouillé : non recalculé à l'exécution">
      <Icon name="lock" size={12} />
    </span>
  )
}

export function StatusBadge({ st, running, runningLabel = 'exécution…' }) {
  if (running) return <span className="badge run">{runningLabel}</span>
  if (st.error)
    return (
      <span className="badge err" title={st.error}>
        erreur
      </span>
    )
  if (st.ran)
    return (
      <span className="badge ok">
        {(st.rows ?? 0).toLocaleString('fr-FR')} lignes{st.cached ? ' · cache' : ''}
      </span>
    )
  return <span className="badge idle">non exécuté</span>
}

export function NodeFooter({ st, running, onPreview, onRun, onReload }) {
  return (
    <div className="node-foot">
      <StatusBadge st={st} running={running} />
      <div className="node-actions">
        <button
          className="mini"
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          title="Exécuter jusqu'ici"
        >
          <Icon name="play" />
        </button>
        {onReload && (
          <button
            className="mini"
            onClick={(e) => {
              e.stopPropagation()
              onReload()
            }}
            title="Recharger le fichier (ignorer le cache)"
          >
            <Icon name="refresh" />
          </button>
        )}
        <button
          className="mini"
          disabled={!st.ran}
          onClick={(e) => {
            e.stopPropagation()
            onPreview()
          }}
          title="Aperçu des données"
        >
          <Icon name="eye" />
        </button>
      </div>
    </div>
  )
}
