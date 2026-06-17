import { useEffect, useState } from 'react'

import { api } from '../api'
import { clickableProps } from '../lib/a11y'
import { useConfirm } from './ui/ConfirmDialog'

// Formats légers utilisés sur les cartes projet — pas une lib i18n, mais le strict
// minimum pour avoir « hier », « il y a 3 jours » etc. lisible côté FR (C.6).
function fmtRelative(ms) {
  if (!ms) return null
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 30) return `il y a ${d} j`
  return new Date(ms).toLocaleDateString('fr-FR')
}

export default function ProjectList({ onOpen }) {
  const [projects, setProjects] = useState([])
  const [name, setName] = useState('')
  // C.6 — quatre états explicites au lieu du « Chargement… » nu.
  // 'loading' au premier chargement, 'ready' après succès, 'error' si l'API
  // est tombée. Une fois 'ready', on garde la dernière liste affichée même
  // pendant un reload (évite de flasher un skeleton entre 2 actions).
  const [status, setStatus] = useState('loading')
  // E.4 — ConfirmDialog au lieu du `window.confirm` natif.
  const [askConfirm, confirmNode] = useConfirm()

  const reload = (firstLoad = false) => {
    if (firstLoad) setStatus('loading')
    return api
      .listProjects()
      .then((p) => {
        setProjects(p)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }
  useEffect(() => {
    reload(true)
  }, [])

  const create = async () => {
    if (!name.trim()) return
    const p = await api.createProject(name.trim())
    setName('')
    await reload()
    onOpen(p.id)
  }

  const remove = async (pid, e) => {
    e.stopPropagation()
    const ok = await askConfirm({
      title: 'Supprimer ce projet ?',
      message: 'Le dossier sur disque, les fichiers et tous les workflows seront supprimés.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    await api.deleteProject(pid)
    reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projets</h1>
        <div className="row">
          <input
            placeholder="Nom du nouveau projet…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button className="primary" onClick={create}>
            Créer
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="grid skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card card-skeleton" aria-hidden="true">
              <div className="skel-line skel-line-title" />
              <div className="skel-line skel-line-sub" />
              <div className="skel-line skel-line-meta" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="empty empty-error">
          <p>Impossible de charger la liste des projets.</p>
          <button className="ghost" onClick={() => reload(true)}>
            Réessayer
          </button>
        </div>
      )}

      {status === 'ready' && projects.length === 0 && (
        <div className="empty">
          <p>Aucun projet pour l'instant.</p>
          <p className="muted">
            Un projet = un dossier sur le disque qui contient vos fichiers, vos workflows et leurs
            résultats. Créez-en un (ci-dessus) pour commencer.
          </p>
        </div>
      )}

      {confirmNode}

      {status === 'ready' && projects.length > 0 && (
        <div className="grid">
          {projects.map((p) => (
            <div
              key={p.id}
              className="card"
              {...clickableProps(() => onOpen(p.id), { label: `Ouvrir le projet ${p.name}` })}
            >
              <div className="card-title">{p.name}</div>
              <div className="card-sub">{p.id}</div>
              <div className="card-meta">
                <span title="Dernière activité">{fmtRelative(p.last_modified_ms) || '—'}</span>
                <span className="dot" aria-hidden="true">
                  ·
                </span>
                <span title="Workflows">
                  {p.workflow_count ?? 0} workflow{(p.workflow_count ?? 0) > 1 ? 's' : ''}
                </span>
                <span className="dot" aria-hidden="true">
                  ·
                </span>
                <span title="Fichiers importés">
                  {p.file_count ?? 0} fichier{(p.file_count ?? 0) > 1 ? 's' : ''}
                </span>
              </div>
              <button
                className="ghost danger small"
                onClick={(e) => remove(p.id, e)}
                aria-label={`Supprimer le projet ${p.name}`}
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
