import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, useReactFlow, useUpdateNodeInternals, SelectionMode,
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
import FilterNode from './nodes/FilterNode'
import ColsNode from './nodes/ColsNode'
import ReportNode from './nodes/ReportNode'
import UnionNode from './nodes/UnionNode'
import ExportNode from './nodes/ExportNode'
import GroupNode from './nodes/GroupNode'
import StopNode from './nodes/StopNode'
import DataPreview from './DataPreview'
import BlockEditor from './BlockEditor'
import WorkflowFlow from './WorkflowFlow'
import { normalizeValidateData, uid } from './validateHelpers'
import ButtonEdge from './ButtonEdge'
import Icon from './Icon'

// --- change tracking (mirror of backend engine._node_signature) -------------
// A node's "data signature" excludes cosmetic keys so that only changes which
// affect the computed result mark it (and its descendants) as stale.
const SIG_IGNORE_TOP = new Set(['label', 'description', 'locked', 'cache', '__dirty'])
function cleanForSig(o) {
  if (Array.isArray(o)) return o.map(cleanForSig)
  if (o && typeof o === 'object') {
    const r = {}
    for (const k of Object.keys(o)) if (k !== 'test_samples') r[k] = cleanForSig(o[k])
    return r
  }
  return o
}
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}'
}
function nodeDataSig(data) {
  const d = {}
  for (const k of Object.keys(data || {})) if (!SIG_IGNORE_TOP.has(k)) d[k] = data[k]
  return stableStringify(cleanForSig(d))
}

// Source handles a Validation route block currently exposes (output ids + the
// optional `else` bucket). Anything else is a ghost handle from a previous
// config — used to detect and prune orphan edges below.
function routeHandles(data) {
  if (!data) return null
  const ids = (data.outputs || []).map((o) => o?.id).filter(Boolean)
  if (data.else_enabled !== false) ids.push('else')
  return new Set(ids)
}
function removedRouteHandles(node, patch) {
  if (node?.type !== 'validate') return new Set()
  const before = node.data?.mode === 'route' ? routeHandles(node.data) : null
  const after = node.data?.mode === 'route' || patch.mode === 'route'
    ? routeHandles({ ...node.data, ...patch })
    : null
  // Switching out of 'route' mode removes every custom handle the route used to
  // expose; without a `before` snapshot there is nothing to compare.
  if (!before) return new Set()
  const gone = new Set()
  for (const h of before) if (!after || !after.has(h)) gone.add(h)
  return gone
}

// Render the block's free-text comment (data.description) as a sticky note above
// the node — lets the user document the workflow at a glance. One wrapper instead
// of editing all nine node components. Also shows a discreet "modified since last
// run" dot (data.__dirty, injected by the editor).
function withComment(Comp) {
  return function Commented(props) {
    const note = props.data?.description
    return (
      <>
        {note ? <div className="node-comment">{note}</div> : null}
        {props.data?.__dirty ? (
          <span className="node-dirty" title="Modifié depuis la dernière exécution — sera recalculé" />
        ) : null}
        <Comp {...props} />
      </>
    )
  }
}
const nodeTypes = {
  source: withComment(SourceNode), sql: withComment(SqlNode), dedup: withComment(DedupNode),
  validate: withComment(ValidateNode), pivot: withComment(PivotNode), clean: withComment(CleanNode),
  calc: withComment(CalcNode), filter: withComment(FilterNode), cols: withComment(ColsNode),
  report: withComment(ReportNode), union: withComment(UnionNode), export: withComment(ExportNode),
  frame: GroupNode, stop: StopNode,
}
const edgeTypes = { deletable: ButtonEdge }

// data-type identity colours (must match CSS --t-*) for ports & links
const TYPE_COLOR = {
  source: '#4E79A7', sql: '#59734F', dedup: '#8d6ea0', validate: '#5b6bb0',
  pivot: '#b1605f', clean: '#4f9a93', calc: '#b05a86', filter: '#3f8c8c', cols: '#7a6cb0',
  report: '#6b8e3d', union: '#8a7560', export: '#c08436',
  frame: '#5b6bb0', stop: '#7d8590',
}
// multi-output handles carry their own role colours
const HANDLE_COLOR = {
  kept: '#3f7a4f', dups: '#c0392f', uniques: '#3556a8',
  valid: '#3f7a4f', invalid: '#c0392f',
}
// quick palette for colouring a frame (right-click → couleur du cadre)
const FRAME_COLORS = ['#5b6bb0', '#4E79A7', '#59A14F', '#E1A33A', '#B05A86', '#7d8590']

const DEFAULT_DATA = {
  source: { label: 'Source', file: '', sheet: '', header_row: 0, cache: true },
  sql: { label: 'SQL', mode: 'builder', query: { select: [], where: [], joins: [], group_by: [], order_by: [] } },
  dedup: { label: 'Doublons', key_columns: [], keep: 'first', dups_mode: 'all' },
  validate: {
    label: 'Validation', mode: 'route', intent: 'control',
    target_column: '', case_sensitive: false, routing: 'first',
    conditions: [{ id: 'c1', name: 'Conforme', kind: 'rules', column: '', groups: [], segments: [], test_samples: '' }],
    outputs: [
      { id: 'valid', label: 'Conformes', color: '#59A14F', match: { conditionId: 'c1', negate: false } },
      { id: 'invalid', label: 'Non conformes', color: '#E15759', match: { conditionId: 'c1', negate: true } },
    ],
    else_enabled: false, else_label: 'Non classé', else_color: '#9aa3b2',
    add_flag: false, test_samples: '',
  },
  pivot: { label: 'Pivot', mode: 'pivot', index_columns: [], value_columns: [], pivot_column: '', value_column: '', agg: 'SUM', name_column: 'variable' },
  clean: { label: 'Nettoyage', operations: [] },
  calc: { label: 'Calcul', columns: [] },
  filter: { label: 'Filtre', mode: 'keep', column: '', ref_column: '', case_insensitive: false },
  cols: { label: 'Colonnes', columns: [] },
  report: { label: 'Analyse', note: '', columns: [] },
  union: { label: 'Union', by_name: true, distinct: false },
  export: { label: 'Export', filename: 'resultat', format: 'xlsx', auto_name: true, enabled: true, to_workbook: false },
  frame: { label: 'Groupe', w: 460, h: 300, color: '#5b6bb0' },
  stop: { label: 'Bouchon', note: '' },
}

