import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

export default function ProjectView({ pid, onOpenWorkflow }) {
  const [project, setProject] = useState(null)
  const [files, setFiles] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [wfName, setWfName] = useState('')
  const fileInput = useRef()

  const reload = async () => {
    setProject(await api.getProject(pid))
    setFiles(await api.listFiles(pid))
    setWorkflows(await api.listWorkflows(pid))
  }
  useEffect(() => { reload() }, [pid])

  const upload = async (e) => {
    const list = Array.from(e.target.files || [])
    for (const f of list) await api.uploadFile(pid, f)
    fileInput.current.value = ''
    setFiles(await api.listFiles(pid))
  }

  const delFile = async (name) => {
    if (!confirm(`Supprimer ${name} ?`)) return
    await api.deleteFile(pid, name)
    setFiles(await api.listFiles(pid))
  }

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

  if (!project) return <div className="page"><p className="muted">Chargement…</p></div>

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
            <h2>Fichiers sources</h2>
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
          {files.length === 0 ? (
            <div className="empty small">Aucun fichier. Importez vos Excel/CSV.</div>
          ) : (
            <ul className="list">
              {files.map((f) => (
                <li key={f.name}>
                  <span className="fname"><Icon name="file" size={13} /> {f.name}</span>
                  <span className="fsize">{fmtSize(f.size)}</span>
                  <a className="ghost small" href={api.downloadUrl(pid, f.name)} title="Télécharger"><Icon name="download" /></a>
                  <button className="ghost danger small" onClick={() => delFile(f.name)} title="Supprimer"><Icon name="trash" /></button>
                </li>
              ))}
            </ul>
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
              <button className="primary small" onClick={createWf}>Nouveau</button>
            </div>
          </div>
          {workflows.length === 0 ? (
            <div className="empty small">Aucun workflow.</div>
          ) : (
            <ul className="list">
              {workflows.map((w) => (
                <li key={w.id} className="clickable" onClick={() => onOpenWorkflow(w.id)}>
                  <span className="fname"><Icon name="flow" size={13} /> {w.name}</span>
                  <button className="ghost danger small" onClick={(e) => delWf(w.id, e)} title="Supprimer"><Icon name="trash" /></button>
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
