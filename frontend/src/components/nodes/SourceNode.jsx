import { Handle, Position } from '@xyflow/react'
import { useEditor } from '../editorContext'
import Icon from '../Icon'

export default function SourceNode({ id, data, selected }) {
  const { status, onPreview, onRunNode, running, sourceProgress } = useEditor()
  const st = status[id] || {}
  const prog =
    running === id && sourceProgress?.nodeId === id && sourceProgress.totalRows > 0
      ? sourceProgress
      : null
  // Règle UX : la hauteur du bloc reste fixe pendant qu'il tourne. On affiche
  // un pourcentage compact (toujours ≤ 5 caractères) ; le compte exact reste
  // accessible au survol via le title de la badge.
  const runningLabel = prog
    ? `${Math.min(100, Math.floor((prog.rowsRead / prog.totalRows) * 100))} %`
    : 'lecture…'
  const runningTitle = prog
    ? `${prog.rowsRead.toLocaleString('fr-FR')} / ${prog.totalRows.toLocaleString('fr-FR')} lignes lues`
    : undefined
  return (
    <div className={`node node-source ${selected ? 'sel' : ''}`}>
      <div className="node-head">
        <span className="node-title">{data.label || 'Source'}</span>
        <LockBadge locked={data.locked} />
      </div>
      <div className="node-body">
        {data.file ? (
          <>
            <div className="node-line" title={data.file}>
              <b>{data.file}</b>
            </div>
            {data.sheet && (
              <div className="node-sub" title={`feuille : ${data.sheet}`}>
                feuille : {data.sheet}
              </div>
            )}
          </>
        ) : (
          <div className="node-sub muted">aucun fichier</div>
        )}
      </div>
      <NodeFooter
        st={st}
        running={running === id}
        runningLabel={runningLabel}
        runningTitle={runningTitle}
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

export function StatusBadge({ st, running, runningLabel = 'exécution…', runningTitle }) {
  if (running)
    return (
      <span className="badge run" title={runningTitle}>
        {runningLabel}
      </span>
    )
  if (st.error)
    return (
      <span className="badge err" title={st.error}>
        erreur
      </span>
    )
  if (st.ran) {
    const rows = (st.rows ?? 0).toLocaleString('fr-FR')
    const cached = st.cached ? ' · cache' : ''
    return (
      <span className="badge ok" title={`${rows} lignes${cached}`}>
        {rows} lignes{cached}
      </span>
    )
  }
  return <span className="badge idle">non exécuté</span>
}

export function NodeFooter({
  st,
  running,
  runningLabel,
  runningTitle,
  onPreview,
  onRun,
  onReload,
}) {
  return (
    <div className="node-foot">
      <StatusBadge
        st={st}
        running={running}
        runningLabel={runningLabel}
        runningTitle={runningTitle}
      />
      <div className="node-actions">
        <button
          className="mini"
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          title="Exécuter jusqu'ici"
          aria-label="Exécuter jusqu'ici"
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
            aria-label="Recharger le fichier (ignorer le cache)"
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
          aria-label="Aperçu des données"
        >
          <Icon name="eye" />
        </button>
      </div>
    </div>
  )
}