// The "add a block" palette (replaces a long chip row that overflowed the toolbar).
const BLOCK_PALETTE = [
  ['source', 'Source', 'Lit un fichier Excel/CSV'],
  ['sql', 'SQL', 'Sélection, filtres, jointures, regroupements'],
  ['dedup', 'Doublons', 'Repère / sépare les doublons'],
  ['validate', 'Validation', 'Classe les lignes selon des conditions'],
  ['pivot', 'Pivot', 'Pivote / dépivote (tableau croisé)'],
  ['clean', 'Nettoyage', 'Opérations de nettoyage en série'],
  ['calc', 'Calcul', 'Colonnes calculées (formules)'],
  ['filter', 'Filtre', 'Garde / exclut selon un autre tableau'],
  ['cols', 'Colonnes', 'Réordonne / supprime / renomme'],
  ['report', 'Analyse', 'État des lieux des données (reporting)'],
  ['union', 'Union', 'Empile plusieurs entrées'],
  ['export', 'Export', 'Écrit un fichier de sortie'],
  ['frame', 'Cadre', 'Regroupe visuellement des blocs'],
  ['stop', 'Bouchon', 'Marque une sortie laissée fermée volontairement (note au survol)'],
]

// Blocks that can be dropped *onto a link* (split the link in two): they consume
// an input and emit an output, so they fit mid-chain. Sources (no input) and the
// terminal sinks export/report are excluded.
const INSERTABLE = new Set(['sql', 'dedup', 'validate', 'pivot', 'clean', 'calc', 'filter', 'cols', 'union'])

