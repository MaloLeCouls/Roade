import { useEffect, useState } from 'react'
import { api } from '../api'

export default function ProjectList({ onOpen }) {
  const [projects, setProjects] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = () => api.listProjects().then((p) => { setProjects(p); setLoading(false) })
  useEffect(() => { reload() }, [])

  const create = async () => {
    if (!name.trim()) return
    const p = await api.createProject(name.trim())
    setName('')
    await reload()
    onOpen(p.id)
  }

  const remove = async (pid, e) => {
    e.stopPropagation()
    if (!confirm('Supprimer ce projet et tout son contenu ?')) return
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
          <button className="primary" onClick={create}>Créer</button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : projects.length === 0 ? (
        <div className="empty">Aucun projet. Créez-en un pour commencer.</div>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <div key={p.id} className="card" onClick={() => onOpen(p.id)}>
              <div className="card-title">{p.name}</div>
              <div className="card-sub">{p.id}</div>
              <button className="ghost danger small" onClick={(e) => remove(p.id, e)}>
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
