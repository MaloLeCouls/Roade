import { useEffect, useMemo } from 'react'
import Icon from './Icon'
import { typeLabel } from './Inspector'

/*
 * Whole-workflow flow map: a multi-level (left→right) diagram of every block,
 * positioned by topological depth, with links whose thickness is proportional to
 * the number of rows flowing through them and whose colour matches the source
 * output. Lets the user see, at a glance, "what goes where" from sources to
 * exports — handy when a workflow has many validation/branching blocks.
 */

const TYPE_COLOR = {
  source: '#4E79A7', sql: '#59734F', dedup: '#8d6ea0', validate: '#5b6bb0',
  pivot: '#b1605f', clean: '#4f9a93', calc: '#b05a86', filter: '#3f8c8c', cols: '#7a6cb0',
  union: '#8a7560', export: '#c08436',
}
const HANDLE_COLOR = {
  kept: '#3f7a4f', dups: '#c0392f', uniques: '#3556a8', valid: '#3f7a4f', invalid: '#c0392f',
}

const NODEW = 158, NODEH = 50, COLW = 232, ROWH = 88, MX = 40, MY = 36

function computeLevels(nodes, edges) {
  const level = {}
  nodes.forEach((n) => { level[n.id] = 0 })
  for (let it = 0; it <= nodes.length; it++) {
    let changed = false
    for (const e of edges) {
      if (!(e.source in level) || !(e.target in level)) continue
      if (level[e.target] < level[e.source] + 1) { level[e.target] = level[e.source] + 1; changed = true }
    }
    if (!changed) break
  }
  return level
}

function rowsOf(status, id) {
  const s = status?.[id]
  if (!s) return null
  if (s.rows != null) return s.rows
  if (s.outputs) return Object.values(s.outputs).reduce((a, b) => a + (b || 0), 0)
  return null
}

function handleCount(status, srcId, handle) {
  const s = status?.[srcId]
  if (!s) return null
  if (s.outputs && s.outputs[handle] != null) return s.outputs[handle]
  if (s.rows != null) return s.rows
  return null
}

function outColor(node, handle) {
  if (!node) return '#9aa3b2'
  if (node.type === 'validate' && node.data?.mode === 'route') {
    const o = (node.data.outputs || []).find((x) => x.id === handle)
    if (o) return o.color || TYPE_COLOR.validate
    if (handle === 'else') return node.data.else_color || '#9aa3b2'
  }
  return HANDLE_COLOR[handle] || TYPE_COLOR[node.type] || '#9aa3b2'
}

function clip(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || '') }
const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('fr-FR'))

export default function WorkflowFlow({ nodes, edges, status, onOpenNode, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const layout = useMemo(() => {
    const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]))
    const level = computeLevels(nodes, edges)
    const byLevel = {}
    nodes.forEach((n) => { const L = level[n.id] || 0; (byLevel[L] = byLevel[L] || []).push(n) })
    const levels = Object.keys(byLevel).map(Number)
    const maxLevel = levels.length ? Math.max(...levels) : 0
    const maxRows = Math.max(1, ...Object.values(byLevel).map((c) => c.length))

    const pos = {}
    for (let L = 0; L <= maxLevel; L++) {
      const col = byLevel[L] || []
      const startY = MY + (maxRows * ROWH - col.length * ROWH) / 2
      col.forEach((n, i) => { pos[n.id] = { x: MX + L * COLW, y: startY + i * ROWH } })
    }

    // attach points spread vertically by edge index on each side
    const outE = {}, inE = {}
    nodes.forEach((n) => { outE[n.id] = []; inE[n.id] = [] })
    edges.forEach((e) => { if (outE[e.source]) outE[e.source].push(e); if (inE[e.target]) inE[e.target].push(e) })

    let maxCount = 0
    edges.forEach((e) => { const c = handleCount(status, e.source, e.sourceHandle); if (c != null) maxCount = Math.max(maxCount, c) })

    const links = edges.map((e) => {
      const ps = pos[e.source], pt = pos[e.target]
      if (!ps || !pt) return null
      const oi = outE[e.source].indexOf(e), oc = outE[e.source].length
      const ii = inE[e.target].indexOf(e), ic = inE[e.target].length
      const sy = ps.y + NODEH * ((oi + 1) / (oc + 1))
      const ty = pt.y + NODEH * ((ii + 1) / (ic + 1))
      const sx = ps.x + NODEW, tx = pt.x
      const count = handleCount(status, e.source, e.sourceHandle)
      const w = maxCount > 0 && count != null ? 2 + 16 * (count / maxCount) : 2.5
      return {
        id: e.id, sx, sy, tx, ty, w, count,
        color: outColor(nodeById[e.source], e.sourceHandle),
        dashed: count == null,
      }
    }).filter(Boolean)

    const width = MX * 2 + maxLevel * COLW + NODEW
    const height = MY * 2 + maxRows * ROWH
    return { pos, links, width, height }
  }, [nodes, edges, status])

  const curve = (l) => {
    const mx = (l.sx + l.tx) / 2
    return `M ${l.sx} ${l.sy} C ${mx} ${l.sy}, ${mx} ${l.ty}, ${l.tx} ${l.ty}`
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal flowmodal" onClick={(e) => e.stopPropagation()}>
        <div className="be-top">
          <span className="be-eyebrow">Carte des flux</span>
          <span className="be-typetag">{nodes.length} bloc(s) · des sources aux exports</span>
          <span className="qb-hint" style={{ marginLeft: 16 }}>épaisseur ∝ nombre de lignes · clic sur un bloc pour l'ouvrir</span>
          <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={onClose}><Icon name="x" /> Fermer</button>
        </div>
        <div className="flowmodal-body">
          {nodes.length === 0 ? (
            <div className="be-view-empty"><p>Aucun bloc dans ce workflow.</p></div>
          ) : (
            <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="wflow-svg" preserveAspectRatio="xMidYMid meet">
              {layout.links.map((l) => (
                <path key={l.id} d={curve(l)} fill="none" stroke={l.color} strokeWidth={l.w}
                  strokeOpacity={l.dashed ? 0.35 : 0.5} strokeDasharray={l.dashed ? '4 4' : undefined} strokeLinecap="round">
                  <title>{fmt(l.count)} ligne(s)</title>
                </path>
              ))}
              {nodes.map((n) => {
                const p = layout.pos[n.id]
                if (!p) return null
                const color = TYPE_COLOR[n.type] || '#9aa3b2'
                return (
                  <g key={n.id} className="wflow-node" transform={`translate(${p.x} ${p.y})`}
                    onClick={() => onOpenNode(n.id)} style={{ cursor: 'pointer' }}>
                    <rect width={NODEW} height={NODEH} rx={5} className="wflow-box" />
                    <rect width={5} height={NODEH} rx={2} fill={color} />
                    <text x={14} y={20} className="wflow-name">{clip(n.data?.label || typeLabel(n.type), 20)}</text>
                    <text x={14} y={37} className="wflow-meta">{typeLabel(n.type).replace('Bloc ', '')} · {fmt(rowsOf(status, n.id))} lignes</text>
                  </g>
                )
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
