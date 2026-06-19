import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  useUpdateNodeInternals,
  SelectionMode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '../api'
import { hasBlockingIssues, preflightWorkflow } from '../lib/preflight'
import { notify } from '../toast'
import { exportSubdir } from '../lib/paths'
import { EditorContext } from './editorContext'
import Backpack, { BACKPACK_MIME, isOverBackpack, notifyStored } from './Backpack'
import CommandPalette from './ui/CommandPalette'
import { useConfirm } from './ui/ConfirmDialog'
import ConnectDialog from './ui/ConnectDialog'
import ShortcutsHelp from './ui/ShortcutsHelp'
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
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k]))
      .join(',') +
    '}'
  )
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
  const after =
    node.data?.mode === 'route' || patch.mode === 'route'
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
// the node. One wrapper instead of editing all nine node components. It also
// renders the unified stack of status pastilles in the node's top-right corner:
// every block-level indicator (error, data loss, stale) is a same-sized dot in
// the same place, coloured by the normalized --dot-* tokens. Flags are injected
// by the editor onto node.data (__preflight / __lost / __dirty).
function withComment(Comp) {
  return function Commented(props) {
    const note = props.data?.description
    const issues = props.data?.__preflight
    const lost = props.data?.__lost || 0
    // Order = priority (most severe first); they stack leftward from the corner.
    const dots = []
    if (issues && issues.length > 0) {
      dots.push({
        kind: 'error',
        title: issues.map((i) => `• ${i.message}`).join('\n'),
        label: `${issues.length} erreur(s) de configuration`,
      })
    }
    if (lost > 0) {
      dots.push({
        kind: 'loss',
        title: `${lost.toLocaleString('fr-FR')} ligne(s) ne correspondent à aucune sortie (non redistribuées)`,
        label: `${lost} ligne(s) non redistribuées`,
      })
    }
    if (props.data?.__dirty) {
      dots.push({
        kind: 'stale',
        title: 'Modifié depuis la dernière exécution — sera recalculé',
        label: 'Modifié depuis la dernière exécution',
      })
    }
    return (
      <>
        {note ? <div className="node-comment">{note}</div> : null}
        {dots.length > 0 ? (
          <span className="node-dots">
            {dots.map((d) => (
              <span
                key={d.kind}
                className={`node-dot node-dot-${d.kind}`}
                title={d.title}
                aria-label={d.label}
              />
            ))}
          </span>
        ) : null}
        <Comp {...props} />
      </>
    )
  }
}
const nodeTypes = {
  source: withComment(SourceNode),
  sql: withComment(SqlNode),
  dedup: withComment(DedupNode),
  validate: withComment(ValidateNode),
  pivot: withComment(PivotNode),
  clean: withComment(CleanNode),
  calc: withComment(CalcNode),
  filter: withComment(FilterNode),
  cols: withComment(ColsNode),
  report: withComment(ReportNode),
  union: withComment(UnionNode),
  export: withComment(ExportNode),
  frame: GroupNode,
  stop: StopNode,
}
const edgeTypes = { deletable: ButtonEdge }

// Palettes d'identité (TYPE_COLOR / HANDLE_COLOR / FRAME_COLORS) : importées
// depuis la source unique `theme.js` (D.2) — avant elles étaient redéfinies ici
// et dans WorkflowFlow.jsx, et finissaient par dériver entre les deux.
import { FRAME_COLORS, HANDLE_COLOR, TYPE_COLOR } from '../theme'

