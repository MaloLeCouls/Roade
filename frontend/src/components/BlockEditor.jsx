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
            <div className="be-rowcount">{report.row_count.toLocaleString('fr-FR')} lignes · {report.columns.length} colonne(s) analysée(s)</div>
            <div className="report-cards">
              {report.columns.map((c) => <ReportCard key={c.name} c={c} />)}
              {report.columns.length === 0 && <p className="muted">Aucune colonne à analyser.</p>}
            </div>
          </>
        )}
    </div>
  )
}

function ReportCard({ c }) {
  const ns = c.numeric_stats
  const tops = c.top_values || []
  const max = Math.max(...tops.map((v) => v.count), 1)
  return (
    <div className="report-card">
      <div className="rc-head"><b>{c.name}</b><span className="coltype">{c.type}</span></div>
      <div className="rc-metrics">
        <span><b>{c.distinct.toLocaleString('fr-FR')}</b> distinctes</span>
        <span><b>{c.nulls.toLocaleString('fr-FR')}</b> vides ({c.null_pct}%)</span>
      </div>
      {ns && (
        <div className="rc-metrics rc-num">
          <span>min <b>{fmtNum(ns.min)}</b></span><span>max <b>{fmtNum(ns.max)}</b></span>
          <span>moy <b>{fmtNum(ns.avg)}</b></span><span>méd <b>{fmtNum(ns.median)}</b></span>
        </div>
      )}
      {tops.length > 0 && (
        <div className="rc-top">
          {tops.map((v, i) => (
            <div className="rc-tv" key={i}>
              <span className="rc-tv-lbl" title={v.value == null ? 'vide' : String(v.value)}>
                {v.value == null ? <span className="null">vide</span> : String(v.value)}
              </span>
              <span className="rc-tv-bar"><span style={{ width: `${(v.count / max) * 100}%` }} /></span>
              <span className="rc-tv-c">{v.count.toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—'
  return typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 4 }) : String(v)
}
