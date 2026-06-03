import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '../api'
import { EditorContext } from './editorContext'
import SourceNode from './nodes/SourceNode'
import SqlNode from './nodes/SqlNode'
import DedupNode from './nodes/DedupNode'
import ValidateNode from './nodes/ValidateNode'
import PivotNode from './nodes/PivotNode'
import CleanNode from './nodes/CleanNode'
import CalcNode from './nodes/CalcNode'
import UnionNode from './nodes/UnionNode'
import ExportNode from './nodes/ExportNode'
import Inspector from './Inspector'
import DataPreview from './DataPreview'
import ButtonEdge from './ButtonEdge'
import Icon from './Icon'

const nodeTypes = {
  source: SourceNode, sql: SqlNode, dedup: DedupNode, validate: ValidateNode,
  pivot: PivotNode, clean: CleanNode, calc: CalcNode, union: UnionNode, export: ExportNode,
}
const edgeTypes = { deletable: ButtonEdge }

// data-type identity colours (must match CSS --t-*) for ports & links
const TYPE_COLOR = {
  source: '#4E79A7', sql: '#59734F', dedup: '#8d6ea0', validate: '#5b6bb0',
  pivot: '#b1605f', clean: '#4f9a93', calc: '#b05a86', union: '#8a7560', export: '#c08436',
}
// multi-output handles carry their own role colours
const HANDLE_COLOR = {
  kept: '#3f7a4f', dups: '#c0392f', uniques: '#3556a8',
  valid: '#3f7a4f', invalid: '#c0392f',
}

const DEFAULT_DATA = {
  source: { label: 'Source', file: '', sheet: '', header_row: 0 },
  sql: { label: 'SQL', mode: 'builder', query: { select: [], where: [], joins: [], group_by: [], order_by: [] } },
  dedup: { label: 'Doublons', key_columns: [], keep: 'first', dups_mode: 'all' },
  validate: { label: 'Validation', mode: 'rules', target_column: '', combine: 'all', case_sensitive: false, rules: [], segments: [], add_flag: false, add_reason: true },
  pivot: { label: 'Pivot', mode: 'pivot', index_columns: [], value_columns: [], pivot_column: '', value_column: '', agg: 'SUM', name_column: 'variable' },
  clean: { label: 'Nettoyage', operations: [] },
  calc: { label: 'Calcul', columns: [] },
  union: { label: 'Union', by_name: true, distinct: false },
  export: { label: 'Export', filename: 'resultat', format: 'xlsx' },
}

// Output anchors per node type (the first is the primary, used for the badge).
const NODE_OUTPUTS = {
  source: [{ handle: 'out', label: '' }],
  sql: [{ handle: 'out', label: '' }],
  pivot: [{ handle: 'out', label: '' }],
  clean: [{ handle: 'out', label: '' }],
  calc: [{ handle: 'out', label: '' }],
  union: [{ handle: 'out', label: '' }],
  export: [],
  dedup: [
    { handle: 'kept', label: 'Dédoublonné' },
    { handle: 'dups', label: 'Doublons' },
    { handle: 'uniques', label: 'Uniques' },
  ],
  validate: [
    { handle: 'valid', label: 'Conformes' },
    { handle: 'invalid', label: 'Non conformes' },
  ],
}

export default function WorkflowEditor(props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  )
}

