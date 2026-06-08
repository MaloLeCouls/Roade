import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'
import Inspector, { typeLabel } from './Inspector'
import { OutputsPane } from './routing'

/*
 * The single, full-screen editor used for every block. Left = settings (the
 * Inspector). Right = a live view of what the block produces: for a validation
 * block, the flow map + the outputs settings (OutputsPane); otherwise a preview
 * of the materialized output.
 */
function outputsOf(node) {
  if (node.type === 'validate' && node.data.mode === 'route') {
    const outs = (node.data.outputs || []).map((o) => ({ handle: o.id, label: o.label || o.id, color: o.color }))
    if (node.data.else_enabled !== false) outs.push({ handle: 'else', label: node.data.else_label || 'Non classé', color: node.data.else_color || '#9aa3b2' })
    return outs.length ? outs : [{ handle: 'else', label: 'Non classé' }]
  }
  const STATIC = {
    dedup: [{ handle: 'kept', label: 'Dédoublonné' }, { handle: 'dups', label: 'Doublons' }, { handle: 'uniques', label: 'Uniques' }],
    export: [],
  }
  return STATIC[node.type] || [{ handle: 'out', label: 'Sortie' }]
}

export default function BlockEditor({ pid, wid, node, inputs, files, status, wfName, onChange, onSchema, onDelete, onRun, onPreview, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal blockeditor" onClick={(e) => e.stopPropagation()}>
        <div className="be-top">
          <span className="be-eyebrow">Éditeur</span>
          <span className="be-typetag">{typeLabel(node.type)}</span>
          <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={onClose}><Icon name="x" /> Fermer</button>
        </div>
        <div className="be-body">
          <div className="be-params">
            <Inspector pid={pid} node={node} files={files} inputs={inputs} wfName={wfName}
              onChange={onChange} onSchema={onSchema} onDelete={onDelete} />
          </div>
          <div className="be-view">
            <BlockView pid={pid} wid={wid} node={node} status={status} onChange={onChange} onRun={onRun} onPreview={onPreview} />
          </div>
        </div>
      </div>
    </div>
  )
}

function BlockView({ pid, wid, node, status, onChange, onRun, onPreview }) {
  if (node.type === 'validate' && node.data.mode === 'route') {
    return <ValidateView pid={pid} wid={wid} node={node} status={status}
      onChange={(patch) => onChange(node.id, patch)} onRun={onRun} onPreview={onPreview} />
  }
  if (node.type === 'report') {
    return <ReportView pid={pid} wid={wid} node={node} status={status} onRun={onRun} onPreview={onPreview} />
  }
  if (node.type === 'export') {
    return (
      <div className="be-view-empty">
        <Icon name="download" size={28} />
        <p>Le bloc Export écrit un fichier dans <b>files/</b>. Exécutez le workflow pour le générer.</p>
        <button className="primary" onClick={() => onRun()}>Exécuter</button>
      </div>
    )
  }
  return <OutputPreview pid={pid} wid={wid} node={node} status={status} onRun={onRun} onPreview={onPreview} />
}

// Validation block: right pane with two tabs — "Sorties" (flow map + outputs
// settings) and "Visualisation" (the data of a given output, inline). Clicking an
// output's eye flips to the Visualisation tab on that output — no hidden modal.
function ValidateView({ pid, wid, node, status, onChange, onRun, onPreview }) {
  const [tab, setTab] = useState('settings')
  const [handle, setHandle] = useState(null)
  return (
    <div className="be-tabwrap">
      <div className="be-tabbar">
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Sorties</button>
        <button className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}><Icon name="eye" size={13} /> Visualisation</button>
      </div>
      <div className="be-tabcontent">
        {tab === 'settings'
          ? <OutputsPane pid={pid} wid={wid} node={node} onChange={onChange}
              onPreview={(h) => { setHandle(h); setTab('preview') }} />
          : <OutputPreview pid={pid} wid={wid} node={node} status={status} onRun={onRun} onPreview={onPreview} initialHandle={handle} />}
      </div>
    </div>
  )
}