const DEFAULT_DATA = {
  source: { label: 'Source', file: '', sheet: '', header_row: 0, cache: true },
  sql: {
    label: 'SQL',
    mode: 'builder',
    query: { select: [], where: [], joins: [], group_by: [], order_by: [] },
  },
  dedup: { label: 'Doublons', key_columns: [], keep: 'first', dups_mode: 'all' },
  validate: {
    label: 'Validation',
    mode: 'route',
    intent: 'control',
    target_column: '',
    case_sensitive: false,
    routing: 'first',
    conditions: [
      {
        id: 'c1',
        name: 'Conforme',
        kind: 'rules',
        column: '',
        // Une condition vide « prête à éditer » par défaut : pas besoin de
        // cliquer « + Groupe (OU) » pour commencer (cf. RulesBuilder seed).
        groups: [{ rules: [{ test: 'contains', value: '' }] }],
        segments: [],
        test_samples: '',
      },
    ],
    outputs: [
      {
        id: 'valid',
        label: 'Conformes',
        color: '#59A14F',
        match: { conditionId: 'c1', negate: false },
      },
      {
        id: 'invalid',
        label: 'Non conformes',
        color: '#E15759',
        match: { conditionId: 'c1', negate: true },
      },
    ],
    else_enabled: false,
    else_label: 'Non classé',
    else_color: '#9aa3b2',
    add_flag: false,
    test_samples: '',
  },
  pivot: {
    label: 'Pivot',
    mode: 'pivot',
    index_columns: [],
    value_columns: [],
    pivot_column: '',
    value_column: '',
    agg: 'SUM',
    name_column: 'variable',
  },
  clean: { label: 'Nettoyage', operations: [] },
  calc: { label: 'Calcul', columns: [] },
  filter: { label: 'Filtre', mode: 'keep', column: '', ref_column: '', case_insensitive: false },
  cols: { label: 'Colonnes', columns: [] },
  report: { label: 'Analyse', note: '', columns: [] },
  union: { label: 'Union', by_name: true, distinct: false },
  export: {
    label: 'Export',
    filename: 'resultat',
    format: 'xlsx',
    auto_name: true,
    enabled: true,
    to_workbook: false,
  },
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
const INSERTABLE = new Set([
  'sql',
  'dedup',
  'validate',
  'pivot',
  'clean',
  'calc',
  'filter',
  'cols',
  'union',
])

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

// Input handles per node type — symétrique de NODE_OUTPUTS. Utilisé par le
// ConnectDialog (E.7) pour proposer les blocs cibles au clavier. Doit refléter
// les <Handle type="target"> rendus par chaque composant de bloc.
const NODE_INPUTS = {
  source: [],
  sql: [
    { handle: 'in1', label: 'Entrée principale (FROM)' },
    { handle: 'in2', label: 'Entrée à joindre (optionnelle)' },
  ],
  pivot: [{ handle: 'in', label: '' }],
  clean: [{ handle: 'in', label: '' }],
  calc: [{ handle: 'in', label: '' }],
  filter: [
    { handle: 'in', label: 'Données à filtrer' },
    { handle: 'ref', label: 'Tableau de référence' },
  ],
  cols: [{ handle: 'in', label: '' }],
  union: [{ handle: 'in', label: '' }],
  validate: [{ handle: 'in', label: '' }],
  dedup: [{ handle: 'in', label: '' }],
  export: [{ handle: 'in', label: '' }],
  report: [{ handle: 'in', label: '' }],
  stop: [{ handle: 'in', label: '' }],
  frame: [],
}

function nodeInputs(node) {
  if (!node) return []
  return NODE_INPUTS[node.type] || []
}

// Output handles for a node — dynamic for a validate block in 'route' mode
// (user-defined outputs + optional 'else'). Mirrors backend _output_handles.
function nodeOutputs(node) {
  if (!node) return [{ handle: 'out', label: '' }]
  if (node.type === 'frame' || node.type === 'stop') return [] // produce no data
  if (node.type === 'validate' && node.data?.mode === 'route') {
    const outs = (node.data.outputs || []).map((o) => ({
      handle: o.id,
      label: o.label || o.id,
      color: o.color,
    }))
    if (node.data.else_enabled !== false) {
      outs.push({
        handle: 'else',
        label: node.data.else_label || 'Non classé',
        color: node.data.else_color || '#9aa3b2',
      })
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

// Liste les ancres de sortie d'un nœud multi-sorties qui n'ont aucun lien.
// Renvoie `null` quand il n'y a rien à signaler — un seul handle (chemin
// nominal des blocs « out ») ne mérite pas de marque : un bloc terminal est
// un cas légitime (export, analyse en bout de chaîne). Réservé aux blocs où
// l'utilisateur compose plusieurs sorties et risque d'en oublier une.
function unusedOutputsOf(node, used) {
  if (!node) return null
  if (node.type !== 'dedup' && node.type !== 'validate') return null
  const outs = nodeOutputs(node)
  if (outs.length <= 1) return null
  const usedSet = used || new Set()
  const orphans = outs.map((o) => o.handle).filter((h) => !usedSet.has(h))
  return orphans.length ? orphans : null
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
  const [schemas, setSchemas] = useState({}) // nodeId -> [{name,type}]
  const [status, setStatus] = useState({}) // nodeId -> {ran, rows, error}
  const [runStamps, setRunStamps] = useState({}) // nodeId -> data-sig at last run (change tracking)
  const [busy, setBusy] = useState(false)
  // E.2 — référence à la connexion SSE en cours pour pouvoir la fermer côté
  // client quand l'utilisateur clique « Stop » (le serveur l'arrêtera tout
  // seul, mais on coupe aussi le flux côté UI pour rendre la main tout de suite).
  const runStreamRef = useRef(null)
  const [progress, setProgress] = useState({
    active: false,
    total: 0,
    done: 0,
    currentId: null,
    currentLabel: '',
  })
  const [nodeFrac, setNodeFrac] = useState(0) // sub-progress of the running node (real for sources)
  const [sourceProgress, setSourceProgress] = useState(null) // { nodeId, rowsRead, totalRows }
  const [, setElapsedTick] = useState(0) // 1 Hz re-render so the run timer stays live
  const [previewNode, setPreviewNode] = useState(null)
  const [editorNode, setEditorNode] = useState(null) // nodeId of the full-screen block editor
  const [flowOpen, setFlowOpen] = useState(false) // global workflow flow map
  const [menu, setMenu] = useState(null) // right-click context menu {id, x, y}
  const [runMenu, setRunMenu] = useState(false) // run-button dropdown (force recompute)
  const [addMenu, setAddMenu] = useState(false) // "add a block" palette dropdown
  const [selectMode, setSelectMode] = useState(false) // box-selection mode (select many blocks → bulk delete)
  const [legendOpen, setLegendOpen] = useState(false) // canvas legend expanded?
  const [connectFor, setConnectFor] = useState(null) // sourceNodeId pour ConnectDialog (E.7)
  // Mode « click-to-connect » : entré via clic-droit → « Connecter à… ».
  // L'utilisateur clique (ou box-sélectionne) ensuite ses cibles sur le canvas
  // puis valide. `{ sourceId, sourceHandle }`. ConnectDialog reste pour Ctrl+L
  // (alternative clavier pure, sans souris).
  const [connectMode, setConnectMode] = useState(null)
  const [backpack, setBackpack] = useState([]) // inventaire projet (App Inventor-style)
  const [backpackOpen, setBackpackOpen] = useState(false)
  const [selectionDragActive, setSelectionDragActive] = useState(false)
  const [previewPrefs, setPreviewPrefs] = useState({ tab: 'rows', column: null })
  const [banner, setBanner] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const loaded = useRef(false)
  const saveTimer = useRef(null)
  const anim = useRef({ timer: null, start: 0, est: 0 }) // per-node progress animation
  const startTimer = useRef(null) // deferred "running" indication
  const canvasRef = useRef(null)
  const groupDrag = useRef(null) // snapshot while dragging a frame
  // Backpack : positions snapshot pour pouvoir restaurer un déplacement quand
  // l'utilisateur drague la sélection ON le panneau (geste = « ranger », pas
  // « déplacer »).
  const dragStartPositions = useRef(null)
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
          api
            .preview(pid, wid, n.id, { limit: 1, handle: o.handle })
            .then((p) => {
              if (!alive || !p.available) return
              setStatus((s) => {
                const cur = s[n.id] || { ran: true, error: null, outputs: {} }
                const outs = { ...(cur.outputs || {}), [o.handle]: p.row_count }
                return {
                  ...s,
                  [n.id]: {
                    ran: true,
                    error: null,
                    outputs: outs,
                    rows: idx === 0 ? p.row_count : cur.rows,
                    cleanReport: p.clean_report || cur.cleanReport,
                    inputRows: p.input_rows ?? cur.inputRows,
                    unrouted: p.unrouted_rows ?? cur.unrouted ?? 0,
                  },
                }
              })
              if (idx === 0) {
                setSchemas((s) => ({ ...s, [n.id]: p.columns }))
                // assume the saved config matches the materialized output, so a
                // freshly-loaded workflow shows nothing stale until it's edited.
                setRunStamps((s) => ({ ...s, [n.id]: nodeDataSig(n.data) }))
              }
            })
            .catch(() => {})
        })
      }
      setTimeout(() => {
        loaded.current = true
      }, 300)
    })
    return () => {
      alive = false
    }
  }, [pid, wid])

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!loaded.current) return
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api
        .saveWorkflow(pid, { id: wid, name: wfName, nodes: stripNodes(nodes), edges })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [nodes, edges, wfName])

  // E.6 — palette de commandes + aide raccourcis.
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // Save explicite (Ctrl+S) — flush immédiatement le debounce de l'autosave.
  // (Une `flushSave` plus bas, sans notification, est utilisée avant un run.)
  const quickSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    setSaveState('saving')
    return api
      .saveWorkflow(pid, { id: wid, name: wfName, nodes: stripNodes(nodes), edges })
      .then(() => {
        setSaveState('saved')
        notify('Enregistré.', 'ok')
      })
      .catch(() => setSaveState('error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, wid, wfName, nodes, edges])

  // Duplique le bloc sélectionné (Ctrl+D) — offset de 40px pour qu'on le voie.
  const duplicateSelected = useCallback(() => {
    const selected = rf.getNodes?.().filter((n) => n.selected) || []
    if (selected.length === 0) {
      notify("Sélectionnez d'abord un bloc à dupliquer.", 'warn')
      return
    }
    const newNodes = selected.map((n) => ({
      ...n,
      id: uid(),
      selected: false,
      position: { x: (n.position?.x || 0) + 40, y: (n.position?.y || 0) + 40 },
      data: { ...n.data },
    }))
    setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
  }, [rf, setNodes])

  // E.1 — historique past/future de l'état du graphe (Ctrl+Z / Ctrl+Y).
  //
  // Chaque entrée est un *snapshot complet* de (nodes, edges), 50 niveaux max
  // par côté. `commitHistory()` doit être appelé AVANT chaque mutation
  // structurelle ; il efface l'historique futur (une nouvelle mutation invalide
  // la branche redo). Les statuts/schémas/runStamps ne sont PAS undoables —
  // après undo, les blocs restaurés apparaissent comme « jamais exécutés » et
  // un nouveau run rétablit leurs caches.
  //
  // Coalescence : les rafales rapprochées (frappe dans l'Inspector, batch de
  // liens créés par `confirmConnect`, duplication multiple) doivent compter
  // pour UN seul pas d'historique. `commitHistory({coalesce:true})` ignore le
  // commit s'il a déjà eu lieu il y a moins de 500 ms.
  //
  // On lit l'état via des refs synchrones (mis à jour à chaque render) plutôt
  // que via le closure de `nodes`/`edges` : ça permet de capturer la scène
  // *avant* mutation même quand React n'a pas encore re-render — utile dans
  // `onBeforeDelete` qui fire pile avant que React Flow ne déclenche la
  // suppression via `onNodesChange`.
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const historyRef = useRef({ past: [], future: [] })
  const lastCommitAt = useRef(0)
  const [, bumpHistory] = useState(0)
  const snapshotGraph = useCallback(
    () => ({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
    }),
    [],
  )
  const commitHistory = useCallback(
    ({ coalesce = false } = {}) => {
      const now = Date.now()
      if (coalesce && now - lastCommitAt.current < 500) {
        lastCommitAt.current = now
        return
      }
      historyRef.current = {
        past: [...historyRef.current.past.slice(-49), snapshotGraph()],
        future: [],
      }
      lastCommitAt.current = now
      bumpHistory((t) => t + 1)
    },
    [snapshotGraph],
  )
  const undo = useCallback(() => {
    const { past, future } = historyRef.current
    if (past.length === 0) {
      notify('Rien à annuler.', 'warn')
      return
    }
    const prev = past[past.length - 1]
    historyRef.current = {
      past: past.slice(0, -1),
      future: [...future, snapshotGraph()].slice(-50),
    }
    setNodes(prev.nodes)
    setEdges(prev.edges)
    // Un undo n'est pas une « mutation à coalescer avec la suivante ».
    lastCommitAt.current = 0
    bumpHistory((t) => t + 1)
    notify('Annulé.', 'ok')
  }, [snapshotGraph, setNodes, setEdges])
  const redo = useCallback(() => {
    const { past, future } = historyRef.current
    if (future.length === 0) {
      notify('Rien à rétablir.', 'warn')
      return
    }
    const next = future[future.length - 1]
    historyRef.current = {
      past: [...past, snapshotGraph()].slice(-50),
      future: future.slice(0, -1),
    }
    setNodes(next.nodes)
    setEdges(next.edges)
    lastCommitAt.current = 0
    bumpHistory((t) => t + 1)
    notify('Rétabli.', 'ok')
  }, [snapshotGraph, setNodes, setEdges])
  // Hook React Flow : capture l'état *avant* une suppression initiée par le
  // clavier (Suppr) ou par l'API de RF. Pour les suppressions invoquées par
  // notre menu contextuel (deleteNode/deleteSelection → removeByIds), on
  // commit dans `removeByIds` directement.
  const onBeforeDelete = useCallback(() => {
    commitHistory()
    return true
  }, [commitHistory])

  // E.7 — ouvre le ConnectDialog pour le bloc sélectionné (alternative
  // clavier au drag de connexion). Refuse si rien n'est sélectionné ou si le
  // bloc n'a pas de sortie (source d'export, frame…).
  const openConnectFromSelection = useCallback(() => {
    const sel = nodes.find((n) => n.selected)
    if (!sel) {
      notify('Sélectionnez un bloc avant de lancer la connexion.', 'warn')
      return
    }
    if (nodeOutputs(sel).length === 0) {
      notify("Ce bloc n'a pas de sortie à connecter.", 'warn')
      return
    }
    setConnectFor(sel.id)
  }, [nodes])

  // Click-to-connect mode : on tient notre propre Set d'IDs cibles pour ne pas
  // se battre avec la sélection native de React Flow (qui efface tout au clic
  // simple sur la pane). Deux variantes symétriques :
  //   - fan-out : 1 source → on clique plusieurs cibles (1 → N).
  //   - fan-in  : plusieurs sources sélectionnées → on clique 1 destination
  //               (N → 1). Cas typique : 5 Sources qu'on veut tous brancher
  //               sur un Union d'un coup.
  // `confirmConnect` fait le produit cartésien sources × targets.
  const enterConnectMode = useCallback(
    (sourceIds) => {
      const ids = Array.isArray(sourceIds) ? sourceIds : [sourceIds]
      const sources = ids
        .map((id) => nodes.find((n) => n.id === id))
        .filter((s) => s && nodeOutputs(s).length > 0)
      if (sources.length === 0) {
        notify("Aucun bloc avec sortie n'est sélectionné.", 'warn')
        return
      }
      const kind = sources.length === 1 ? 'fan-out' : 'fan-in'
      setConnectMode({
        kind,
        sources: sources.map((s) => ({ id: s.id, handle: nodeOutputs(s)[0].handle })),
        targets: new Set(),
      })
      setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
      setSelectedId(null)
      setMenu(null)
    },
    [nodes, setNodes],
  )

  const exitConnectMode = useCallback(() => {
    setConnectMode(null)
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))
  }, [setNodes])

  // Toggle d'une cible (clic sur un bloc en mode connexion). En fan-in il n'y
  // a qu'UNE seule destination : on remplace au lieu d'ajouter (et re-cliquer
  // la même la désélectionne).
  const toggleConnectTarget = useCallback((id) => {
    setConnectMode((m) => {
      if (!m) return m
      if (m.kind === 'fan-in') {
        const next = m.targets.has(id) ? new Set() : new Set([id])
        return { ...m, targets: next }
      }
      const next = new Set(m.targets)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...m, targets: next }
    })
  }, [])
  // `confirmConnect` est défini plus bas, après `onConnect` (qu'il appelle).
  // Le handler clavier ci-dessous l'invoque via ce ref : on garde une référence
  // stable, mise à jour en useEffect, pour éviter la TDZ (le hook clavier est
  // défini avant `confirmConnect` dans l'ordre du composant).
  const confirmConnectRef = useRef(() => {})

  // ---------------------------------------------------------------------- //
  // Inventaire (backpack) — App Inventor-style                             //
  // ---------------------------------------------------------------------- //
  // Charge l'inventaire à l'ouverture du projet ; ré-update à chaque
  // ajout/suppression/renommage en relisant tout (l'API renvoie la liste
  // entière, pas de fusion locale à gérer).
  const reloadBackpack = useCallback(() => {
    api.listBackpack(pid).then(setBackpack).catch(() => setBackpack([]))
  }, [pid])
  useEffect(() => {
    reloadBackpack()
  }, [reloadBackpack])

  // Construit la charge utile à envoyer au backend : on copie les data en
  // profondeur (pour ne pas voir le bloc stocké muter au gré du workflow) et on
  // ne garde que les arêtes *internes* à la sélection — celles vers l'extérieur
  // ne pourront pas être reconstruites dans la cible.
  const buildBackpackPayload = useCallback(
    (nodeIds, name = '') => {
      const idSet = new Set(nodeIds)
      const picked = nodes.filter((n) => idSet.has(n.id))
      // Le format on-disk vit en clair : on supprime les flags React Flow
      // (selected, dragging, measured, parentId quand il pointe hors sélection).
      const cleanNodes = picked.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.position?.x || 0, y: n.position?.y || 0 },
        data: JSON.parse(JSON.stringify(n.data || {})),
      }))
      const cleanEdges = edges
        .filter((e) => idSet.has(e.source) && idSet.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle || null,
          targetHandle: e.targetHandle || null,
        }))
      return { name, nodes: cleanNodes, edges: cleanEdges }
    },
    [nodes, edges],
  )

  const storeInBackpack = useCallback(
    (nodeIds, name = '') => {
      if (!nodeIds.length) {
        notify('Sélectionnez au moins un bloc à ranger.', 'warn')
        return
      }
      api
        .addBackpack(pid, buildBackpackPayload(nodeIds, name))
        .then((item) => {
          notifyStored(item.name)
          setBackpackOpen(true)
          reloadBackpack()
        })
        .catch((e) => notify(`Échec de l'ajout : ${e.message || e}`, 'error'))
    },
    [pid, buildBackpackPayload, reloadBackpack],
  )

  // Pose une copie du contenu d'un item à `position` (en coordonnées flow). On
  // génère systématiquement de nouveaux IDs de nœud — sinon collisions avec les
  // blocs déjà présents — et on remappe les arêtes pour pointer vers les
  // nouveaux IDs. Le placement préserve la mise en page relative du groupe :
  // on translate l'ensemble pour que le coin haut-gauche du bounding box
  // tombe sur `position`.
  const pasteBackpackItem = useCallback(
    (itemId, position) => {
      const item = backpack.find((b) => b.id === itemId)
      if (!item || !item.nodes?.length) return
      commitHistory()
      const minX = Math.min(...item.nodes.map((n) => n.position?.x || 0))
      const minY = Math.min(...item.nodes.map((n) => n.position?.y || 0))
      const idMap = {}
      for (const n of item.nodes) idMap[n.id] = uid()
      const newNodes = item.nodes.map((n) => ({
        id: idMap[n.id],
        type: n.type,
        position: {
          x: (n.position?.x || 0) - minX + position.x,
          y: (n.position?.y || 0) - minY + position.y,
        },
        data: JSON.parse(JSON.stringify(n.data || {})),
        selected: true,
      }))
      const newEdges = (item.edges || []).map((e) => ({
        id: `bp-${uid()}`,
        source: idMap[e.source],
        target: idMap[e.target],
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
        animated: true,
      }))
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...newNodes])
      setEdges((eds) => [...eds, ...newEdges])
      notify(`« ${item.name} » inséré.`, 'ok')
    },
    [backpack, setNodes, setEdges, commitHistory],
  )

  // Drag d'un item depuis le panneau : on encode juste l'ID dans le
  // dataTransfer ; tout l'état réel est dans `backpack` côté front.
  const onBackpackItemDragStart = useCallback((iid, ev) => {
    ev.dataTransfer.setData(BACKPACK_MIME, iid)
    ev.dataTransfer.effectAllowed = 'copy'
  }, [])

  // Drop sur le canevas : on lit l'ID, on convertit le pointeur en coords flow.
  const onCanvasDrop = useCallback(
    (ev) => {
      const iid = ev.dataTransfer?.getData(BACKPACK_MIME)
      if (!iid) return
      ev.preventDefault()
      const pos =
        rf?.screenToFlowPosition?.({ x: ev.clientX, y: ev.clientY }) || { x: 0, y: 0 }
      pasteBackpackItem(iid, pos)
    },
    [rf, pasteBackpackItem],
  )
  const onCanvasDragOver = useCallback((ev) => {
    if (ev.dataTransfer?.types?.includes(BACKPACK_MIME)) {
      ev.preventDefault()
      ev.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  // Insertion par clic sur un item (fallback non-drag) : au centre du viewport.
  const insertBackpackAtCenter = useCallback(
    (iid) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      const center =
        rect && rf?.screenToFlowPosition
          ? rf.screenToFlowPosition({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            })
          : { x: 200, y: 200 }
      pasteBackpackItem(iid, center)
    },
    [rf, pasteBackpackItem],
  )

  const renameBackpackItem = useCallback(
    (iid, name) => {
      api
        .renameBackpack(pid, iid, name)
        .then(reloadBackpack)
        .catch((e) => notify(`Renommage refusé : ${e.message || e}`, 'error'))
    },
    [pid, reloadBackpack],
  )
  const deleteBackpackItem = useCallback(
    (iid) => {
      api
        .deleteBackpack(pid, iid)
        .then(reloadBackpack)
        .catch((e) => notify(`Suppression refusée : ${e.message || e}`, 'error'))
    },
    [pid, reloadBackpack],
  )

  const addSelectionToBackpack = useCallback(() => {
    const ids = nodes.filter((n) => n.selected).map((n) => n.id)
    storeInBackpack(ids)
  }, [nodes, storeInBackpack])

  // ---- Hooks de drag pour détecter « drop sur le panneau d'inventaire » ---
  // onSelectionDragStart fires when the user begins dragging a multi-selection
  // (≥2 nodes). On capture les positions pour pouvoir les rétablir si la
  // sélection a été *rangée* (pas *déplacée*).
  const onSelectionDragStart = useCallback((_e, draggedNodes) => {
    setSelectionDragActive(true)
    const snap = new Map()
    for (const n of draggedNodes) snap.set(n.id, { x: n.position?.x || 0, y: n.position?.y || 0 })
    dragStartPositions.current = snap
  }, [])
  const onSelectionDragStop = useCallback(
    (event, draggedNodes) => {
      setSelectionDragActive(false)
      const snap = dragStartPositions.current
      dragStartPositions.current = null
      if (!snap) return
      const ev = event || {}
      if (!isOverBackpack(ev.clientX, ev.clientY)) return
      // Drop sur le panneau → on range et on restaure les positions.
      const ids = draggedNodes.map((n) => n.id)
      storeInBackpack(ids)
      setNodes((nds) =>
        nds.map((n) => (snap.has(n.id) ? { ...n, position: snap.get(n.id) } : n)),
      )
    },
    [storeInBackpack, setNodes],
  )

  // E.6 — raccourcis globaux. On évite de tirer dessus quand le focus est dans
  // un input/textarea/contenteditable (laisse le navigateur faire son job).
  useEffect(() => {
    const inField = (el) => {
      if (!el) return false
      const tag = el.tagName
      return (
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
      )
    }
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        quickSave()
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (mod && e.key.toLowerCase() === 'd' && !inField(document.activeElement)) {
        e.preventDefault()
        duplicateSelected()
      } else if (mod && e.key.toLowerCase() === 'z' && !inField(document.activeElement)) {
        // E.1 — Ctrl+Z annule, Ctrl+Maj+Z rétablit (convention macOS/Linux).
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y' && !inField(document.activeElement)) {
        // E.1 — Ctrl+Y rétablit (convention Windows).
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'l' && !inField(document.activeElement)) {
        // E.7 — Ctrl+L : alternative clavier au drag de connexion.
        e.preventDefault()
        openConnectFromSelection()
      } else if (e.key === '?' && !inField(document.activeElement) && !mod) {
        e.preventDefault()
        setHelpOpen(true)
      } else if (e.key === 'Escape' && !inField(document.activeElement) && !mod) {
        // Esc : (1) sort du mode sélection / mode connexion, (2) désélectionne
        // tout (blocs + arêtes + curseur d'inspecteur). Quand une modale
        // (preview / BlockEditor / palette…) est ouverte, son propre handler
        // intercepte d'abord — on n'a pas à se soucier de leur marcher dessus.
        e.preventDefault()
        if (connectMode) {
          exitConnectMode()
          return
        }
        if (selectMode) setSelectMode(false)
        setNodes((nds) => (nds.some((n) => n.selected) ? nds.map((n) => ({ ...n, selected: false })) : nds))
        setEdges((eds) => (eds.some((ed) => ed.selected) ? eds.map((ed) => ({ ...ed, selected: false })) : eds))
        setSelectedId(null)
        setMenu(null)
      } else if (e.key === 'Enter' && connectMode && !inField(document.activeElement) && !mod) {
        // Entrée en mode connexion : valide les liens sur les cibles
        // sélectionnées. Hors mode connexion, on laisse passer (le navigateur
        // l'utilise dans les champs et certains menus).
        e.preventDefault()
        confirmConnectRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    quickSave,
    duplicateSelected,
    undo,
    redo,
    openConnectFromSelection,
    selectMode,
    setNodes,
    setEdges,
    connectMode,
    exitConnectMode,
  ])

  // Liste de commandes pour la palette (Ctrl+K). Anti-slop : pas de tout
  // exposer, juste les actions de premier rang.
  const commands = useMemo(
    () => [
      {
        id: 'run',
        label: 'Exécuter le workflow',
        shortcut: '',
        keywords: 'run',
        action: () => doRun(null),
      },
      {
        id: 'save',
        label: 'Enregistrer maintenant',
        shortcut: 'Ctrl+S',
        keywords: 'save flush',
        action: quickSave,
      },
      {
        id: 'duplicate',
        label: 'Dupliquer le bloc sélectionné',
        shortcut: 'Ctrl+D',
        keywords: 'copy',
        action: duplicateSelected,
      },
      {
        id: 'connect',
        label: 'Connecter ce bloc à un autre',
        shortcut: 'Ctrl+L',
        keywords: 'link arête lien connect',
        action: openConnectFromSelection,
      },
      {
        id: 'undo',
        label: 'Annuler',
        shortcut: 'Ctrl+Z',
        keywords: 'undo annuler',
        action: undo,
      },
      {
        id: 'redo',
        label: 'Rétablir',
        shortcut: 'Ctrl+Y',
        keywords: 'redo rétablir',
        action: redo,
      },
      {
        id: 'help',
        label: 'Voir tous les raccourcis',
        shortcut: '?',
        keywords: 'shortcuts',
        action: () => setHelpOpen(true),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quickSave, duplicateSelected, undo, redo, openConnectFromSelection],
  )

  // ---- C.3 garde-fou beforeunload ----
  // Pendant que l'autosave debounce les 600 ms (ou pendant la requête PUT), une
  // fermeture/un F5 perdait la modif en silence. On bloque avec le prompt natif
  // du navigateur tant que `saveState !== 'saved'`. Le browser refusera d'afficher
  // un message custom (sécurité), il dira sa formule habituelle « les modifications
  // ne seront peut-être pas enregistrées ». C'est exactement ce qu'on veut.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (saveState === 'saving' || saveState === 'error') {
        e.preventDefault()
        e.returnValue = '' // Chrome / Edge exigent un returnValue non-undefined
        return ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [saveState])

  // ---- auto-hide the progress bar shortly after completion ----
  useEffect(() => {
    if (!progress.active && progress.done > 0) {
      const t = setTimeout(
        () => setProgress((p) => (p.active ? p : { ...p, done: 0, total: 0 })),
        2500,
      )
      return () => clearTimeout(t)
    }
  }, [progress.active, progress.done])

  // stop the progress animation if the editor unmounts mid-run
  useEffect(
    () => () => {
      if (anim.current.timer) clearInterval(anim.current.timer)
    },
    [],
  )

  // ---- stop attach/detach ----
  // A "stop" cap glues to the source block instead of being wired by an edge:
  // we set parentId on the stop and position it next to the source's output
  // handle. React Flow then moves the cap along with the parent automatically.
  const STOP_CAP_HALF = 11 // half height of the round cap (matches CSS)
  const attachStop = useCallback(
    (stopId, sourceId, sourceHandle) => {
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
    },
    [rf, setNodes, setEdges],
  )

  const detachStop = useCallback(
    (stopId) => {
      commitHistory()
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== stopId || !n.parentId) return n
          const parent = nds.find((x) => x.id === n.parentId)
          const abs = parent
            ? {
                x: (parent.position?.x || 0) + (n.position?.x || 0) + 30,
                y: (parent.position?.y || 0) + (n.position?.y || 0),
              }
            : n.position
          const { attachedTo, ...dataRest } = n.data || {}
          const { parentId, ...nodeRest } = n
          return { ...nodeRest, position: abs, data: dataRest }
        }),
      )
    },
    [setNodes, commitHistory],
  )

  // ---- connections ----
  // Stops attach instead of taking an edge. Union accepts many edges on its
  // single input; every other target handle keeps a single incoming edge.
  const onConnect = useCallback(
    (conn) => {
      // coalesce=true : les N appels successifs depuis `confirmConnect` (fan-in /
      // fan-out) collapsent en un seul pas d'historique.
      commitHistory({ coalesce: true })
      const target = nodes.find((n) => n.id === conn.target)
      if (target?.type === 'stop') {
        attachStop(conn.target, conn.source, conn.sourceHandle || 'out')
        return
      }
      setEdges((eds) => {
        const filtered =
          target?.type === 'union'
            ? eds
            : eds.filter((e) => !(e.target === conn.target && e.targetHandle === conn.targetHandle))
        return addEdge({ ...conn, animated: true }, filtered)
      })
    },
    [setEdges, nodes, attachStop, commitHistory],
  )

  // Confirme : produit cartésien sources × targets. Filtre de défense : pas
  // de boucle (source = target), la cible doit avoir une entrée. Handle cible
  // = `in1` pour SQL/Filter (table principale), `in` ailleurs. Un Union
  // accepte plusieurs liens sans remplacement.
  const confirmConnect = useCallback(() => {
    if (!connectMode) return
    const sourceIds = new Set(connectMode.sources.map((s) => s.id))
    const targets = nodes.filter(
      (n) =>
        connectMode.targets.has(n.id) && !sourceIds.has(n.id) && nodeInputs(n).length > 0,
    )
    if (targets.length === 0) {
      notify(
        connectMode.kind === 'fan-in'
          ? 'Cliquez un bloc destination avant de valider.'
          : 'Cliquez au moins un bloc cible avant de valider.',
        'warn',
      )
      return
    }
    let created = 0
    for (const src of connectMode.sources) {
      for (const t of targets) {
        const inputs = nodeInputs(t)
        const targetHandle = inputs.find((i) => i.handle === 'in1')?.handle || inputs[0].handle
        onConnect({
          source: src.id,
          sourceHandle: src.handle,
          target: t.id,
          targetHandle,
        })
        created += 1
      }
    }
    notify(created === 1 ? 'Lien créé.' : `${created} liens créés.`, 'ok')
    exitConnectMode()
  }, [connectMode, nodes, onConnect, exitConnectMode])
  // Garde le ref clavier en phase avec la dernière version de confirmConnect.
  useEffect(() => {
    confirmConnectRef.current = confirmConnect
  }, [confirmConnect])

  // ---- node helpers ----
  const addNode = (type) => {
    commitHistory()
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
        const a = nodeBox(src),
          b = nodeBox(tgt)
        const position = { x: (a.cx + b.cx) / 2 - 90, y: (a.cy + b.cy) / 2 - 40 }
        const outHandle = nodeOutputs({ type, data })[0]?.handle || 'out'
        const sfx = Math.random().toString(36).slice(2, 6)
        setNodes((nds) => [...nds, { id, type, position, data }])
        setEdges((eds) => [
          ...eds.filter((e) => e.id !== sel.id),
          {
            id: `${sel.source}-${id}-${sfx}`,
            source: sel.source,
            sourceHandle: sel.sourceHandle,
            target: id,
            targetHandle: 'in',
            animated: true,
          },
          {
            id: `${id}-${sel.target}-${sfx}`,
            source: id,
            sourceHandle: outHandle,
            target: sel.target,
            targetHandle: sel.targetHandle,
            animated: true,
          },
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
      const c = rf.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
      const j = type === 'frame' ? 0 : (n % 5) * 26
      position = { x: c.x - halfW + j, y: c.y - halfH + j }
    }
    setNodes((nds) => [...nds, { id, type, position, data }])
    setSelectedId(id)
  }

  const updateNodeData = useCallback(
    (id, patch) => {
      // coalesce=true : la frappe dans l'Inspector déclenche un updateNodeData
      // par keystroke ; on les fusionne en un seul pas d'historique tant que
      // la pause entre deux est < 500 ms.
      commitHistory({ coalesce: true })
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
            setEdges((eds) =>
              eds.filter((e) => !(e.source === id && gone.has(e.sourceHandle || 'out'))),
            )
          }
          // also drop stops glued to a now-deleted route output
          if (gone.size > 0) {
            return nds
              .filter(
                (n) =>
                  !(
                    n.type === 'stop' &&
                    n.data?.attachedTo?.sourceId === id &&
                    gone.has(n.data.attachedTo.sourceHandle)
                  ),
              )
              .map((nd) => (nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd))
          }
        }
        return nds.map((nd) => (nd.id === id ? { ...nd, data: { ...nd.data, ...patch } } : nd))
      })
      // Tell xyflow to remeasure this node's handles whenever the shape could have
      // changed (outputs reordered/added/removed, else toggled, split toggled,
      // mode flipped). Otherwise edges stay anchored to STALE handle positions
      // and visually attach to the wrong sortie after a reorder.
      if (
        patch &&
        ('outputs' in patch || 'else_enabled' in patch || 'mode' in patch || 'split' in patch)
      ) {
        updateNodeInternals(id)
      }
    },
    [setNodes, setEdges, updateNodeInternals, commitHistory],
  )

  const onDeleteEdge = useCallback(
    (edgeId) => {
      commitHistory()
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    },
    [setEdges, commitHistory],
  )

  // Drop every trace of a set of removed nodes: their links, and the per-node
  // caches keyed by id (status / schema / change-tracking). Shared by both
  // deletion paths — the context menu (below) and the Suppr/Backspace key (which
  // React Flow handles itself, then calls onNodesDelete).
  const forgetNodes = useCallback(
    (ids) => {
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
      const prune = (o) => {
        const r = { ...o }
        gone.forEach((id) => delete r[id])
        return r
      }
      setStatus(prune)
      setSchemas(prune)
      setRunStamps(prune)
    },
    [nodes, setEdges, setNodes],
  )

  // Remove a batch of blocks ourselves (used by the context menu). The Suppr key
  // is handled by React Flow directly — see onBeforeDelete / onNodesDelete on
  // <ReactFlow>. forgetNodes removes the nodes themselves and every adjacent
  // piece of state.
  const removeByIds = (ids) => {
    const arr = Array.isArray(ids) ? ids : [...ids]
    if (arr.length === 0) return
    commitHistory()
    forgetNodes(new Set(arr))
  }
  const deleteNode = (id) => removeByIds([id])
  const deleteSelection = () => removeByIds(nodes.filter((n) => n.selected).map((n) => n.id))
  // L'historique est capturé en amont (onBeforeDelete pour la voie clavier RF ;
  // removeByIds pour la voie menu contextuel) — ici on se contente du nettoyage
  // d'état dérivé (statuts, schémas, runStamps).
  const onNodesDelete = useCallback(
    (deleted) => {
      const ids = new Set(deleted.map((n) => n.id))
      forgetNodes([...ids])
    },
    [forgetNodes],
  )

  // ---- ComfyUI-style frames: dragging a group carries the blocks inside it ----
  const nodeBox = (n) => {
    const w = n.measured?.width ?? n.width ?? 212
    const h = n.measured?.height ?? n.height ?? 110
    return { cx: n.position.x + w / 2, cy: n.position.y + h / 2 }
  }
  const onNodeDragStart = useCallback(
    (_e, node) => {
      // E.1 — un drag déplace ; on capture l'état AVANT le mouvement pour que
      // Ctrl+Z restaure la position de départ. xyflow ne déclenche
      // onNodeDragStart que sur un drag réel (pas un clic), donc pas de pas
      // d'historique parasite.
      commitHistory()
      // Snapshot la position de départ pour pouvoir restaurer si l'utilisateur
      // *range* le bloc dans l'inventaire (drop sur le panneau au lieu d'un
      // déplacement réel — cf. onNodeDragStop).
      dragStartPositions.current = new Map([
        [node.id, { x: node.position?.x || 0, y: node.position?.y || 0 }],
      ])
      if (node.type !== 'frame') return
      const gx = node.position.x,
        gy = node.position.y
      const gw = node.data.w || 460,
        gh = node.data.h || 300
      const items = nodes
        // skip frames; skip glued stops — their position is relative to a parent
        // that's already in the scan, and they'll follow it automatically.
        .filter((n) => n.id !== node.id && n.type !== 'frame' && !n.parentId)
        .filter((n) => {
          const { cx, cy } = nodeBox(n)
          return cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh
        })
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))
      groupDrag.current = { id: node.id, x: gx, y: gy, items }
    },
    [nodes, commitHistory],
  )
  const onNodeDrag = useCallback(
    (_e, node) => {
      const s = groupDrag.current
      if (!s || s.id !== node.id || !s.items.length) return
      const dx = node.position.x - s.x,
        dy = node.position.y - s.y
      setNodes((nds) =>
        nds.map((n) => {
          const it = s.items.find((i) => i.id === n.id)
          return it ? { ...n, position: { x: it.x + dx, y: it.y + dy } } : n
        }),
      )
    },
    [setNodes],
  )
  const onNodeDragStop = useCallback(
    (event, node) => {
      groupDrag.current = null
      const snap = dragStartPositions.current
      dragStartPositions.current = null
      // Drop d'un seul bloc sur le panneau d'inventaire — symétrique du cas
      // multi-sélection. Les frames ne sont pas rangeables (ce sont des
      // conteneurs visuels, pas des étapes de pipeline).
      if (!node || node.type === 'frame') return
      const ev = event || {}
      if (!isOverBackpack(ev.clientX, ev.clientY)) return
      storeInBackpack([node.id])
      // Restaure la position d'origine, le geste = ranger, pas déplacer.
      if (snap && snap.has(node.id)) {
        const before = snap.get(node.id)
        setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: before } : n)))
      }
    },
    [storeInBackpack, setNodes],
  )

  // Duplicate a block (its settings, not its links) next to the original. We
  // regenerate the internal IDs (conditions, outputs) so the copy never reuses
  // its parent's handle ids — otherwise React Flow gets two handles with the
  // same id in the workflow, and a drag can latch onto the wrong one mid-stroke.
  const duplicateNode = (id) => {
    const src = nodes.find((n) => n.id === id)
    if (!src) return
    // coalesce=true : duplicateSelected appelle duplicateNode pour chaque bloc
    // sélectionné — on veut UN seul pas d'historique pour le batch.
    commitHistory({ coalesce: true })
    const newId = `${src.type}-${Math.random().toString(36).slice(2, 8)}`
    const data = JSON.parse(JSON.stringify(src.data))
    data.label = `${data.label || src.type} (copie)`
    if (src.type === 'export' && data.auto_name !== false)
      data.filename = `${(wfName || 'Workflow').trim()} - ${data.label}`
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
        const match = o.match
          ? { ...o.match, conditionId: condRemap[o.match.conditionId] || o.match.conditionId }
          : o.match
        return { ...o, id: nid, ...(match ? { match } : {}) }
      })
    }
    setNodes((nds) => [
      ...nds,
      {
        ...src,
        id: newId,
        selected: false,
        position: { x: (src.position?.x || 0) + 40, y: (src.position?.y || 0) + 40 },
        data,
      },
    ])
    setSelectedId(newId)
  }

  // close the context menu / run dropdown on any left click or Escape
  useEffect(() => {
    if (!menu && !runMenu && !addMenu) return
    const close = () => {
      setMenu(null)
      setRunMenu(false)
      setAddMenu(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
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

  // Ouvre le dossier `exports/<workflow>/` où les blocs Export écrivent leurs fichiers.
  const openWorkflowExportFolder = useCallback(async () => {
    setBanner(null)
    try {
      await api.openFilesFolder(pid, exportSubdir(wfName))
    } catch (e) {
      setBanner({ type: 'error', text: `Impossible d'ouvrir le dossier : ${e.message || e}` })
    }
  }, [pid, wfName])

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
      setBanner({
        type: 'error',
        text: `Impossible de générer la documentation : ${e.message || e}`,
      })
    }
  }

  const applyOneResult = (nid, r) => {
    setStatus((prev) => ({
      ...prev,
      [nid]: {
        ran: true,
        rows: r.row_count ?? r.rows ?? 0,
        error: null,
        outputs: r.outputs || {},
        cleanReport: r.clean_report,
        locked: r.locked,
        cached: r.cached,
        exported: r.exported,
        sheet: r.sheet,
        skippedEmpty: r.skipped_empty,
        inputRows: r.input_rows,
        unrouted: r.unrouted_rows ?? 0,
      },
    }))
    if (r.columns) setSchemas((prev) => ({ ...prev, [nid]: r.columns }))
  }

  // ---- per-node progress (non-source blocks) ------------------------------
  // Sources use real `node_progress` (rows_read / total_rows). Other blocks
  // still use a smooth estimated bar when no finer signal exists.
  const getRate = () => {
    const v = parseFloat(localStorage.getItem('roade.srcRateMsPerByte'))
    return Number.isFinite(v) && v > 0 ? v : 0.004 // default ≈ 4 s / Mo
  }
  const saveRate = (r) => {
    const blended = 0.5 * getRate() + 0.5 * r // smooth (EMA) so one slow run can't skew it
    localStorage.setItem(
      'roade.srcRateMsPerByte',
      String(Math.min(0.05, Math.max(0.0003, blended))),
    )
  }
  const estimateMs = (node) => {
    if (node?.type === 'source') {
      const bytes = files.find((f) => f.name === node?.data?.file)?.size || 0
      return Math.max(800, bytes * getRate())
    }
    return 1000 // other blocks: short default, asymptote handles overruns
  }
  const stopAnim = () => {
    if (anim.current.timer) {
      clearInterval(anim.current.timer)
      anim.current.timer = null
    }
  }
  const startNodeAnim = (node) => {
    stopAnim()
    anim.current.start = performance.now()
    anim.current.est = estimateMs(node)
    setNodeFrac(0)
    anim.current.timer = setInterval(() => {
      const elapsed = performance.now() - anim.current.start
      const frac = 1 - Math.exp((-2.2 * elapsed) / anim.current.est) // ~0.89 at est, creeps after
      setNodeFrac(Math.min(0.97, frac))
    }, 80)
  }
  const finishNodeAnim = (node, result) => {
    stopAnim()
    const elapsed = performance.now() - anim.current.start
    const bytes = files.find((f) => f.name === node?.data?.file)?.size || 0
    if (
      node?.type === 'source' &&
      result &&
      !result.cached &&
      !result.locked &&
      bytes > 50000 &&
      elapsed > 300
    ) {
      saveRate(elapsed / bytes) // calibrate from this real read
    }
    setNodeFrac(1)
    setTimeout(() => setNodeFrac(0), 150)
  }

  // Streaming run: live progress, ComfyUI-style.
  const doRun = async (onlyNode = null, force = false, allExports = false) => {
    if (busy) return
    // E.3 — pré-run : sur un run complet du workflow, on bloque si des erreurs
    // statiques sont visibles. On laisse passer le run d'un nœud unique (l'user
    // peut explorer un sous-graphe encore en cours d'édition).
    if (!onlyNode) {
      const preflightNow = preflightWorkflow(nodes, edges)
      if (hasBlockingIssues(preflightNow)) {
        const firstId = Object.keys(preflightNow)[0]
        const first = preflightNow[firstId][0]
        const label = nodes.find((n) => n.id === firstId)?.data?.label || firstId
        const more = Object.keys(preflightNow).length - 1
        notify(`${label} : ${first.message}` + (more > 0 ? ` (+${more} bloc(s))` : ''), 'error')
        return
      }
    }
    setBanner(null)
    setBusy(true)
    setProgress({
      active: true,
      total: 0,
      done: 0,
      currentId: null,
      currentLabel: 'préparation…',
      startedAt: Date.now(),
    })
    await flushSave()
    let recomputed = 0,
      reused = 0
    const clearStartTimer = () => {
      if (startTimer.current) {
        clearTimeout(startTimer.current)
        startTimer.current = null
      }
    }
    runStreamRef.current = api.runStream(
      pid,
      wid,
      onlyNode,
      (ev) => {
        if (ev.event === 'start') {
          setProgress((p) => ({
            ...p,
            active: true,
            total: ev.total,
            done: 0,
            currentId: null,
            currentLabel: '',
          }))
        } else if (ev.event === 'node_start') {
          // Defer the "exécution…" glow: a cached/instant block finishes before this
          // fires, so reused blocks no longer flash as if they were recomputed.
          clearStartTimer()
          const node = nodes.find((n) => n.id === ev.node_id)
          if (node?.type === 'source') {
            // Sources : affichage immédiat pour que la progression lignes/lignes
            // totales soit visible dès les premiers events `node_progress`.
            stopAnim()
            setNodeFrac(0)
            setSourceProgress({ nodeId: ev.node_id, rowsRead: 0, totalRows: 0 })
            setProgress((p) => ({
              ...p,
              currentId: ev.node_id,
              currentLabel: ev.label || ev.type,
            }))
          } else {
            startTimer.current = setTimeout(() => {
              startTimer.current = null
              setProgress((p) => ({ ...p, currentId: ev.node_id, currentLabel: ev.label || ev.type }))
              setSourceProgress(null)
              startNodeAnim(node)
            }, 150)
          }
        } else if (ev.event === 'node_progress') {
          const total = ev.total_rows || 1
          const read = ev.rows_read || 0
          setNodeFrac(Math.min(0.999, read / total))
          setSourceProgress({
            nodeId: ev.node_id,
            rowsRead: read,
            totalRows: ev.total_rows || 0,
          })
        } else if (ev.event === 'node_done') {
          const dn = nodes.find((n) => n.id === ev.node_id)
          if (startTimer.current)
            clearStartTimer() // finished before the glow showed
          else finishNodeAnim(dn, ev.result) // glow was visible — wind it down
          applyOneResult(ev.node_id, ev.result)
          if (ev.result?.cached) reused++
          else recomputed++
          // this block is now up to date — remember the config it ran with
          if (dn) setRunStamps((s) => ({ ...s, [ev.node_id]: nodeDataSig(dn.data) }))
          setSourceProgress((sp) => (sp?.nodeId === ev.node_id ? null : sp))
          setProgress((p) => ({ ...p, done: p.done + 1, currentId: null }))
        } else if (ev.event === 'done') {
          clearStartTimer()
          stopAnim()
          setNodeFrac(0)
          setSourceProgress(null)
          setBusy(false)
          setProgress((p) => ({ ...p, active: false, currentId: null, done: p.total }))
          api.listFiles(pid).then(setFiles)
          const bits = []
          if (recomputed) bits.push(`${recomputed} recalculé${recomputed > 1 ? 's' : ''}`)
          if (reused) bits.push(`${reused} réutilisé${reused > 1 ? 's' : ''} (inchangé)`)
          if (bits.length) setBanner({ type: 'info', text: bits.join(' · ') })
        } else if (ev.event === 'error') {
          clearStartTimer()
          stopAnim()
          setNodeFrac(0)
          setSourceProgress(null)
          setBusy(false)
          setProgress((p) => ({ ...p, active: false, currentId: null }))
          if (ev.node_id)
            setStatus((s) => ({
              ...s,
              [ev.node_id]: { ...(s[ev.node_id] || {}), error: ev.message, ran: false },
            }))
          setBanner({ type: 'error', text: ev.message || "Erreur d'exécution" })
          api.listFiles(pid).then(setFiles)
        } else if (ev.event === 'aborted') {
          // E.2 — annulation propre côté serveur. On ne touche pas au cache
          // (les blocs déjà exécutés gardent leur parquet), on signale juste
          // que le run s'est arrêté volontairement.
          clearStartTimer()
          stopAnim()
          setNodeFrac(0)
          setSourceProgress(null)
          setBusy(false)
          setProgress((p) => ({ ...p, active: false, currentId: null }))
          setBanner({ type: 'info', text: 'Run interrompu.' })
        }
      },
      force,
      allExports,
    )
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
    const withInputs = [
      'sql',
      'dedup',
      'validate',
      'pivot',
      'clean',
      'calc',
      'filter',
      'cols',
      'report',
      'union',
    ]
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

  // E.4 + E.5 — un seul useConfirm pour tout l'éditeur, partagé via le context
  // pour que les composants imbriqués (ButtonEdge, …) puissent en bénéficier.
  const [askConfirm, confirmNode] = useConfirm()

  const ctx = useMemo(
    () => ({
      status,
      running: progress.active ? progress.currentId : null,
      sourceProgress,
      onPreview: (id, tab) => setPreviewNode({ id, tab }),
      onRunNode: (id, force) => doRun(id, force),
      onDeleteEdge,
      onNodeDataChange: updateNodeData,
      confirmDelete: askConfirm,
      onOpenExportFolder: openWorkflowExportFolder,
    }),
    [
      status,
      progress.active,
      progress.currentId,
      sourceProgress,
      nodes,
      edges,
      wfName,
      onDeleteEdge,
      updateNodeData,
      askConfirm,
      openWorkflowExportFolder,
    ],
  )

  // Stale blocks: a node is stale if its config changed since its last run, or
  // if it never ran, or if anything upstream is stale (matches the backend's
  // incremental recompute). Propagated in topological order over the edges.
  const dirtyMap = useMemo(() => {
    const self = {}
    for (const n of nodes) {
      if (n.type === 'frame' || n.type === 'stop') {
        self[n.id] = false
        continue
      } // not computed
      const stamp = runStamps[n.id]
      self[n.id] = stamp === undefined ? true : nodeDataSig(n.data) !== stamp
    }
    const indeg = {},
      adj = {},
      parents = {}
    nodes.forEach((n) => {
      indeg[n.id] = 0
      adj[n.id] = []
    })
    edges.forEach((e) => {
      if (adj[e.source] && indeg[e.target] !== undefined) {
        adj[e.source].push(e.target)
        indeg[e.target]++
      }
      ;(parents[e.target] = parents[e.target] || []).push(e.source)
    })
    const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
    const dirty = {}
    while (q.length) {
      const id = q.shift()
      dirty[id] = self[id] || (parents[id] || []).some((p) => dirty[p])
      for (const t of adj[id]) if (--indeg[t] === 0) q.push(t)
    }
    nodes.forEach((n) => {
      if (dirty[n.id] === undefined) dirty[n.id] = self[n.id]
    })
    return dirty
  }, [nodes, edges, runStamps])

  // E.3 — validation statique des erreurs structurelles (entrée non branchée,
  // SQL vide, cycle, …). Recomputée à chaque modif de nodes/edges, propagée
  // aux nodes via `data.__preflight` pour que `withComment` puisse afficher
  // le badge.
  const preflight = useMemo(() => preflightWorkflow(nodes, edges), [nodes, edges])

  // Sorties branchées par nœud (`{nodeId: Set<sourceHandle>}`). Sert à signaler
  // sur Dédoublons / Validation les ancres orphelines : « cette sortie existe
  // mais aucun bloc en aval ne s'en sert ». Pas une erreur — juste un repère
  // pour ne pas oublier une branche.
  const usedHandlesByNode = useMemo(() => {
    const m = {}
    for (const e of edges) {
      const h = e.sourceHandle || 'out'
      if (!m[e.source]) m[e.source] = new Set()
      m[e.source].add(h)
    }
    return m
  }, [edges])

  // highlight the currently-executing node (ComfyUI-style) + flag stale blocks.
  // Frames are dragged by their title bar only and rendered behind the blocks.
  const decoratedNodes = useMemo(
    () =>
      nodes.map((n) => {
        if (n.type === 'frame') return { ...n, dragHandle: '.group-titlebar', zIndex: -1 }
        // glued stops follow their parent — pin them in place and float above
        if (n.type === 'stop' && n.parentId) return { ...n, draggable: false, zIndex: 5 }
        const active = progress.currentId === n.id
        const dirty = dirtyMap[n.id]
        const issues = preflight[n.id]
        const stt = status[n.id]
        const lost = stt?.ran ? stt.unrouted ?? 0 : 0
        const unused = unusedOutputsOf(n, usedHandlesByNode[n.id])
        const isConnectSource = connectMode?.sources?.some((s) => s.id === n.id) || false
        const isConnectTarget = connectMode?.targets?.has(n.id) || false
        const needsPatch =
          active || dirty || issues || lost || unused || isConnectSource || isConnectTarget
        if (!needsPatch && !connectMode) return n
        const newData = { ...n.data }
        if (dirty) newData.__dirty = true
        if (issues) newData.__preflight = issues
        if (lost > 0) newData.__lost = lost
        if (unused) newData.__unusedHandles = unused
        const className = active
          ? 'rf-active'
          : isConnectSource
            ? 'rf-connect-source'
            : undefined
        // En mode connexion on pilote `selected` depuis notre Set de cibles —
        // sinon on laisse React Flow gérer le sien.
        const patched = { ...n, className, data: newData }
        if (connectMode) patched.selected = isConnectTarget
        return patched
      }),
    [nodes, progress.currentId, dirtyMap, preflight, status, usedHandlesByNode, connectMode],
  )

  // colour links by the data type leaving the source port; make them deletable
  const decoratedEdges = useMemo(() => {
    return edges.map((e) => {
      const srcNode = nodes.find((n) => n.id === e.source)
      const color =
        outputColorOf(srcNode, e.sourceHandle) ||
        HANDLE_COLOR[e.sourceHandle] ||
        TYPE_COLOR[srcNode?.type] ||
        '#9aa3b2'
      return { ...e, type: 'deletable', animated: false, style: { ...e.style, stroke: color } }
    })
  }, [edges, nodes])

  const previewId = previewNode?.id
  const previewLabel = nodes.find((n) => n.id === previewId)?.data?.label || previewId

  return (
    <EditorContext.Provider value={ctx}>
      <div className="editor">
        <div className="editor-toolbar">
          <button className="ghost" onClick={onBack}>
            ← Projet
          </button>
          <input className="wf-name" value={wfName} onChange={(e) => setWfName(e.target.value)} />
          <div className="tb-add">
            <button
              className="add-btn"
              onClick={(e) => {
                e.stopPropagation()
                setAddMenu((v) => !v)
              }}
              title="Ajouter un bloc au workflow"
            >
              <Icon name="plus" size={14} /> Ajouter un bloc <Icon name="down" size={11} />
            </button>
            {addMenu && (
              <div className="add-palette" onClick={(e) => e.stopPropagation()}>
                {BLOCK_PALETTE.map(([type, label, desc]) => (
                  <button
                    key={type}
                    className="add-item"
                    onClick={() => {
                      addNode(type)
                      setAddMenu(false)
                    }}
                  >
                    <span
                      className="add-swatch"
                      style={{ background: TYPE_COLOR[type] || '#888' }}
                    />
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
              {saveState === 'saving'
                ? 'enregistrement…'
                : saveState === 'error'
                  ? 'erreur de sauvegarde'
                  : 'enregistré'}
            </span>
            <button
              className="ghost icon-only"
              onClick={openWorkflowExportFolder}
              title="Ouvrir le dossier des exports"
              aria-label="Ouvrir le dossier des exports"
            >
              <Icon name="folder" />
            </button>
            <button
              className="ghost"
              onClick={() => setFlowOpen(true)}
              title="Vue d'ensemble : qui va où, des sources aux exports"
            >
              <Icon name="flow" /> Carte des flux
            </button>
            <button
              className="ghost"
              onClick={documentWorkflow}
              title="Exporter un Excel expliquant, étape par étape, comment chaque fichier de sortie est produit"
            >
              <Icon name="download" /> Documenter
            </button>
            <div className="run-split">
              {busy ? (
                // E.2 — pendant l'exécution, le bouton devient un Stop. Coupe
                // le flux SSE côté client (UI rend la main immédiatement) et
                // demande l'annulation au runner (qui s'arrêtera entre 2 blocs).
                <button
                  className="btn-stop"
                  onClick={() => {
                    runStreamRef.current?.close?.()
                    runStreamRef.current = null
                    api.cancelRun(pid, wid).catch(() => {})
                    setBusy(false)
                    setProgress((p) => ({ ...p, active: false, currentId: null }))
                    setBanner({ type: 'info', text: 'Run interrompu.' })
                  }}
                  title="Interrompre le run en cours"
                >
                  <Icon name="x" size={12} /> Stop
                </button>
              ) : (
                <button className="primary" disabled={busy} onClick={() => doRun(null)}>
                  Exécuter le workflow
                </button>
              )}
              {!busy && (
                <button
                  className="primary run-caret"
                  title="Options d'exécution"
                  aria-label="Options d'exécution"
                  aria-haspopup="menu"
                  aria-expanded={runMenu}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRunMenu((v) => !v)
                  }}
                >
                  <Icon name="down" size={12} />
                </button>
              )}
              {runMenu && (
                <div
                  className="ctx-menu run-menu"
                  role="menu"
                  aria-label="Options d'exécution"
                  tabIndex={-1}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="run-menu-row">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setRunMenu(false)
                        doRun(null, true)
                      }}
                    >
                      <Icon name="refresh" size={13} /> Tout recalculer
                    </button>
                    <MenuInfo>
                      Ignore le cache et recalcule chaque bloc. Les blocs verrouillés restent figés.
                    </MenuInfo>
                  </div>
                  <div className="run-menu-sep" />
                  <div className="run-menu-row">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setRunMenu(false)
                        doRun(null, true, true)
                      }}
                    >
                      <Icon name="download" size={13} /> Super run : tout recalculer et exporter
                    </button>
                    <MenuInfo>
                      Génère tous les fichiers de sortie, y compris les blocs Export désactivés
                      (sans les réactiver).
                    </MenuInfo>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="editor-main">
          {/* overlays float above the canvas so nothing shifts when they appear */}
          <div className="overlays">
            <ProgressBar
              progress={progress}
              frac={nodeFrac}
              sourceProgress={sourceProgress}
              onGo={goToNode}
            />
            {banner && (
              <div
                className={`banner ${banner.type}`}
                role={banner.type === 'error' ? 'alert' : 'status'}
                aria-live={banner.type === 'error' ? 'assertive' : 'polite'}
              >
                {banner.text}
                <button className="ghost small" onClick={() => setBanner(null)}>
                  <Icon name="x" />
                </button>
              </div>
            )}
            {connectMode && (
              <ConnectBanner
                kind={connectMode.kind}
                sources={connectMode.sources
                  .map((s) => nodes.find((n) => n.id === s.id))
                  .filter(Boolean)}
                sourceHandle={connectMode.sources[0]?.handle}
                outputs={
                  connectMode.kind === 'fan-out'
                    ? nodeOutputs(nodes.find((n) => n.id === connectMode.sources[0]?.id))
                    : []
                }
                targetCount={connectMode.targets.size}
                onChangeHandle={(h) =>
                  setConnectMode((m) =>
                    m ? { ...m, sources: [{ ...m.sources[0], handle: h }] } : m,
                  )
                }
                onConfirm={confirmConnect}
                onCancel={exitConnectMode}
              />
            )}
          </div>
          <div
            className={`canvas ${selectMode ? 'selecting' : ''}`}
            ref={canvasRef}
            onDrop={onCanvasDrop}
            onDragOver={onCanvasDragOver}
          >
            <ReactFlow
              nodes={decoratedNodes}
              edges={decoratedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onSelectionDragStart={onSelectionDragStart}
              onSelectionDragStop={onSelectionDragStop}
              onNodesDelete={onNodesDelete}
              onBeforeDelete={onBeforeDelete}
              onNodeClick={(e, n) => {
                // Mode click-to-connect : clic = toggle (fan-out) ou remplace
                // (fan-in). Pas d'ouverture d'éditeur. Les blocs sources sont
                // interdits comme cibles (on ne se connecte pas à soi-même).
                if (connectMode) {
                  if (connectMode.sources.some((s) => s.id === n.id)) return
                  if (nodeInputs(n).length === 0) {
                    notify("Ce bloc n'a pas d'entrée — choisissez une autre cible.", 'warn')
                    return
                  }
                  toggleConnectTarget(n.id)
                  return
                }
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
              onSelectionContextMenu={(e, ns) => {
                e.preventDefault()
                setMenu({ id: ns[0]?.id, x: e.clientX, y: e.clientY })
              }}
              onPaneClick={() => {
                // En mode connexion on protège l'utilisateur d'un clic accidentel
                // sur le canevas : il ne perd pas ses cibles. Échap reste la
                // sortie explicite.
                if (connectMode) {
                  setMenu(null)
                  return
                }
                setSelectedId(null)
                setMenu(null)
              }}
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
            {/* E.9 — légende discrète des deux signaux qui se ressemblent (point
                jaune « modifié depuis le dernier run » vs badge « non exécuté »).
                Au survol seul, ne mange pas de pixels en permanence. */}
            <div
              className={`canvas-legend ${legendOpen ? 'open' : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={legendOpen}
              aria-label={legendOpen ? 'Replier la légende' : 'Déplier la légende'}
              onClick={() => setLegendOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setLegendOpen((v) => !v)
                }
              }}
            >
              <span className="legend-summary">Légende</span>
              {legendOpen && (
                <ul>
                  <li>
                    <span className="legend-dot legend-dot-error" aria-hidden="true" />
                    <span>
                      <b>Erreur de configuration</b> — le bloc va échouer à l'exécution
                      (entrée manquante, colonne non choisie…). Survol = détail.
                    </span>
                  </li>
                  <li>
                    <span className="legend-dot legend-dot-dirty" aria-hidden="true" />
                    <span>
                      <b>Périmé</b> — la config a changé depuis le dernier run, le bloc sera
                      recalculé.
                    </span>
                  </li>
                  <li>
                    <span className="legend-dot legend-dot-loss" aria-hidden="true" />
                    <span>
                      <b>Données perdues</b> — des lignes ne correspondent à aucune sortie (non
                      redistribuées).
                    </span>
                  </li>
                  <li>
                    <span className="legend-dot legend-dot-unused" aria-hidden="true" />
                    <span>
                      <b>Sortie non reliée</b> — sur un bloc à plusieurs sorties (Dédoublons,
                      Validation), une des ancres n'a aucun lien aval.
                    </span>
                  </li>
                  <li>
                    <span className="legend-badge" aria-hidden="true">
                      non exécuté
                    </span>
                    <span>
                      <b>Jamais exécuté</b> — aucun résultat n'a été matérialisé pour ce bloc.
                    </span>
                  </li>
                </ul>
              )}
            </div>
            {nodes.length === 0 && (
              <div className="canvas-hint">
                Ajoutez un bloc <b>📥 Source</b> pour commencer, puis reliez-le à un bloc{' '}
                <b>🧮 SQL</b>.
              </div>
            )}
            {selectMode && nodes.length > 0 && (
              <div className="canvas-hint sel-hint">
                Mode sélection : dessinez un cadre pour sélectionner, <b>Maj+clic</b> pour
                ajouter/retirer un bloc. Puis <b>Suppr</b> ou clic droit → <b>Supprimer</b>.
              </div>
            )}
            <Backpack
              open={backpackOpen}
              onToggle={() => setBackpackOpen((v) => !v)}
              items={backpack}
              dropTargetActive={selectionDragActive}
              onAddSelection={addSelectionToBackpack}
              onDelete={deleteBackpackItem}
              onRename={renameBackpackItem}
              onInsert={insertBackpackAtCenter}
              onItemDragStart={onBackpackItemDragStart}
            />
          </div>
        </div>

        {previewNode && (
          <DataPreview
            pid={pid}
            wid={wid}
            nodeId={previewId}
            label={previewLabel}
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
            pid={pid}
            wid={wid}
            node={nodes.find((n) => n.id === editorNode)}
            inputs={inspectorInputs}
            files={files}
            status={status[editorNode]}
            wfName={wfName}
            onChange={updateNodeData}
            onSchema={onSchema}
            onDelete={(id) => {
              deleteNode(id)
              setEditorNode(null)
            }}
            onRun={(force = false) => doRun(editorNode, force)}
            running={progress.active && progress.currentId === editorNode}
            onPreview={(id, handle) => setPreviewNode({ id, handle })}
            onClose={() => setEditorNode(null)}
          />
        )}

        {flowOpen && (
          <WorkflowFlow
            nodes={nodes.filter((n) => n.type !== 'frame')}
            edges={edges}
            status={status}
            onOpenNode={(id) => {
              setFlowOpen(false)
              setSelectedId(id)
              setEditorNode(id)
            }}
            onClose={() => setFlowOpen(false)}
          />
        )}

        {menu &&
          (() => {
            const mn = nodes.find((n) => n.id === menu.id)
            const selCount = nodes.filter((n) => n.selected).length
            const bulk = selCount >= 2 && mn?.selected
            return (
              <div
                className="ctx-menu"
                role="menu"
                aria-label="Actions sur le bloc"
                tabIndex={-1}
                style={{ left: menu.x, top: menu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                {!bulk && mn?.type === 'frame' && (
                  <div className="ctx-color">
                    <span className="ctx-color-lbl">Couleur du cadre</span>
                    <div className="ctx-swatches" role="radiogroup" aria-label="Couleur du cadre">
                      {FRAME_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`ctx-swatch ${(mn.data.color || '#5b6bb0') === c ? 'on' : ''}`}
                          style={{ background: c }}
                          title={c}
                          aria-label={`Couleur ${c}`}
                          role="radio"
                          aria-checked={(mn.data.color || '#5b6bb0') === c}
                          onClick={() => updateNodeData(menu.id, { color: c })}
                        />
                      ))}
                      <label className="ctx-swatch custom" title="Couleur personnalisée">
                        <input
                          type="color"
                          aria-label="Couleur personnalisée"
                          value={mn.data.color || '#5b6bb0'}
                          onChange={(e) => updateNodeData(menu.id, { color: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                )}
                {bulk ? (
                  <>
                    {(() => {
                      // Fan-in : on connecte les N blocs sélectionnés (qui ont
                      // une sortie) vers un destinataire qu'on cliquera ensuite.
                      const selected = nodes.filter((x) => x.selected)
                      const validSources = selected.filter((s) => nodeOutputs(s).length > 0)
                      if (validSources.length < 2) return null
                      return (
                        <button
                          role="menuitem"
                          onClick={() => enterConnectMode(validSources.map((s) => s.id))}
                        >
                          <Icon name="flow" size={13} /> Connecter ces {validSources.length} blocs
                          à…
                        </button>
                      )
                    })()}
                    <button
                      className="danger"
                      role="menuitem"
                      onClick={() => {
                        deleteSelection()
                        setMenu(null)
                      }}
                    >
                      <Icon name="trash" size={13} /> Supprimer la sélection ({selCount})
                    </button>
                  </>
                ) : (
                  <>
                    {mn?.type === 'stop' && mn.data?.attachedTo && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          detachStop(menu.id)
                          setMenu(null)
                        }}
                      >
                        <Icon name="select" size={13} /> Détacher
                      </button>
                    )}
                    {mn?.type !== 'stop' && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          duplicateNode(menu.id)
                          setMenu(null)
                        }}
                      >
                        <Icon name="plus" size={13} /> Dupliquer
                      </button>
                    )}
                    {mn && nodeOutputs(mn).length > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => enterConnectMode([menu.id])}
                      >
                        <Icon name="flow" size={13} /> Connecter à…
                      </button>
                    )}
                    <button
                      className="danger"
                      role="menuitem"
                      onClick={() => {
                        deleteNode(menu.id)
                        setMenu(null)
                      }}
                    >
                      <Icon name="trash" size={13} /> Supprimer
                    </button>
                  </>
                )}
              </div>
            )
          })()}
        {confirmNode}
        <ConnectDialog
          open={!!connectFor}
          sourceId={connectFor}
          nodes={nodes}
          edges={edges}
          outputsFor={nodeOutputs}
          inputsFor={nodeInputs}
          onConfirm={(conn) => {
            onConnect(conn)
            setConnectFor(null)
            notify('Lien créé.', 'ok')
          }}
          onClose={() => setConnectFor(null)}
        />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={commands}
        />
        <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
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
      <span className="info-pop" role="tooltip">
        {children}
      </span>
    </span>
  )
}

function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}

// Bannière du mode « click-to-connect » : rappelle qui est le bloc source,
// laisse choisir le port de sortie quand il y en a plusieurs (Dédoublons /
// Validation), compte les cibles sélectionnées, et propose Connecter / Annuler.
function ConnectBanner({
  kind,
  sources,
  sourceHandle,
  outputs,
  targetCount,
  onChangeHandle,
  onConfirm,
  onCancel,
}) {
  const fanIn = kind === 'fan-in'
  // fan-out : on nomme le source unique. fan-in : on liste les premiers
  // labels + un « +N autres » au-delà de 3, pour rester sur une ligne.
  const headline = fanIn ? (
    <>
      Connexion de <b>{sources.length} blocs</b> ({fmtSourcesLabel(sources)}) vers…
    </>
  ) : (
    <>
      Connexion depuis <b>{sources[0]?.data?.label || sources[0]?.type || '?'}</b>
    </>
  )
  return (
    <div className="banner connect-banner" role="status" aria-live="polite">
      <Icon name="flow" size={13} />
      <span>{headline}</span>
      {!fanIn && outputs.length > 1 && (
        <select
          className="connect-banner-handle"
          value={sourceHandle}
          onChange={(e) => onChangeHandle(e.target.value)}
          title="Port de sortie"
        >
          {outputs.map((o) => (
            <option key={o.handle} value={o.handle}>
              {o.label || o.handle}
            </option>
          ))}
        </select>
      )}
      <span className="connect-banner-hint">
        {fanIn ? 'cliquez le bloc destination' : 'cliquez chaque bloc cible'} —{' '}
        <kbd>Entrée</kbd> pour valider
      </span>
      <span className="connect-banner-count">
        {fanIn
          ? targetCount === 0
            ? 'aucune destination'
            : '1 destination'
          : targetCount === 0
            ? 'aucune cible'
            : targetCount === 1
              ? '1 cible'
              : `${targetCount} cibles`}
      </span>
      <button
        className="primary small"
        onClick={onConfirm}
        disabled={targetCount === 0}
        title="Connecter (Entrée)"
      >
        Connecter
      </button>
      <button className="ghost small" onClick={onCancel} title="Annuler (Échap)">
        <Icon name="x" />
      </button>
    </div>
  )
}

function fmtSourcesLabel(sources) {
  const labels = sources.map((s) => s.data?.label || s.type)
  if (labels.length <= 3) return labels.join(', ')
  return `${labels.slice(0, 3).join(', ')}, +${labels.length - 3}`
}

function ProgressBar({ progress, frac = 0, sourceProgress = null, onGo }) {
  if (!progress.active && progress.done === 0) return null
  const within = progress.active ? Math.min(0.999, frac) : 0
  const pct = progress.total
    ? Math.min(100, Math.round(((progress.done + within) / progress.total) * 100))
    : 0
  const elapsed = progress.startedAt ? Date.now() - progress.startedAt : 0
  const srcRows =
    sourceProgress?.nodeId === progress.currentId && sourceProgress.totalRows > 0
      ? sourceProgress
      : null
  return (
    <div
      className={`progress-wrap ${progress.active ? 'on' : 'off'}`}
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-busy={progress.active}
    >
      <div
        className={`progress-track ${progress.active ? 'busy' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={
          progress.active
            ? `Exécution${progress.currentLabel ? ` : ${progress.currentLabel}` : ''}`
            : 'Exécution terminée'
        }
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">
        {progress.active ? (
          <>
            <span className="pulse-dot" />
            {progress.currentLabel ? (
              progress.currentId ? (
                <>
                  Exécution :{' '}
                  <button
                    className="run-goto"
                    onClick={() => onGo?.(progress.currentId)}
                    title="Aller à ce bloc sur le plan"
                  >
                    {progress.currentLabel} <Icon name="maximize" size={11} />
                  </button>
                </>
              ) : (
                <>
                  Exécution : <b>{progress.currentLabel}</b>
                </>
              )
            ) : (
              'préparation…'
            )}
            {progress.total > 0 && (
              <span className="pmeta">
                {' '}
                · {progress.done}/{progress.total} · {pct}%
              </span>
            )}
            {srcRows && (
              <span className="pmeta">
                {' '}
                · {srcRows.rowsRead.toLocaleString('fr-FR')}/
                {srcRows.totalRows.toLocaleString('fr-FR')} lignes
              </span>
            )}
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
    if (n.parentId) o.parentId = n.parentId // stops glued to a block
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
    placed.add(n.id)
    out.push(n)
  }
  for (const n of nds) place(n)
  return out
}
