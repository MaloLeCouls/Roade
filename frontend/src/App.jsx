import { useEffect, useState } from 'react'
import { api } from './api'
import ProjectList from './components/ProjectList'
import ProjectView from './components/ProjectView'
import WorkflowEditor from './components/WorkflowEditor'

export default function App() {
  // view: {name: 'projects'} | {name: 'project', pid} | {name: 'workflow', pid, wid}
  const [view, setView] = useState({ name: 'projects' })

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setView({ name: 'projects' })}>
          Roade
        </div>
        <Breadcrumb view={view} setView={setView} />
      </header>

      {view.name === 'projects' && (
        <ProjectList onOpen={(pid) => setView({ name: 'project', pid })} />
      )}
      {view.name === 'project' && (
        <ProjectView
          pid={view.pid}
          onOpenWorkflow={(wid) => setView({ name: 'workflow', pid: view.pid, wid })}
          onBack={() => setView({ name: 'projects' })}
        />
      )}
      {view.name === 'workflow' && (
        <WorkflowEditor
          pid={view.pid}
          wid={view.wid}
          onBack={() => setView({ name: 'project', pid: view.pid })}
        />
      )}
    </div>
  )
}

function Breadcrumb({ view, setView }) {
  const [pname, setPname] = useState(null)
  useEffect(() => {
    if (view.pid) api.getProject(view.pid).then((p) => setPname(p.name)).catch(() => {})
  }, [view.pid])
  return (
    <div className="breadcrumb">
      <span className="crumb" onClick={() => setView({ name: 'projects' })}>Projets</span>
      {view.pid && (
        <>
          <span className="sep">/</span>
          <span className="crumb" onClick={() => setView({ name: 'project', pid: view.pid })}>
            {pname || view.pid}
          </span>
        </>
      )}
      {view.name === 'workflow' && (
        <>
          <span className="sep">/</span>
          <span className="crumb current">workflow</span>
        </>
      )}
    </div>
  )
}