function OutputPreview({ pid, wid, node, status, onRun, onPreview, initialHandle }) {
  const outs = outputsOf(node)
  const [handle, setHandle] = useState(initialHandle || outs[0]?.handle || 'out')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const ran = status?.ran ? JSON.stringify(status.outputs || status.rows) : ''
  useEffect(() => {
    setLoading(true)
    api.preview(pid, wid, node.id, { limit: 40, handle })
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setData({ available: false }); setLoading(false) })
  }, [pid, wid, node.id, handle, ran])

  return (
    <div className="be-view-inner">
      <div className="route-flow-head">
        <span className="ports-title">Aperçu de la sortie</span>
        <div className="be-view-actions">
          {/* one "Exécuter" at a time: here once there is data, else the big CTA below */}
          {data?.available && (
            <button className="ghost small" onClick={() => onRun()} title="Exécuter ce bloc"><Icon name="play" /> Exécuter</button>
          )}
          <button className="ghost small" disabled={!data?.available} onClick={() => onPreview(node.id, handle)}><Icon name="eye" /> Plein écran</button>
        </div>
      </div>
      {outs.length > 1 && (
        <div className="out-switch">
          {outs.map((o) => (
            <button key={o.handle} className={handle === o.handle ? 'oseg on' : 'oseg'} onClick={() => setHandle(o.handle)}>{o.label}</button>
          ))}
        </div>
      )}
      {loading ? <div className="be-view-empty"><p className="muted">Chargement…</p></div>
        : !data?.available ? (
          <div className="be-view-empty">
            <Icon name="play" size={26} />
            <p>Ce bloc n'a pas encore été exécuté.</p>
            <button className="primary" onClick={() => onRun()}>Exécuter</button>
          </div>
        ) : (
          <>
            <div className="be-rowcount">{data.row_count.toLocaleString('fr-FR')} lignes · {data.columns.length} colonnes</div>
            <div className="tablewrap be-table">
              <table className="dt">
                <thead>
                  <tr><th className="idx">#</th>{data.columns.map((c) => <th key={c.name}>{c.name}<span className="coltype">{c.type}</span></th>)}</tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i}><td className="idx">{i + 1}</td>{data.columns.map((c) => <td key={c.name}>{fmtCell(r[c.name])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  )
}

function fmtCell(v) {
  if (v === null || v === undefined) return <span className="null">vide</span>
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
  return String(v)
}

// "Analyse" block: an état des lieux of the input — per-column composition, for
// reporting. Reads the profile the backend stored on the block's output meta.
function ReportView({ pid, wid, node, status, onRun, onPreview }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const ran = status?.ran ? JSON.stringify(status.outputs || status.rows) : ''
  useEffect(() => {
    setLoading(true)
    api.preview(pid, wid, node.id, { limit: 1, handle: 'out' })
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setData({ available: false }); setLoading(false) })
  }, [pid, wid, node.id, ran])

  const report = data?.report
  return (
    <div className="be-view-inner">
      <div className="route-flow-head">
        <span className="ports-title">État des lieux</span>
        <div className="be-view-actions">
          {data?.available && <button className="ghost small" onClick={() => onRun()} title="Recalculer l'analyse"><Icon name="play" /> Exécuter</button>}
          <button className="ghost small" disabled={!data?.available} onClick={() => onPreview(node.id, 'out')}><Icon name="eye" /> Plein écran</button>
        </div>
      </div>
      {node.data.note && <div className="report-note">{node.data.note}</div>}
      {loading ? <div className="be-view-empty"><p className="muted">Chargement…</p></div>
        : !data?.available ? (
          <div className="be-view-empty">
            <Icon name="play" size={26} />
            <p>Ce bloc n'a pas encore été exécuté.</p>
            <button className="primary" onClick={() => onRun()}>Exécuter</button>
          </div>
        ) : !report ? (
          <div className="be-view-empty"><p className="muted">Analyse indisponible — réexécutez le bloc.</p></div>
        ) : (
          <>
            <div className="be-rowcount">{report.row_count.toLocaleString('fr-FR')} lignes · {(report.analyses || []).length} analyse(s)</div>
            <div className="report-cards">
              {(report.analyses || []).map((a, i) => <AnalysisCardView key={i} a={a} />)}
              {(report.analyses || []).length === 0 && <p className="muted">Aucune analyse configurée — ajoutez-en dans les paramètres.</p>}
            </div>
          </>
        )}
    </div>
  )
}

