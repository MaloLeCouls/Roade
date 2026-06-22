import { useCallback, useEffect, useState } from 'react'

import { api } from './api'
import { clickableProps } from './lib/a11y'
import ProjectList from './components/ProjectList'
import ProjectView from './components/ProjectView'
import Toaster from './components/Toaster'
import WorkflowEditor from './components/WorkflowEditor'

// C.1 — l'URL est la source de vérité de l'écran courant.
//   /                   → liste des projets
//   /p/<pid>            → écran projet
//   /p/<pid>/w/<wid>    → éditeur de workflow
// F5 restaure exactement l'emplacement ; le « précédent » navigateur fonctionne ;
// un lien copié-collé ouvre directement le bon écran.
function parseLocation() {
  const path = window.location.pathname
  const mw = path.match(/^\/p\/([^/]+)\/w\/([^/]+)\/?$/)
  if (mw) {
    return {
      name: 'workflow',
      pid: decodeURIComponent(mw[1]),
      wid: decodeURIComponent(mw[2]),
    }
  }
  const mp = path.match(/^\/p\/([^/]+)\/?$/)
  if (mp) return { name: 'project', pid: decodeURIComponent(mp[1]) }
  return { name: 'projects' }
}

function viewToPath(v) {
  if (v.name === 'workflow') {
    return `/p/${encodeURIComponent(v.pid)}/w/${encodeURIComponent(v.wid)}`
  }
  if (v.name === 'project') return `/p/${encodeURIComponent(v.pid)}`
  return '/'
}

export default function App() {
  const [view, setView] = useState(parseLocation)

  // Sync URL ← state. On utilise pushState quand l'utilisateur navigue ;
  // un replaceState au démarrage évite de polluer l'historique d'une entrée
  // identique à l'URL déjà chargée.
  useEffect(() => {
    const target = viewToPath(view)
    if (window.location.pathname !== target) {
      window.history.pushState(view, '', target)
    }
  }, [view])

  // Sync state ← URL (back/forward navigateur).
  useEffect(() => {
    const onPop = () => setView(parseLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goProjects = useCallback(() => setView({ name: 'projects' }), [])
  const goProject = useCallback((pid) => setView({ name: 'project', pid }), [])
  const goWorkflow = useCallback((pid, wid) => setView({ name: 'workflow', pid, wid }), [])

  return (
    <div className="app">
      <header className="topbar">
        <div
          className="brand"
          {...clickableProps(goProjects, { label: 'Retour à la liste des projets' })}
        >
          Roade
        </div>
        <Breadcrumb view={view} setView={setView} />
      </header>

      {view.name === 'projects' && <ProjectList onOpen={goProject} onOpenWorkflow={goWorkflow} />}
      {view.name === 'project' && (
        <ProjectView
          pid={view.pid}
          onOpenWorkflow={(wid) => goWorkflow(view.pid, wid)}
          onBack={goProjects}
        />
      )}
      {view.name === 'workflow' && (
        <WorkflowEditor pid={view.pid} wid={view.wid} onBack={() => goProject(view.pid)} />
      )}

      <Toaster />
    </div>
  )
}

function Breadcrumb({ view, setView }) {
  const [pname, setPname] = useState(null)
  const [wname, setWname] = useState(null)
  useEffect(() => {
    if (view.pid)
      api
        .getProject(view.pid)
        .then((p) => setPname(p.name))
        .catch(() => {})
  }, [view.pid])
  // C.2 — la dernière crumb disait littéralement « workflow ». On va chercher
  // le nom réel pour que le fil d'Ariane soit lisible (« Reporting Q3 »).
  useEffect(() => {
    if (view.name !== 'workflow' || !view.pid || !view.wid) {
      setWname(null)
      return
    }
    api
      .getWorkflow(view.pid, view.wid)
      .then((w) => setWname(w.name))
      .catch(() => {})
  }, [view.name, view.pid, view.wid])
  return (
    <nav className="breadcrumb" aria-label="Fil d'Ariane">
      <span className="crumb" {...clickableProps(() => setView({ name: 'projects' }))}>
        Projets
      </span>
      {view.pid && (
        <>
          <span className="sep" aria-hidden="true">
            /
          </span>
          <span
            className="crumb"
            {...clickableProps(() => setView({ name: 'project', pid: view.pid }))}
          >
            {pname || view.pid}
          </span>
        </>
      )}
      {view.name === 'workflow' && (
        <>
          <span className="sep" aria-hidden="true">
            /
          </span>
          <span className="crumb current" aria-current="page">
            {wname || 'Workflow'}
          </span>
        </>
      )}
    </nav>
  )
}
