import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

export default function ProjectView({ pid, onOpenWorkflow }) {
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [wfName, setWfName] = useState('')
  // C.5 — { name, index, total, progress: 0..1 } pendant un upload (sinon null).
  const [uploading, setUploading] = useState(null)
  const fileInput = useRef()

  const reload = async () => {
    setProject(await api.getProject(pid))
    setFiles(await api.listFiles(pid))
    setWorkflows(await api.listWorkflows(pid))
  }
  useEffect(() => {
    reload()
  }, [pid])

  const upload = async (e) => {
    const list = Array.from(e.target.files || [])
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      setUploading({ name: f.name, index: i + 1, total: list.length, progress: 0 })
      await api.uploadFile(pid, f, (p) => setUploading((u) => u && { ...u, progress: p }))
    }
    setUploading(null)
    fileInput.current.value = ''
    setFiles(await api.listFiles(pid))
  }

  const delFile = async (name, subdir) => {
    if (!confirm(`Supprimer ${name} ?`)) return
    await api.deleteFile(pid, name, subdir)
    setFiles(await api.listFiles(pid))
  }

  const openFile = async (name, subdir) => {
    try {
      await api.openFile(pid, name, subdir)
    } catch (e) {
      alert(`Impossible d'ouvrir le fichier : ${e.message}`)
    }
  }

  const fileRow = (f) => (
    <li key={`${f.subdir || ''}/${f.name}`}>
      <span className="fname">
        <Icon name="file" size={13} /> {f.name}
      </span>
      <span className="fsize">{fmtSize(f.size)}</span>
      <button
        className="ghost small"
        onClick={() => openFile(f.name, f.subdir)}
        title="Ouvrir dans l'application par défaut"
      >
        <Icon name="external" />
      </button>
      <a className="ghost small" href={api.downloadUrl(pid, f.name, f.subdir)} title="Télécharger">
        <Icon name="download" />
      </a>
      <button
        className="ghost danger small"
        onClick={() => delFile(f.name, f.subdir)}
        title="Supprimer"
      >
        <Icon name="trash" />
      </button>
    </li>
  )

  const createWf = async () => {
    const n = wfName.trim() || 'Nouveau workflow'
    const wf = await api.createWorkflow(pid, n)
    setWfName('')
    onOpenWorkflow(wf.id)
  }

  const delWf = async (wid, e) => {
    e.stopPropagation()
    if (!confirm('Supprimer ce workflow ?')) return
    await api.deleteWorkflow(pid, wid)
    setWorkflows(await api.listWorkflows(pid))
  }

  if (!project)
    return (
      <div className="page">
        <p className="muted">Chargement…</p>
      </div>
    )

  const sources = files.filter((f) => f.origin !== 'export')
  const exportFiles = files.filter((f) => f.origin === 'export')
  // Group exports by their workflow folder so the panel mirrors the on-disk
  // layout (exports/<wf>/...). Workflows without a subdir share one bucket.
  const exportsByWf = exportFiles.reduce((acc, f) => {
    const key = f.subdir || ''
    ;(acc[key] = acc[key] || []).push(f)
    return acc
  }, {})

  return (
    <div className="page">
      <div className="page-head">
        <h1>{project.name}</h1>
        {project.dir && (
          <div className="dirpath" title="Répertoire du projet sur le disque">
            <Icon name="folder" size={13} /> {project.dir}
          </div>
        )}
      </div>

      <div className="cols">
        <section className="panel">
          <div className="panel-head">
            <h2>Fichiers</h2>
            <button className="primary small" onClick={() => fileInput.current.click()}>
              Importer
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt,.parquet"
              style={{ display: 'none' }}
              onChange={upload}
            />
          </div>
          {uploading && (
            <div className="upload-progress" role="status" aria-live="polite">
              <div className="upload-progress-label">
                {uploading.total > 1
                  ? `Import ${uploading.index}/${uploading.total} — `
                  : 'Import — '}
                <span className="upload-progress-name">{uploading.name}</span>
                <span className="upload-progress-pct">{Math.round(uploading.progress * 100)}%</span>
              </div>
              <div className="upload-progress-bar">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${Math.round(uploading.progress * 100)}%` }}
                />
              </div>
            </div>
          )}
          {files.length === 0 ? (
            <div className="empty small">Aucun fichier. Importez vos Excel/CSV.</div>
          ) : (
            <>
              {sources.length > 0 && (
                <div className="file-group">
                  <div className="file-group-head">
                    Sources <span className="fg-count">{sources.length}</span>
                  </div>
                  <ul className="list">{sources.map(fileRow)}</ul>
                </div>
              )}
              {exportFiles.length > 0 && (
                <div className="file-group">
                  <div className="file-group-head">
                    Exports générés <span className="fg-count">{exportFiles.length}</span>
                  </div>
                  {Object.keys(exportsByWf)
                    .sort()
                    .map((wf) => (
                      <div key={wf} className="file-subgroup">
                        <div className="file-subgroup-head">
                          <Icon name="folder" size={12} /> {wf || '(racine)'}
                        </div>
                        <ul className="list">{exportsByWf[wf].map(fileRow)}</ul>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Workflows</h2>
            <div className="row">
              <input
                placeholder="Nom…"
                value={wfName}
                onChange={(e) => setWfName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createWf()}
              />
              <button className="primary small" onClick={createWf}>
                Nouveau
              </button>
            </div>
          </div>
          {workflows.length === 0 ? (
            <div className="empty small">Aucun workflow.</div>
          ) : (
            <ul className="list">
              {workflows.map((w) => (
                <li key={w.id} className="clickable" onClick={() => onOpenWorkflow(w.id)}>
                  <span className="fname">
                    <Icon name="flow" size={13} /> {w.name}
                  </span>
                  <button
                    className="ghost danger small"
                    onClick={(e) => delWf(w.id, e)}
                    title="Supprimer"
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function fmtSize(n) {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}