const PIE_COLORS = ['#4E79A7', '#59A14F', '#E15759', '#F28E2B', '#B07AA1', '#76B7B2',
  '#EDC948', '#9C755F', '#FF9DA7', '#86BCB6', '#bab0ac', '#8cd17d']

function AnalysisCardView({ a }) {
  const slices = [...(a.buckets || [])]
  if (a.other > 0) slices.push({ key: 'Autres', count: a.other })
  const chart = a.chart || 'bar'
  return (
    <div className="report-card">
      <div className="rc-head"><b>{a.title}</b><span className="coltype">{a.column}</span></div>
      <div className="rc-metrics">
        <span><b>{(a.distinct ?? 0).toLocaleString('fr-FR')}</b> distinctes</span>
        <span><b>{(a.nulls ?? 0).toLocaleString('fr-FR')}</b> vides ({a.null_pct}%)</span>
        <span><b>{(a.total ?? 0).toLocaleString('fr-FR')}</b> lignes</span>
      </div>
      {slices.length === 0 ? <p className="muted">Aucune valeur.</p>
        : chart === 'pie' ? <PieChart slices={slices} />
        : chart === 'table' ? (
          <table className="rc-table"><tbody>
            {slices.map((s, i) => <tr key={i}><td>{s.key}</td><td>{s.count.toLocaleString('fr-FR')}</td></tr>)}
          </tbody></table>
        ) : <BarList slices={slices} />}
    </div>
  )
}

function BarList({ slices }) {
  const max = Math.max(...slices.map((s) => s.count), 1)
  return (
    <div className="rc-top">
      {slices.map((s, i) => (
        <div className="rc-tv" key={i}>
          <span className="rc-tv-lbl" title={s.key}>{s.key}</span>
          <span className="rc-tv-bar"><span style={{ width: `${(s.count / max) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} /></span>
          <span className="rc-tv-c">{s.count.toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  )
}

function PieChart({ slices }) {
  const total = slices.reduce((acc, s) => acc + s.count, 0) || 1
  const R = 54, C = 60
  let acc = 0
  const arcs = slices.map((s, i) => {
    const a0 = (acc / total) * 2 * Math.PI; acc += s.count; const a1 = (acc / total) * 2 * Math.PI
    const color = PIE_COLORS[i % PIE_COLORS.length]
    if (slices.length === 1) return <circle key={i} cx={C} cy={C} r={R} fill={color} />
    const large = (a1 - a0) > Math.PI ? 1 : 0
    const x0 = C + R * Math.sin(a0), y0 = C - R * Math.cos(a0)
    const x1 = C + R * Math.sin(a1), y1 = C - R * Math.cos(a1)
    return <path key={i} d={`M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large},1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`} fill={color} />
  })
  return (
    <div className="rc-pie">
      <svg width="120" height="120" viewBox="0 0 120 120">{arcs}</svg>
      <div className="rc-legend">
        {slices.map((s, i) => (
          <div className="rc-leg" key={i}>
            <span className="rc-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="rc-leg-lbl" title={s.key}>{s.key}</span>
            <span className="rc-leg-c">{s.count.toLocaleString('fr-FR')} · {Math.round(s.count / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