// Output anchors per node type (the first is the primary, used for the badge).
const NODE_OUTPUTS = {
  source: [{ handle: 'out', label: '' }],
  sql: [{ handle: 'out', label: '' }],
  pivot: [{ handle: 'out', label: '' }],
  clean: [{ handle: 'out', label: '' }],
  calc: [{ handle: 'out', label: '' }],
  filter: [{ handle: 'out', label: '' }],
  cols: [{ handle: 'out', label: '' }],
  union: [{ handle: 'out', label: '' }],
  // report materializes its input (so it stays previewable) but renders no output
  // anchor — it is a terminal "analysis" sink.
  report: [{ handle: 'out', label: '' }],
  export: [],
  frame: [],
  stop: [],
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

// Output handles for a node — dynamic for a validate block in 'route' mode
// (user-defined outputs + optional 'else'). Mirrors backend _output_handles.
function nodeOutputs(node) {
  if (!node) return [{ handle: 'out', label: '' }]
  if (node.type === 'frame' || node.type === 'stop') return []   // produce no data
  if (node.type === 'validate' && node.data?.mode === 'route') {
    const outs = (node.data.outputs || []).map((o) => ({ handle: o.id, label: o.label || o.id, color: o.color }))
    if (node.data.else_enabled !== false) {
      outs.push({ handle: 'else', label: node.data.else_label || 'Non classé', color: node.data.else_color || '#9aa3b2' })
    }
    return outs.length ? outs : [{ handle: 'else', label: 'Non classé', color: '#9aa3b2' }]
  }
  return NODE_OUTPUTS[node.type] || [{ handle: 'out', label: '' }]
}

function outputColorOf(node, handle) {
  if (node?.type === 'validate' && node.data?.mode === 'route') {
    const o = (node.data.outputs || []).find((x) => x.id === handle)
    if (o) return o.color
    if (handle === 'else') return node.data.else_color || '#9aa3b2'
  }
  return null
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
  const [runStamps, setRunStamps] = useState({})   // nodeId -> data-sig at last run (change tracking)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ active: false, total: 0, done: 0, currentId: null, currentLabel: '' })
  const [nodeFrac, setNodeFrac] = useState(0)            // animated sub-progress of the running node
  const [, setElapsedTick] = useState(0)                 // 1 Hz re-render so the run timer stays live
  const [previewNode, setPreviewNode] = useState(null)
  const [editorNode, setEditorNode] = useState(null)     // nodeId of the full-screen block editor
  const [flowOpen, setFlowOpen] = useState(false)        // global workflow flow map
  const [menu, setMenu] = useState(null)                 // right-click context menu {id, x, y}
  const [runMenu, setRunMenu] = useState(false)          // run-button dropdown (force recompute)
  const [addMenu, setAddMenu] = useState(false)          // "add a block" palette dropdown
  const [selectMode, setSelectMode] = useState(false)    // box-selection mode (select many blocks → bulk delete)
  const [previewPrefs, setPreviewPrefs] = useState({ tab: 'rows', column: null })
  const [banner, setBanner] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const loaded = useRef(false)
  const saveTimer = useRef(null)
  const anim = useRef({ timer: null, start: 0, est: 0 })   // per-node progress animation
  const startTimer = useRef(null)                          // deferred "running" indication
  const canvasRef = useRef(null)
  const groupDrag = useRef(null)                           // snapshot while dragging a frame
  const rf = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()

  // ---- load ----
  useEffect(() => {
    let alive = true
    Promise.all([api.getWorkflow(pid, wid), api.listFiles(pid)]).then(([wf, fl]) => {
      if (!alive) return
      // upgrade legacy validate blocks to the unified model, and rename the old
      // reserved 'group' frame type to 'frame' (the reserved name pulled in React
      // Flow's default node box, producing a duplicate outer rectangle).
      const nodes0 = (wf.nodes || []).map((nd) => {
        if (nd.type === 'group') return { ...nd, type: 'frame' }
        return nd.type === 'validate' ? { ...nd, data: normalizeValidateData(nd.data) } : nd
      })
      // Legacy stops were linked by a regular edge — migrate each such edge into
      // a parentId attachment so the cap glues directly to the source block. The
      // edge is then dropped, and existing data.attachedTo (saved post-migration)
      // wins if both are present.
      const edges0 = wf.edges || []
      const stopAttach = new Map()
      for (const e of edges0) {
        const tgt = nodes0.find((n) => n.id === e.target)
        if (tgt?.type === 'stop' && !stopAttach.has(tgt.id)) {
          stopAttach.set(tgt.id, { sourceId: e.source, sourceHandle: e.sourceHandle || 'out' })
        }
      }
      const migrated = nodes0.map((n) => {
        if (n.type !== 'stop') return n
        const at = n.data?.attachedTo || stopAttach.get(n.id)
        if (!at) return n
        return {
          ...n,
          parentId: at.sourceId,
          // a default offset; the user can detach + reattach for a precise spot.
          position: n.parentId === at.sourceId && n.position ? n.position : { x: 210, y: 6 },
          data: { ...n.data, attachedTo: at },
        }
      })
      const ordered = orderParentsFirst(migrated)
      const cleanEdges = edges0.filter((e) => {
        const tgt = nodes0.find((n) => n.id === e.target)
        return tgt?.type !== 'stop'
      })
      setWfName(wf.name)
      setNodes(ordered)
      setEdges(cleanEdges)
      setFiles(fl)
      // hydrate status/schemas from any previously materialized outputs
      for (const n of nodes0) {
        const handles = nodeOutputs(n)
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
            if (idx === 0) {
              setSchemas((s) => ({ ...s, [n.id]: p.columns }))
              // assume the saved config matches the materialized output, so a
              // freshly-loaded workflow shows nothing stale until it's edited.
              setRunStamps((s) => ({ ...s, [n.id]: nodeDataSig(n.data) }))
            }
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

  // stop the progress animation if the editor unmounts mid-run
  useEffect(() => () => { if (anim.current.timer) clearInterval(anim.current.timer) }, [])

  // ---- stop attach/detach ----
  // A "stop" cap glues to the source block instead of being wired by an edge:
  // we set parentId on the stop and position it next to the source's output
  // handle. React Flow then moves the cap along with the parent automatically.
  const STOP_CAP_HALF = 11   // half height of the round cap (matches CSS)
  const attachStop = useCallback((stopId, sourceId, sourceHandle) => {
    const handle = sourceHandle || 'out'
    const src = rf.getInternalNode(sourceId)
    const bounds = src?.internals?.handleBounds?.source || []
    const h = bounds.find((x) => x.id === handle) || bounds[0]
    const srcW = src?.measured?.width ?? 200
    const pos = h
      ? { x: h.x + h.width + 2, y: h.y + h.height / 2 - STOP_CAP_HALF }
      : { x: srcW + 4, y: 18 }
    setNodes((nds) => {
      const parentIdx = nds.findIndex((n) => n.id === sourceId)
      const stop = nds.find((n) => n.id === stopId)
      if (!stop || parentIdx < 0) return nds
      const updated = {
        ...stop,
        parentId: sourceId,
        position: pos,
        data: { ...stop.data, attachedTo: { sourceId, sourceHandle: handle } },
        selected: false,
      }
      const without = nds.filter((n) => n.id !== stopId)
      // child must come after parent in the array (React Flow ordering rule)
      const newParentIdx = without.findIndex((n) => n.id === sourceId)
      return [...without.slice(0, newParentIdx + 1), updated, ...without.slice(newParentIdx + 1)]
    })
    // any pre-existing edge into this stop is now a duplicate
    setEdges((eds) => eds.filter((e) => e.target !== stopId))
  }, [rf, setNodes, setEdges])

  const detachStop = useCallback((stopId) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== stopId || !n.parentId) return n
      const parent = nds.find((x) => x.id === n.parentId)
      const abs = parent
        ? { x: (parent.position?.x || 0) + (n.position?.x || 0) + 30,
            y: (parent.position?.y || 0) + (n.position?.y || 0) }
        : n.position
      const { attachedTo, ...dataRest } = n.data || {}
      const { parentId, ...nodeRest } = n
      return { ...nodeRest, position: abs, data: dataRest }
    }))
  }, [setNodes])

  // ---- connections ----
  // Stops attach instead of taking an edge. Union accepts many edges on its
  // single input; every other target handle keeps a single incoming edge.
  const onConnect = useCallback((conn) => {
    const target = nodes.find((n) => n.id === conn.target)
    if (target?.type === 'stop') {
      attachStop(conn.target, conn.source, conn.sourceHandle || 'out')
      return
    }
    setEdges((eds) => {
      const filtered = target?.type === 'union'
        ? eds
        : eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
      return addEdge({ ...conn, animated: true }, filtered)
    })
  }, [setEdges, nodes, attachStop])

  // ---- node helpers ----
  const addNode = (type) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`
    const data = JSON.parse(JSON.stringify(DEFAULT_DATA[type]))
    if (type === 'export') data.filename = `${(wfName || 'Workflow').trim()} - ${data.label}`

    // "Insert on a link": if a link is selected and the new block can be chained
    // (it has an input *and* an output), drop it on the link's midpoint and split
    // the connection in two — source → new block → target — so both ends wire up
    // automatically. Sinks (export/report) and source blocks can't sit mid-chain.
    const sel = edges.find((e) => e.selected)
    if (sel && INSERTABLE.has(type)) {
      const src = nodes.find((n) => n.id === sel.source)
      const tgt = nodes.find((n) => n.id === sel.target)
      if (src && tgt) {
        const a = nodeBox(src), b = nodeBox(tgt)
        const position = { x: (a.cx + b.cx) / 2 - 90, y: (a.cy + b.cy) / 2 - 40 }
        const outHandle = nodeOutputs({ type, data })[0]?.handle || 'out'
        const sfx = Math.random().toString(36).slice(2, 6)
        setNodes((nds) => [...nds, { id, type, position, data }])
        setEdges((eds) => [
          ...eds.filter((e) => e.id !== sel.id),
          { id: `${sel.source}-${id}-${sfx}`, source: sel.source, sourceHandle: sel.sourceHandle, target: id, targetHandle: 'in', animated: true },
          { id: `${id}-${sel.target}-${sfx}`, source: id, sourceHandle: outHandle, target: sel.target, targetHandle: sel.targetHandle, animated: true },
        ])
        setSelectedId(id)
        return
      }
    }

    // Otherwise drop the new block where the user is looking: centre of the visible
    // canvas (converted to flow coordinates), with a small jitter so repeated adds
    // don't stack exactly on top of each other. Falls back to a cascade if unavailable.
    const n = nodes.length
    // a frame is centred on the viewport using its own size; blocks use a half-node offset
    const halfW = type === 'frame' ? (data.w || 460) / 2 : 90
    const halfH = type === 'frame' ? (data.h || 300) / 2 : 40
    let position = { x: 120 + (n % 4) * 80, y: 80 + n * 40 }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect && rf?.screenToFlowPosition) {
      const c = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      const j = type === 'frame' ? 0 : (n % 5) * 26
      position = { x: c.x - halfW + j, y: c.y - halfH + j }
    }
    setNodes((nds) => [...nds, { id, type, position, data }])
    setSelectedId(id)
  }

  const updateNodeData = useCallback((id, patch) => {
    setNodes((nds) => {
      const cur = nds.find((n) => n.id === id)
      // When the user removes/replaces a Validation route's outputs (or flips
      // else_enabled / mode off the route), any edge still sourced from one of
      // the disappearing handles becomes a ghost — invisible in the UI but kept
      // in the JSON, and it would silently re-ingest a stale parquet at run
      // time. Drop those edges here so the workflow and disk stay coherent.
      if (cur && patch) {
        const gone = removedRouteHandles(cur, patch)
        if (gone.size > 0) {
          setEdges((eds) => eds.filter(
            (e) => !(e.source === id && gone.has(e.sourceHandle || 'out'))
          ))
        }
        // also drop stops glued to a now-deleted route output
        if (gone.size > 0) {
          return nds
            .filter((n) => !(n.type === 'stop' && n.data?.attachedTo?.sourceId === id
              && gone.has(n.data.attachedTo.sourceHandle)))
            .map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd)
        }
      }
      return nds.map((nd) => nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd)
    })
    // Tell xyflow to remeasure this node's handles whenever the shape could have
    // changed (outputs reordered/added/removed, else toggled, split toggled,
    // mode flipped). Otherwise edges stay anchored to STALE handle positions
    // and visually attach to the wrong sortie after a reorder.
    if (patch && ('outputs' in patch || 'else_enabled' in patch || 'mode' in patch || 'split' in patch)) {
      updateNodeInternals(id)
    }
  }, [setNodes, setEdges, updateNodeInternals])

  const onDeleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId))
  }, [setEdges])

  // Drop every trace of a set of removed nodes: their links, and the per-node
  // caches keyed by id (status / schema / change-tracking). Shared by both
  // deletion paths — the context menu (below) and the Suppr/Backspace key (which
  // React Flow handles itself, then calls onNodesDelete).
  const forgetNodes = useCallback((ids) => {
    const initial = ids instanceof Set ? ids : new Set(ids)
    if (!initial.size) return
    const gone = new Set(initial)
    // a stop glued to a removed block goes with it
    for (const n of nodes) {
      if (n.type === 'stop' && n.parentId && gone.has(n.parentId)) gone.add(n.id)
    }
    setNodes((nds) => nds.filter((n) => !gone.has(n.id)))
    setEdges((eds) => eds.filter((e) => !gone.has(e.source) && !gone.has(e.target)))
    setSelectedId((c) => (c && gone.has(c) ? null : c))
    setEditorNode((c) => (c && gone.has(c) ? null : c))
    const prune = (o) => { const r = { ...o }; gone.forEach((id) => delete r[id]); return r }
    setStatus(prune); setSchemas(prune); setRunStamps(prune)
  }, [nodes, setEdges, setNodes])

  // Remove a batch of blocks ourselves (used by the context menu). The Suppr key
  // is handled by React Flow directly — see onNodesDelete on <ReactFlow>.
  // forgetNodes removes the nodes themselves and every adjacent piece of state.
  const removeByIds = (ids) => forgetNodes(new Set(ids))
  const deleteNode = (id) => removeByIds([id])
  const deleteSelection = () => removeByIds(nodes.filter((n) => n.selected).map((n) => n.id))
  const onNodesDelete = useCallback((deleted) => forgetNodes(deleted.map((n) => n.id)), [forgetNodes])

  // ---- ComfyUI-style frames: dragging a group carries the blocks inside it ----
  const nodeBox = (n) => {
    const w = n.measured?.width ?? n.width ?? 212
    const h = n.measured?.height ?? n.height ?? 110
    return { cx: n.position.x + w / 2, cy: n.position.y + h / 2 }
  }
  const onNodeDragStart = useCallback((_e, node) => {
    if (node.type !== 'frame') return
    const gx = node.position.x, gy = node.position.y
    const gw = node.data.w || 460, gh = node.data.h || 300
    const items = nodes
      // skip frames; skip glued stops — their position is relative to a parent
      // that's already in the scan, and they'll follow it automatically.
      .filter((n) => n.id !== node.id && n.type !== 'frame' && !n.parentId)
      .filter((n) => { const { cx, cy } = nodeBox(n); return cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh })
      .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))
    groupDrag.current = { id: node.id, x: gx, y: gy, items }
  }, [nodes])
  const onNodeDrag = useCallback((_e, node) => {
    const s = groupDrag.current
    if (!s || s.id !== node.id || !s.items.length) return
    const dx = node.position.x - s.x, dy = node.position.y - s.y
    setNodes((nds) => nds.map((n) => {
      const it = s.items.find((i) => i.id === n.id)
      return it ? { ...n, position: { x: it.x + dx, y: it.y + dy } } : n
    }))
  }, [setNodes])
  const onNodeDragStop = useCallback(() => { groupDrag.current = null }, [])

  // Duplicate a block (its settings, not its links) next to the original. We
  // regenerate the internal IDs (conditions, outputs) so the copy never reuses
  // its parent's handle ids — otherwise React Flow gets two handles with the
  // same id in the workflow, and a drag can latch onto the wrong one mid-stroke.
  const duplicateNode = (id) => {
    const src = nodes.find((n) => n.id === id)
    if (!src) return
    const newId = `${src.type}-${Math.random().toString(36).slice(2, 8)}`
    const data = JSON.parse(JSON.stringify(src.data))
    data.label = `${data.label || src.type} (copie)`
    if (src.type === 'export' && data.auto_name !== false) data.filename = `${(wfName || 'Workflow').trim()} - ${data.label}`
    // Fresh ids for the validate/routing dynamic handles + the conditions they
    // reference. Static handles ('valid', 'invalid', 'else', 'out'…) are kept
    // unchanged — only ids that look user-generated are remapped.
    if (Array.isArray(data.conditions) || Array.isArray(data.outputs)) {
      const condRemap = {}
      data.conditions = (data.conditions || []).map((c) => {
        const nid = 'c' + uid()
        condRemap[c.id] = nid
        return { ...c, id: nid }
      })
      data.outputs = (data.outputs || []).map((o) => {
        const isCustomId = typeof o.id === 'string' && o.id.startsWith('o')
        const nid = isCustomId ? uid() : o.id
        const match = o.match ? { ...o.match, conditionId: condRemap[o.match.conditionId] || o.match.conditionId } : o.match
        return { ...o, id: nid, ...(match ? { match } : {}) }
      })
    }
    setNodes((nds) => [...nds, {
      ...src, id: newId, selected: false,
      position: { x: (src.position?.x || 0) + 40, y: (src.position?.y || 0) + 40 },
      data,
    }])
    setSelectedId(newId)
  }

  // close the context menu / run dropdown on any left click or Escape
  useEffect(() => {
    if (!menu && !runMenu && !addMenu) return
    const close = () => { setMenu(null); setRunMenu(false); setAddMenu(false) }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey) }
  }, [menu, runMenu, addMenu])

  const onSchema = useCallback((id, cols) => {
    setSchemas((s) => ({ ...s, [id]: cols }))
  }, [])

  // ---- run ----
  const flushSave = async () => {
    clearTimeout(saveTimer.current)
    await api.saveWorkflow(pid, { id: wid, name: wfName, nodes: stripNodes(nodes), edges })
    setSaveState('saved')
  }

  // Open the project's files folder (where exports land) in the OS file explorer.
  const openExportsFolder = async () => {
    setBanner(null)
    try {
      await api.openFilesFolder(pid)
    } catch (e) {
      setBanner({ type: 'error', text: `Impossible d'ouvrir le dossier : ${e.message || e}` })
    }
  }

  // Download the human-readable Excel documentation. The doc is built from the
  // *stored* workflow, so we flush any pending edits first.
  const documentWorkflow = async () => {
    setBanner(null)
    try {
      await flushSave()
      const a = document.createElement('a')
      a.href = api.documentUrl(pid, wid)
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      setBanner({ type: 'error', text: `Impossible de générer la documentation : ${e.message || e}` })
    }
  }

  const applyOneResult = (nid, r) => {
    setStatus((prev) => ({
      ...prev,
      [nid]: {
        ran: true, rows: r.row_count ?? r.rows ?? 0, error: null,
        outputs: r.outputs || {}, cleanReport: r.clean_report,
        locked: r.locked, cached: r.cached,
        exported: r.exported, sheet: r.sheet, skippedEmpty: r.skipped_empty,
      },
    }))
    if (r.columns) setSchemas((prev) => ({ ...prev, [nid]: r.columns }))
  }

  // ---- artificial, smooth per-node progress -----------------------------
  // Reading a big Excel file gives no real progress signal, so we animate an
  // estimated bar: duration is guessed from the file size using a rate learned
  // (and stored) from real runs, and the fill eases asymptotically toward ~97%
  // so it slows near the end and never "completes" before the node actually does.
  const getRate = () => {
    const v = parseFloat(localStorage.getItem('roade.srcRateMsPerByte'))
    return Number.isFinite(v) && v > 0 ? v : 0.004      // default ≈ 4 s / Mo
  }
  const saveRate = (r) => {
    const blended = 0.5 * getRate() + 0.5 * r            // smooth (EMA) so one slow run can't skew it
    localStorage.setItem('roade.srcRateMsPerByte', String(Math.min(0.05, Math.max(0.0003, blended))))
  }
  const estimateMs = (node) => {
    if (node?.type === 'source') {
      const bytes = files.find((f) => f.name === node?.data?.file)?.size || 0
      return Math.max(800, bytes * getRate())
    }
    return 1000                                          // other blocks: short default, asymptote handles overruns
  }
  const stopAnim = () => {
    if (anim.current.timer) { clearInterval(anim.current.timer); anim.current.timer = null }
  }
  const startNodeAnim = (node) => {
    stopAnim()
    anim.current.start = performance.now()
    anim.current.est = estimateMs(node)
    setNodeFrac(0)
    anim.current.timer = setInterval(() => {
      const elapsed = performance.now() - anim.current.start
      const frac = 1 - Math.exp(-2.2 * elapsed / anim.current.est)   // ~0.89 at est, creeps after
      setNodeFrac(Math.min(0.97, frac))
    }, 80)
  }
  const finishNodeAnim = (node, result) => {
    stopAnim()
    const elapsed = performance.now() - anim.current.start
    const bytes = files.find((f) => f.name === node?.data?.file)?.size || 0
    if (node?.type === 'source' && result && !result.cached && !result.locked
        && bytes > 50000 && elapsed > 300) {
      saveRate(elapsed / bytes)                          // calibrate from this real read
    }
    setNodeFrac(1)
    setTimeout(() => setNodeFrac(0), 150)
  }

  // Streaming run: live progress, ComfyUI-style.
  const doRun = async (onlyNode = null, force = false, allExports = false) => {
    if (busy) return
    setBanner(null)
    setBusy(true)
    setProgress({ active: true, total: 0, done: 0, currentId: null, currentLabel: 'préparation…', startedAt: Date.now() })
    await flushSave()
    let recomputed = 0, reused = 0
    const clearStartTimer = () => { if (startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null } }
    api.runStream(pid, wid, onlyNode, (ev) => {
      if (ev.event === 'start') {
        setProgress((p) => ({ ...p, active: true, total: ev.total, done: 0, currentId: null, currentLabel: '' }))
      } else if (ev.event === 'node_start') {
        // Defer the "exécution…" glow: a cached/instant block finishes before this
        // fires, so reused blocks no longer flash as if they were recomputed.
        clearStartTimer()
        const node = nodes.find((n) => n.id === ev.node_id)
        startTimer.current = setTimeout(() => {
          startTimer.current = null
          setProgress((p) => ({ ...p, currentId: ev.node_id, currentLabel: ev.label || ev.type }))
          startNodeAnim(node)
        }, 150)
      } else if (ev.event === 'node_done') {
        const dn = nodes.find((n) => n.id === ev.node_id)
        if (startTimer.current) clearStartTimer()   // finished before the glow showed
        else finishNodeAnim(dn, ev.result)          // glow was visible — wind it down
        applyOneResult(ev.node_id, ev.result)
        if (ev.result?.cached) reused++; else recomputed++
        // this block is now up to date — remember the config it ran with
        if (dn) setRunStamps((s) => ({ ...s, [ev.node_id]: nodeDataSig(dn.data) }))
        setProgress((p) => ({ ...p, done: p.done + 1, currentId: null }))
      } else if (ev.event === 'done') {
        clearStartTimer(); stopAnim(); setNodeFrac(0)
        setBusy(false)
        setProgress((p) => ({ ...p, active: false, currentId: null, done: p.total }))
        api.listFiles(pid).then(setFiles)
        const bits = []
        if (recomputed) bits.push(`${recomputed} recalculé${recomputed > 1 ? 's' : ''}`)
        if (reused) bits.push(`${reused} réutilisé${reused > 1 ? 's' : ''} (inchangé)`)
        if (bits.length) setBanner({ type: 'info', text: bits.join(' · ') })
      } else if (ev.event === 'error') {
        clearStartTimer(); stopAnim(); setNodeFrac(0)
        setBusy(false)
        setProgress((p) => ({ ...p, active: false, currentId: null }))
        if (ev.node_id) setStatus((s) => ({ ...s, [ev.node_id]: { ...(s[ev.node_id] || {}), error: ev.message, ran: false } }))
        setBanner({ type: 'error', text: ev.message || "Erreur d'exécution" })
        api.listFiles(pid).then(setFiles)
      }
    }, force, allExports)
  }

  // Click the running-block name in the progress bar to find it on the canvas.
  const goToNode = (id) => {
    if (!id) return
    setSelectedId(id)
    rf.fitView({ nodes: [{ id }], duration: 500, maxZoom: 1.4, padding: 0.6 })
  }

  // Tick once a second during a run so the elapsed-time readout stays live.
  useEffect(() => {
    if (!progress.active) return
    const h = setInterval(() => setElapsedTick((t) => t + 1), 1000)
    return () => clearInterval(h)
  }, [progress.active])

  // ---- inputs for the selected SQL node ----
  const selectedNode = nodes.find((n) => n.id === selectedId) || null
  const inspectorInputs = useMemo(() => {
    const withInputs = ['sql', 'dedup', 'validate', 'pivot', 'clean', 'calc', 'filter', 'cols', 'report', 'union']
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
    onRunNode: (id, force) => doRun(id, force),
    onDeleteEdge,
    onNodeDataChange: updateNodeData,
  }), [status, progress.active, progress.currentId, nodes, edges, wfName, onDeleteEdge, updateNodeData])

  // Stale blocks: a node is stale if its config changed since its last run, or
  // if it never ran, or if anything upstream is stale (matches the backend's
  // incremental recompute). Propagated in topological order over the edges.
  const dirtyMap = useMemo(() => {
    const self = {}
    for (const n of nodes) {
      if (n.type === 'frame' || n.type === 'stop') { self[n.id] = false; continue }   // not computed
      const stamp = runStamps[n.id]
      self[n.id] = stamp === undefined ? true : nodeDataSig(n.data) !== stamp
    }
    const indeg = {}, adj = {}, parents = {}
    nodes.forEach((n) => { indeg[n.id] = 0; adj[n.id] = [] })
    edges.forEach((e) => {
      if (adj[e.source] && indeg[e.target] !== undefined) { adj[e.source].push(e.target); indeg[e.target]++ }
      ;(parents[e.target] = parents[e.target] || []).push(e.source)
    })
    const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
    const dirty = {}
    while (q.length) {
      const id = q.shift()
      dirty[id] = self[id] || (parents[id] || []).some((p) => dirty[p])
      for (const t of adj[id]) if (--indeg[t] === 0) q.push(t)
    }
    nodes.forEach((n) => { if (dirty[n.id] === undefined) dirty[n.id] = self[n.id] })
    return dirty
  }, [nodes, edges, runStamps])

  // highlight the currently-executing node (ComfyUI-style) + flag stale blocks.
  // Frames are dragged by their title bar only and rendered behind the blocks.
  const decoratedNodes = useMemo(
    () => nodes.map((n) => {
      if (n.type === 'frame') return { ...n, dragHandle: '.group-titlebar', zIndex: -1 }
      // glued stops follow their parent — pin them in place and float above
      if (n.type === 'stop' && n.parentId) return { ...n, draggable: false, zIndex: 5 }
      const active = progress.currentId === n.id
      const dirty = dirtyMap[n.id]
      if (!active && !dirty) return n
      return {
        ...n,
        className: active ? 'rf-active' : undefined,
        data: dirty ? { ...n.data, __dirty: true } : n.data,
      }
    }),
    [nodes, progress.currentId, dirtyMap])

  // colour links by the data type leaving the source port; make them deletable
  const decoratedEdges = useMemo(() => {
    return edges.map((e) => {
      const srcNode = nodes.find((n) => n.id === e.source)
      const color = outputColorOf(srcNode, e.sourceHandle)
        || HANDLE_COLOR[e.sourceHandle] || TYPE_COLOR[srcNode?.type] || '#9aa3b2'
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
            <button className="add-btn" onClick={(e) => { e.stopPropagation(); setAddMenu((v) => !v) }} title="Ajouter un bloc au workflow">
              <Icon name="plus" size={14} /> Ajouter un bloc <Icon name="down" size={11} />
            </button>
            {addMenu && (
              <div className="add-palette" onClick={(e) => e.stopPropagation()}>
                {BLOCK_PALETTE.map(([type, label, desc]) => (
                  <button key={type} className="add-item" onClick={() => { addNode(type); setAddMenu(false) }}>
                    <span className="add-swatch" style={{ background: TYPE_COLOR[type] || '#888' }} />
                    <span className="add-item-txt">
                      <span className="add-item-lbl">{label}</span>
                      <span className="add-item-desc">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={`sel-toggle ${selectMode ? 'on' : ''}`}
            onClick={() => setSelectMode((v) => !v)}
            title="Mode sélection : dessinez un cadre pour sélectionner plusieurs blocs (Maj+clic pour en ajouter), puis Suppr ou clic droit → Supprimer"
          >
            <Icon name="select" size={14} /> Sélection
          </button>
          <div className="tb-right">
            <span className={`save ${saveState}`}>
              {saveState === 'saving' ? 'enregistrement…' : saveState === 'error' ? 'erreur de sauvegarde' : 'enregistré'}
            </span>
            <button className="ghost icon-only" onClick={openExportsFolder} title="Ouvrir le dossier des exports">
              <Icon name="folder" />
            </button>
            <button className="ghost" onClick={() => setFlowOpen(true)} title="Vue d'ensemble : qui va où, des sources aux exports">
              <Icon name="flow" /> Carte des flux
            </button>
            <button className="ghost" onClick={documentWorkflow} title="Exporter un Excel expliquant, étape par étape, comment chaque fichier de sortie est produit">
              <Icon name="download" /> Documenter
            </button>
            <div className="run-split">
              <button className="primary" disabled={busy} onClick={() => doRun(null)}>
                {busy ? 'Exécution…' : 'Exécuter le workflow'}
              </button>
              <button className="primary run-caret" disabled={busy} title="Options d'exécution"
                onClick={(e) => { e.stopPropagation(); setRunMenu((v) => !v) }}>
                <Icon name="down" size={12} />
              </button>
              {runMenu && (
                <div className="ctx-menu run-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="run-menu-row">
                    <button onClick={() => { setRunMenu(false); doRun(null, true) }}>
                      <Icon name="refresh" size={13} /> Tout recalculer
                    </button>
                    <MenuInfo>Ignore le cache et recalcule chaque bloc. Les blocs verrouillés restent figés.</MenuInfo>
                  </div>
                  <div className="run-menu-sep" />
                  <div className="run-menu-row">
                    <button onClick={() => { setRunMenu(false); doRun(null, true, true) }}>
                      <Icon name="download" size={13} /> Super run : tout recalculer et exporter
                    </button>
                    <MenuInfo>Génère tous les fichiers de sortie, y compris les blocs Export désactivés (sans les réactiver).</MenuInfo>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="editor-main">
          {/* overlays float above the canvas so nothing shifts when they appear */}
          <div className="overlays">
            <ProgressBar progress={progress} frac={nodeFrac} onGo={goToNode} />
            {banner && <div className={`banner ${banner.type}`}>{banner.text}<button className="ghost small" onClick={() => setBanner(null)}><Icon name="x" /></button></div>}
          </div>
          <div className={`canvas ${selectMode ? 'selecting' : ''}`} ref={canvasRef}>
            <ReactFlow
              nodes={decoratedNodes}
              edges={decoratedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onNodesDelete={onNodesDelete}
              onNodeClick={(e, n) => {
                setSelectedId(n.id)
                // multi-selecting (selection mode, or Maj/Ctrl/Cmd held): keep adding
                // to the selection, don't pop the full-screen editor open.
                if (selectMode || e.shiftKey || e.ctrlKey || e.metaKey) return
                if (n.type !== 'frame' && n.type !== 'stop') setEditorNode(n.id)
              }}
              onNodeContextMenu={(e, n) => {
                e.preventDefault()
                setSelectedId(n.id)
                // right-clicking a block that's *outside* the current selection narrows
                // to just it; right-clicking one inside the selection keeps the whole batch.
                if (!nodes.find((x) => x.id === n.id)?.selected) {
                  setNodes((nds) => nds.map((x) => ({ ...x, selected: x.id === n.id })))
                }
                setMenu({ id: n.id, x: e.clientX, y: e.clientY })
              }}
              onSelectionContextMenu={(e, ns) => { e.preventDefault(); setMenu({ id: ns[0]?.id, x: e.clientX, y: e.clientY }) }}
              onPaneClick={() => { setSelectedId(null); setMenu(null) }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{ type: 'deletable' }}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
              selectionMode={SelectionMode.Partial}
              selectionOnDrag={selectMode}
              panOnDrag={selectMode ? [1, 2] : true}
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
            {selectMode && nodes.length > 0 && (
              <div className="canvas-hint sel-hint">
                Mode sélection : dessinez un cadre pour sélectionner, <b>Maj+clic</b> pour ajouter/retirer un bloc.
                Puis <b>Suppr</b> ou clic droit → <b>Supprimer</b>.
              </div>
            )}
          </div>

        </div>

        {previewNode && (
          <DataPreview
            pid={pid} wid={wid} nodeId={previewId} label={previewLabel}
            initialTab={previewNode.tab || previewPrefs.tab}
            initialColumn={previewPrefs.column}
            initialHandle={previewNode.handle}
            onNav={(prefs) => setPreviewPrefs(prefs)}
            outputs={nodeOutputs(nodes.find((n) => n.id === previewId))}
            onClose={() => setPreviewNode(null)}
          />
        )}

        {editorNode && nodes.find((n) => n.id === editorNode) && (
          <BlockEditor
            pid={pid} wid={wid}
            node={nodes.find((n) => n.id === editorNode)}
            inputs={inspectorInputs}
            files={files}
            status={status[editorNode]}
            wfName={wfName}
            onChange={updateNodeData}
            onSchema={onSchema}
            onDelete={(id) => { deleteNode(id); setEditorNode(null) }}
            onRun={(force = false) => doRun(editorNode, force)}
            onPreview={(id, handle) => setPreviewNode({ id, handle })}
            onClose={() => setEditorNode(null)}
          />
        )}

        {flowOpen && (
          <WorkflowFlow
            nodes={nodes.filter((n) => n.type !== 'frame')} edges={edges} status={status}
            onOpenNode={(id) => { setFlowOpen(false); setSelectedId(id); setEditorNode(id) }}
            onClose={() => setFlowOpen(false)}
          />
        )}

        {menu && (() => {
          const mn = nodes.find((n) => n.id === menu.id)
          const selCount = nodes.filter((n) => n.selected).length
          const bulk = selCount >= 2 && mn?.selected
          return (
            <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
              {!bulk && mn?.type === 'frame' && (
                <div className="ctx-color">
                  <span className="ctx-color-lbl">Couleur du cadre</span>
                  <div className="ctx-swatches">
                    {FRAME_COLORS.map((c) => (
                      <button key={c} className={`ctx-swatch ${(mn.data.color || '#5b6bb0') === c ? 'on' : ''}`}
                        style={{ background: c }} title={c} onClick={() => updateNodeData(menu.id, { color: c })} />
                    ))}
                    <label className="ctx-swatch custom" title="Couleur personnalisée">
                      <input type="color" value={mn.data.color || '#5b6bb0'}
                        onChange={(e) => updateNodeData(menu.id, { color: e.target.value })} />
                    </label>
                  </div>
                </div>
              )}
              {bulk ? (
                <button className="danger" onClick={() => { deleteSelection(); setMenu(null) }}>
                  <Icon name="trash" size={13} /> Supprimer la sélection ({selCount})
                </button>
              ) : (
                <>
                  {mn?.type === 'stop' && mn.data?.attachedTo && (
                    <button onClick={() => { detachStop(menu.id); setMenu(null) }}>
                      <Icon name="select" size={13} /> Détacher
                    </button>
                  )}
                  {mn?.type !== 'stop' && (
                    <button onClick={() => { duplicateNode(menu.id); setMenu(null) }}><Icon name="plus" size={13} /> Dupliquer</button>
                  )}
                  <button className="danger" onClick={() => { deleteNode(menu.id); setMenu(null) }}><Icon name="trash" size={13} /> Supprimer</button>
                </>
              )}
            </div>
          )
        })()}
      </div>
    </EditorContext.Provider>
  )
}

// Info bubble for a run-menu item: the explanation hides behind a discreet "i"
// and opens to the left (the menu hugs the right edge of the toolbar).
function MenuInfo({ children }) {
  return (
    <span className="info-bubble menu-info" tabIndex={0} onClick={(e) => e.stopPropagation()}>
      <Icon name="info" size={13} />
      <span className="info-pop" role="tooltip">{children}</span>
    </span>
  )
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

function ProgressBar({ progress, frac = 0, onGo }) {
  if (!progress.active && progress.done === 0) return null
  const within = progress.active ? Math.min(0.999, frac) : 0
  const pct = progress.total ? Math.min(100, Math.round(((progress.done + within) / progress.total) * 100)) : 0
  const elapsed = progress.startedAt ? Date.now() - progress.startedAt : 0
  return (
    <div className={`progress-wrap ${progress.active ? 'on' : 'off'}`}>
      <div className={`progress-track ${progress.active ? 'busy' : ''}`}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">
        {progress.active ? (
          <>
            <span className="pulse-dot" />
            {progress.currentLabel
              ? (progress.currentId
                  ? <>Exécution : <button className="run-goto" onClick={() => onGo?.(progress.currentId)}
                      title="Aller à ce bloc sur le plan">{progress.currentLabel} <Icon name="maximize" size={11} /></button></>
                  : <>Exécution : <b>{progress.currentLabel}</b></>)
              : 'préparation…'}
            {progress.total > 0 && <span className="pmeta"> · {progress.done}/{progress.total} · {pct}%</span>}
            {elapsed > 1500 && <span className="pmeta"> · {fmtElapsed(elapsed)}</span>}
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
  return nodes.map((n) => {
    const o = { id: n.id, type: n.type, position: n.position, data: n.data }
    if (n.parentId) o.parentId = n.parentId   // stops glued to a block
    return o
  })
}

// React Flow expects each child node to appear *after* its parent in the array;
// otherwise the child can't resolve its parent's position at render time.
function orderParentsFirst(nds) {
  const byId = new Map(nds.map((n) => [n.id, n]))
  const placed = new Set()
  const out = []
  const place = (n) => {
    if (placed.has(n.id)) return
    if (n.parentId && byId.has(n.parentId) && !placed.has(n.parentId)) place(byId.get(n.parentId))
    placed.add(n.id); out.push(n)
  }
  for (const n of nds) place(n)
  return out
}