function Editor({ pid, wid, onBack }) {
  const [wfName, setWfName] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedId, setSelectedId] = useState(null)
  const [files, setFiles] = useState([])
  const [schemas, setSchemas] = useState({})       // nodeId -> [{name,type}]
  const [status, setStatus] = useState({})         // nodeId -> {ran, rows, error}
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ active: false, total: 0, done: 0, currentId: null, currentLabel: '' })
  const [previewNode, setPreviewNode] = useState(null)
  const [previewPrefs, setPreviewPrefs] = useState({ tab: 'rows', column: null })
  const [banner, setBanner] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const loaded = useRef(false)
  const saveTimer = useRef(null)

  // ---- load ----
  useEffect(() => {
    let alive = true
    Promise.all([api.getWorkflow(pid, wid), api.listFiles(pid)]).then(([wf, fl]) => {
      if (!alive) return
      setWfName(wf.name)
      setNodes(wf.nodes || [])
      setEdges(wf.edges || [])
      setFiles(fl)
      // hydrate status/schemas from any previously materialized outputs
      for (const n of wf.nodes || []) {
        const handles = NODE_OUTPUTS[n.type] || [{ handle: 'out', label: '' }]
        handles.forEach((o, idx) => {
          api.preview(pid, wid, n.id, { limit: 1, handle: o.handle }).then((p) => {
            if (!alive || !p.available) return
            setStatus((s) => {
              const cur = s[n.id] || { ran: true, error: null, outputs: {} }
              const outs = { ...(cur.outputs || {}), [o.handle]: p.row_count }
              return {
                ...s,
                [n.id]: {
                  ran: true, error: null, outputs: outs,
                  rows: idx === 0 ? p.row_count : cur.rows,
                  cleanReport: p.clean_report || cur.cleanReport,
                },
              }
            })
            if (idx === 0) setSchemas((s) => ({ ...s, [n.id]: p.columns }))
          }).catch(() => {})
        })
      }
      setTimeout(() => { loaded.current = true }, 300)
    })
    return () => { alive = false }
  }, [pid, wid])

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!loaded.current) return
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.saveWorkflow(pid, { id: wid, name: wfName, nodes: stripNodes(nodes), edges })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [nodes, edges, wfName])

  // ---- auto-hide the progress bar shortly after completion ----
  useEffect(() => {
    if (!progress.active && progress.done > 0) {
      const t = setTimeout(() => setProgress((p) => (p.active ? p : { ...p, done: 0, total: 0 })), 2500)
      return () => clearTimeout(t)
    }
  }, [progress.active, progress.done])

  // ---- connections ----
  // Union accepts many edges on its single input; every other target handle
  // keeps a single incoming edge.
  const onConnect = useCallback((conn) => {
    const targetType = nodes.find((n) => n.id === conn.target)?.type
    setEdges((eds) => {
      const filtered = targetType === 'union'
        ? eds
        : eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
      return addEdge({ ...conn, animated: true }, filtered)
    })
  }, [setEdges, nodes])

  // ---- node helpers ----
  const addNode = (type) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`
    const n = nodes.length
    const node = {
      id, type,
      position: { x: 120 + (n % 4) * 80, y: 80 + n * 40 },
      data: JSON.parse(JSON.stringify(DEFAULT_DATA[type])),
    }
    setNodes((nds) => [...nds, node])
    setSelectedId(id)
  }

  const updateNodeData = useCallback((id, patch) => {
    setNodes((nds) => nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd))
  }, [setNodes])

  const onDeleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId))
  }, [setEdges])

  const deleteNode = (id) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const onSchema = useCallback((id, cols) => {
    setSchemas((s) => ({ ...s, [id]: cols }))
  }, [])

  // ---- run ----
  const flushSave = async () => {
    clearTimeout(saveTimer.current)
    await api.saveWorkflow(pid, { id: wid, name: wfName, nodes: stripNodes(nodes), edges })
    setSaveState('saved')
  }

  const applyOneResult = (nid, r) => {
    setStatus((prev) => ({
      ...prev,
      [nid]: {
        ran: true, rows: r.row_count ?? r.rows ?? 0, error: null,
        outputs: r.outputs || {}, cleanReport: r.clean_report, locked: r.locked,
      },
    }))
    if (r.columns) setSchemas((prev) => ({ ...prev, [nid]: r.columns }))
  }

  // Streaming run: live progress, ComfyUI-style.
  const doRun = async (onlyNode = null) => {
    if (busy) return
    setBanner(null)
    setBusy(true)
    setProgress({ active: true, total: 0, done: 0, currentId: null, currentLabel: 'préparation…' })
    await flushSave()
    const cleaned = []
    api.runStream(pid, wid, onlyNode, (ev) => {
      if (ev.event === 'start') {
        setProgress({ active: true, total: ev.total, done: 0, currentId: null, currentLabel: '' })
      } else if (ev.event === 'node_start') {
        setProgress((p) => ({ ...p, currentId: ev.node_id, currentLabel: ev.label || ev.type }))
      } else if (ev.event === 'node_done') {
        applyOneResult(ev.node_id, ev.result)
        if (Array.isArray(ev.result?.clean_report)) cleaned.push(ev.node_id)
        setProgress((p) => ({ ...p, done: p.done + 1, currentId: null }))
      } else if (ev.event === 'done') {
        setBusy(false)
        setProgress((p) => ({ ...p, active: false, currentId: null, done: p.total }))
        api.listFiles(pid).then(setFiles)
        if (cleaned.length === 1) setPreviewNode({ id: cleaned[0], tab: 'clean' })
        else if (cleaned.length > 1) setBanner({ type: 'info', text: `${cleaned.length} bloc(s) de nettoyage exécutés — cliquez l'icône « rapport » sur un bloc pour voir son rapport.` })
      } else if (ev.event === 'error') {
        setBusy(false)
        setProgress((p) => ({ ...p, active: false, currentId: null }))
        if (ev.node_id) setStatus((s) => ({ ...s, [ev.node_id]: { ...(s[ev.node_id] || {}), error: ev.message, ran: false } }))
        setBanner({ type: 'error', text: ev.message || "Erreur d'exécution" })
        api.listFiles(pid).then(setFiles)
      }
    })
  }

  // ---- inputs for the selected SQL node ----
  const selectedNode = nodes.find((n) => n.id === selectedId) || null
  const inspectorInputs = useMemo(() => {
    const withInputs = ['sql', 'dedup', 'validate', 'pivot', 'clean', 'calc', 'union']
    if (!selectedNode || !withInputs.includes(selectedNode.type)) return []
    const ins = edges
      .filter((e) => e.target === selectedNode.id)
      .map((e) => ({
        alias: e.targetHandle || 'in1',
        sourceId: e.source,
        columns: schemas[e.source] || [],
        label: nodes.find((n) => n.id === e.source)?.data?.label || e.source,
      }))
    ins.sort((a, b) => a.alias.localeCompare(b.alias))
    return ins
  }, [selectedNode, edges, schemas, nodes])

  const ctx = useMemo(() => ({
    status,
    running: progress.active ? progress.currentId : null,
    onPreview: (id, tab) => setPreviewNode({ id, tab }),
    onRunNode: (id) => doRun(id),
    onDeleteEdge,
  }), [status, progress.active, progress.currentId, nodes, edges, wfName, onDeleteEdge])

  // highlight the currently-executing node (ComfyUI-style)
  const decoratedNodes = useMemo(
    () => nodes.map((n) => (progress.currentId === n.id ? { ...n, className: 'rf-active' } : n)),
    [nodes, progress.currentId])

  // colour links by the data type leaving the source port; make them deletable
  const decoratedEdges = useMemo(() => {
    const typeOf = (id) => nodes.find((n) => n.id === id)?.type
    return edges.map((e) => {
      const t = typeOf(e.source)
      const color = HANDLE_COLOR[e.sourceHandle] || TYPE_COLOR[t] || '#9aa3b2'
      return { ...e, type: 'deletable', animated: false, style: { ...e.style, stroke: color } }
    })
  }, [edges, nodes])

  const previewId = previewNode?.id
  const previewLabel = nodes.find((n) => n.id === previewId)?.data?.label || previewId

  return (
    <EditorContext.Provider value={ctx}>
      <div className="editor">
        <div className="editor-toolbar">
          <button className="ghost" onClick={onBack}>← Projet</button>
          <input className="wf-name" value={wfName} onChange={(e) => setWfName(e.target.value)} />
          <div className="tb-add">
            <button className="chip src" onClick={() => addNode('source')}><span className="swatch" />Source</button>
            <button className="chip sql" onClick={() => addNode('sql')}><span className="swatch" />SQL</button>
            <button className="chip dup" onClick={() => addNode('dedup')}><span className="swatch" />Doublons</button>
            <button className="chip val" onClick={() => addNode('validate')}><span className="swatch" />Validation</button>
            <button className="chip piv" onClick={() => addNode('pivot')}><span className="swatch" />Pivot</button>
            <button className="chip cln" onClick={() => addNode('clean')}><span className="swatch" />Nettoyage</button>
            <button className="chip calc" onClick={() => addNode('calc')}><span className="swatch" />Calcul</button>
            <button className="chip uni" onClick={() => addNode('union')}><span className="swatch" />Union</button>
            <button className="chip exp" onClick={() => addNode('export')}><span className="swatch" />Export</button>
          </div>
          <div className="tb-right">
            <span className={`save ${saveState}`}>
              {saveState === 'saving' ? 'enregistrement…' : saveState === 'error' ? 'erreur de sauvegarde' : 'enregistré'}
            </span>
            <button className="primary" disabled={busy} onClick={() => doRun(null)}>
              {busy ? 'Exécution…' : 'Exécuter le workflow'}
            </button>
          </div>
        </div>

        <div className="editor-main">
          {/* overlays float above the canvas so nothing shifts when they appear */}
          <div className="overlays">
            <ProgressBar progress={progress} />
            {banner && <div className={`banner ${banner.type}`}>{banner.text}<button className="ghost small" onClick={() => setBanner(null)}><Icon name="x" /></button></div>}
          </div>
          <div className="canvas">
            <ReactFlow
              nodes={decoratedNodes}
              edges={decoratedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={(dl) => setEdges((eds) => eds.filter((e) => !dl.some((n) => n.id === e.source || n.id === e.target)))}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: 'deletable' }}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} color="#e3e6ee" />
              <Controls />
              <MiniMap pannable zoomable nodeColor={miniColor} />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="canvas-hint">
                Ajoutez un bloc <b>📥 Source</b> pour commencer, puis reliez-le à un bloc <b>🧮 SQL</b>.
              </div>
            )}
          </div>

          <Inspector
            pid={pid}
            node={selectedNode}
            files={files}
            inputs={inspectorInputs}
            onChange={updateNodeData}
            onSchema={onSchema}
            onDelete={deleteNode}
          />
        </div>

        {previewNode && (
          <DataPreview
            pid={pid} wid={wid} nodeId={previewId} label={previewLabel}
            initialTab={previewNode.tab || previewPrefs.tab}
            initialColumn={previewPrefs.column}
            onNav={(prefs) => setPreviewPrefs(prefs)}
            outputs={NODE_OUTPUTS[nodes.find((n) => n.id === previewId)?.type] || [{ handle: 'out', label: '' }]}
            onClose={() => setPreviewNode(null)}
          />
        )}
      </div>
    </EditorContext.Provider>
  )
}

function ProgressBar({ progress }) {
  if (!progress.active && progress.done === 0) return null
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className={`progress-wrap ${progress.active ? 'on' : 'off'}`}>
      <div className={`progress-track ${progress.active ? 'busy' : ''}`}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">
        {progress.active ? (
          <>
            <span className="pulse-dot" />
            {progress.currentLabel ? <>Exécution : <b>{progress.currentLabel}</b></> : 'Exécution…'}
            {progress.total > 0 && <span className="pmeta"> · {progress.done}/{progress.total}</span>}
          </>
        ) : (
          <span className="done-text">Terminé · {progress.total} bloc(s)</span>
        )}
      </div>
    </div>
  )
}

function miniColor(n) {
  return TYPE_COLOR[n.type] || '#999'
}

// React Flow adds transient UI fields; persist only what we need.
function stripNodes(nodes) {
  return nodes.map((n) => ({
    id: n.id, type: n.type, position: n.position, data: n.data,
  }))
}
