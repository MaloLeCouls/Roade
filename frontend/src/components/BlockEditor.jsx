import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'
import Inspector, { typeLabel } from './Inspector'
import { OutputsPane } from './routing'
import ErrorBoundary from './ErrorBoundary'

/*
 * The single, full-screen editor used for every block. Left = settings (the
 * Inspector). Right = a live view of what the block produces: for a validation
 * block, the flow map + the outputs settings (OutputsPane); otherwise a preview
 * of the materialized output.
 */
function outputsOf(node) {
  if (node.type === 'validate' && node.data.mode === 'route') {
    const outs = (node.data.outputs || []).map((o) => ({
      handle: o.id,
      label: o.label || o.id,
      color: o.color,
      empty: 'value' in o && o.value === '',
    }))
    if (node.data.else_enabled !== false)
      outs.push({
        handle: 'else',
        label: node.data.else_label || 'Non classé',
        color: node.data.else_color || '#9aa3b2',
      })
    return outs.length ? outs : [{ handle: 'else', label: 'Non classé' }]
  }
  const STATIC = {
    dedup: [
      { handle: 'kept', label: 'Dédoublonné' },
      { handle: 'dups', label: 'Doublons' },
      { handle: 'uniques', label: 'Uniques' },
    ],
    export: [],
  }
  return STATIC[node.type] || [{ handle: 'out', label: 'Sortie' }]
}

export default function BlockEditor({
  pid,
  wid,
  node,
  inputs,
  files,
  status,
  wfName,
  onChange,
  onSchema,
  onDelete,
  onRun,
  running,
  onPreview,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal blockeditor" onClick={(e) => e.stopPropagation()}>
        <div className="be-top">
          <span className="be-eyebrow">Éditeur</span>
          <span className="be-typetag">{typeLabel(node.type)}</span>
          <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" /> Fermer
          </button>
        </div>
        <div className="be-body">
          <div className="be-params">
            <Inspector
              pid={pid}
              wid={wid}
              node={node}
              files={files}
              inputs={inputs}
              wfName={wfName}
              onChange={onChange}
              onSchema={onSchema}
              onDelete={onDelete}
            />
          </div>
          <div className="be-view">
            <ErrorBoundary resetKey={node.id}>
              <BlockView
                pid={pid}
                wid={wid}
                node={node}
                status={status}
                onChange={onChange}
                onRun={onRun}
                running={running}
                onPreview={onPreview}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}

function BlockView({ pid, wid, node, status, onChange, onRun, running, onPreview }) {
  if (node.type === 'validate' && node.data.mode === 'route') {
    return (
      <ValidateView
        pid={pid}
        wid={wid}
        node={node}
        status={status}
        onChange={(patch) => onChange(node.id, patch)}
        onRun={onRun}
        running={running}
        onPreview={onPreview}
      />
    )
  }
  if (node.type === 'report') {
    return (
      <ReportView
        pid={pid}
        wid={wid}
        node={node}
        status={status}
        onRun={onRun}
        running={running}
        onPreview={onPreview}
      />
    )
  }
  if (node.type === 'export') {
    return (
      <OutputPreview
        pid={pid}
        wid={wid}
        node={node}
        status={status}
        onRun={onRun}
        running={running}
        onPreview={onPreview}
        title="Données exportées"
        note={
          <>
            <Icon name="download" size={13} /> Ce bloc écrit un fichier dans <b>files/</b>. L'aperçu
            ci-dessous montre les données à exporter (lues depuis le bloc amont).
          </>
        }
      />
    )
  }
  return (
    <OutputPreview
      pid={pid}
      wid={wid}
      node={node}
      status={status}
      onRun={onRun}
      running={running}
      onPreview={onPreview}
    />
  )
}

// Validation block: right pane with two tabs — "Sorties" (flow map + outputs
// settings) and "Visualisation" (the data of a given output, inline). Clicking an
// output's eye flips to the Visualisation tab on that output — no hidden modal.
function ValidateView({ pid, wid, node, status, onChange, onRun, running, onPreview }) {
  const [tab, setTab] = useState('settings')
  const [handle, setHandle] = useState(null)
  return (
    <div className="be-tabwrap">
      <div className="be-tabbar" role="tablist" aria-label="Vues du bloc Validation">
        <button
          role="tab"
          aria-selected={tab === 'settings'}
          className={tab === 'settings' ? 'on' : ''}
          onClick={() => setTab('settings')}
        >
          Sorties
        </button>
        <button
          role="tab"
          aria-selected={tab === 'preview'}
          className={tab === 'preview' ? 'on' : ''}
          onClick={() => setTab('preview')}
        >
          <Icon name="eye" size={13} /> Visualisation
        </button>
      </div>
      <div className="be-tabcontent">
        {tab === 'settings' ? (
          <OutputsPane
            pid={pid}
            wid={wid}
            node={node}
            status={status}
            onChange={onChange}
            onRun={onRun}
            running={running}
            onPreview={(h) => {
              setHandle(h)
              setTab('preview')
            }}
          />
        ) : (
          <OutputPreview
            pid={pid}
            wid={wid}
            node={node}
            status={status}
            onRun={onRun}
            running={running}
            onPreview={onPreview}
            initialHandle={handle}
          />
        )}
      </div>
    </div>
  )
}

function OutputPreview({
  pid,
  wid,
  node,
  status,
  onRun,
  running,
  onPreview,
  initialHandle,
  title,
  note,
}) {
  const outs = outputsOf(node)
  const [handle, setHandle] = useState(initialHandle || outs[0]?.handle || 'out')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const ran = status?.ran ? JSON.stringify(status.outputs || status.rows) : ''
  useEffect(() => {
    setLoading(true)
    api
      .preview(pid, wid, node.id, { limit: 40, handle })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setData({ available: false })
        setLoading(false)
      })
  }, [pid, wid, node.id, handle, ran])

  return (
    <div className="be-view-inner">
      {note && <div className="report-note">{note}</div>}
      <div className="route-flow-head">
        <span className="ports-title">{title || 'Aperçu de la sortie'}</span>
        <div className="be-view-actions">
          {/* one "Exécuter" at a time: here once there is data, else the big CTA below */}
          {data?.available && <RunButton running={running} onRun={onRun} variant="ghost small" />}
          <button
            className="ghost small"
            disabled={!data?.available}
            onClick={() => onPreview(node.id, handle)}
          >
            <Icon name="eye" /> Plein écran
          </button>
        </div>
      </div>
      {outs.length > 1 && (
        <div className="out-switch">
          {outs.map((o) => (
            <button
              key={o.handle}
              className={`oseg ${handle === o.handle ? 'on' : ''} ${o.empty ? 'oseg-empty' : ''}`}
              onClick={() => setHandle(o.handle)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="be-view-empty">
          <p className="muted">Chargement…</p>
        </div>
      ) : !data?.available ? (
        <div className="be-view-empty">
          <Icon name="play" size={26} />
          <p>Ce bloc n'a pas encore été exécuté.</p>
          <RunButton running={running} onRun={onRun} variant="primary" />
        </div>
      ) : (
        <>
          {data.mixed_types && data.mixed_types.length > 0 && (
            <MixedTypesNotice items={data.mixed_types} />
          )}
          <div className="be-rowcount">
            {data.row_count.toLocaleString('fr-FR')} lignes · {data.columns.length} colonnes
          </div>
          <div className="tablewrap be-table">
            <table className="dt">
              <thead>
                <tr>
                  <th className="idx">#</th>
                  {data.columns.map((c) => (
                    <th key={c.name}>
                      {c.name}
                      <span className="coltype">{c.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="idx">{i + 1}</td>
                    {data.columns.map((c) => (
                      <td key={c.name}>{fmtCell(r[c.name])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// Un bouton « Exécuter » qui se désactive et affiche « Exécution… » pendant
// que le bloc tourne. La règle UX qu'on respecte : tout déclencheur d'action
// longue doit donner un retour immédiat (cf. [[run-status-visibility]]). Sans
// ça, l'utilisateur reclique sans savoir que ça a démarré.
function RunButton({ running, onRun, variant = 'ghost small', idleTitle }) {
  return (
    <button
      className={`${variant} run-btn${running ? ' run-btn-busy' : ''}`}
      onClick={() => !running && onRun()}
      disabled={running}
      title={running ? 'Exécution en cours…' : idleTitle || 'Exécuter ce bloc'}
      aria-busy={running || undefined}
    >
      {running ? (
        <>
          <Spinner /> Exécution…
        </>
      ) : (
        <>
          <Icon name="play" /> Exécuter
        </>
      )}
    </button>
  )
}

// Petit indicateur d'attente — 3 points qui pulsent. Pas d'image, pas de
// dépendance ; CSS via .run-spin (cf. styles.css).
function Spinner() {
  return (
    <span className="run-spin" aria-hidden="true">
      <span /> <span /> <span />
    </span>
  )
}

// Avertissement « types mixtes coercés en texte » — visible juste au-dessus de
// la table d'aperçu. Le moteur a vu un Excel humain où une colonne mélangeait
// libellés et codes numériques (cas classique des fichiers FR). pyarrow l'aurait
// refusée — on l'a sauvée en texte, on prévient pour que l'utilisateur sache.
// Pas une erreur : un signal. Pose explicitement un cast « number » dans la
// Source si tu veux relire ces valeurs comme des nombres.
function MixedTypesNotice({ items }) {
  return (
    <div className="notice notice-warn" role="alert">
      <b>{items.length} colonne(s) à types mixtes converties en texte.</b>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((it, i) => {
          const parts = Object.entries(it.counts || {}).map(([k, n]) => `${n} ${k}`)
          return (
            <li key={i}>
              <code>{it.column}</code> — {parts.join(' / ')}
            </li>
          )
        })}
      </ul>
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
function ReportView({ pid, wid, node, status, onRun, running, onPreview }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const ran = status?.ran ? JSON.stringify(status.outputs || status.rows) : ''
  useEffect(() => {
    setLoading(true)
    api
      .preview(pid, wid, node.id, { limit: 1, handle: 'out' })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setData({ available: false })
        setLoading(false)
      })
  }, [pid, wid, node.id, ran])

  const report = data?.report
  return (
    <div className="be-view-inner">
      <div className="route-flow-head">
        <span className="ports-title">État des lieux</span>
        <div className="be-view-actions">
          {data?.available && (
            <RunButton
              running={running}
              onRun={() => onRun(true)}
              variant="ghost small"
              idleTitle="Recalculer l'analyse"
            />
          )}
          <button
            className="ghost small"
            disabled={!data?.available}
            onClick={() => onPreview(node.id, 'out')}
          >
            <Icon name="eye" /> Plein écran
          </button>
        </div>
      </div>
      {node.data.note && <div className="report-note">{node.data.note}</div>}
      {loading ? (
        <div className="be-view-empty">
          <p className="muted">Chargement…</p>
        </div>
      ) : !data?.available ? (
        <div className="be-view-empty">
          <Icon name="play" size={26} />
          <p>Ce bloc n'a pas encore été exécuté.</p>
          <RunButton running={running} onRun={onRun} variant="primary" />
        </div>
      ) : !report ? (
        <div className="be-view-empty">
          <p className="muted">Analyse indisponible — réexécutez le bloc.</p>
        </div>
      ) : (
        <>
          <div className="be-rowcount">
            {report.row_count.toLocaleString('fr-FR')} lignes · {(report.analyses || []).length}{' '}
            analyse(s)
          </div>
          <div className="report-cards">
            {(report.analyses || []).map((a, i) => (
              <AnalysisCardView key={i} a={a} pid={pid} wid={wid} nid={node.id} />
            ))}
            {(report.analyses || []).length === 0 && (
              <p className="muted">Aucune analyse configurée — ajoutez-en dans les paramètres.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// D.2 — palette catégorielle importée depuis la source unique (était dupliquée
// avec `OUTPUT_COLORS` de validateHelpers.js).
import { PIE_COLORS } from '../theme'

function AnalysisCardView({ a, pid, wid, nid }) {
  if (a.kind === 'keys') return <KeysAnalysisView a={a} pid={pid} wid={wid} nid={nid} />
  const slices = [...(a.buckets || [])]
  if (a.other > 0) slices.push({ key: 'Autres', count: a.other })
  const chart = a.chart || 'bar'
  return (
    <div className="report-card">
      <div className="rc-head">
        <b>{a.title}</b>
        <span className="coltype">{a.column}</span>
      </div>
      <div className="rc-metrics">
        <span>
          <b>{(a.distinct ?? 0).toLocaleString('fr-FR')}</b> distinctes
        </span>
        <span>
          <b>{(a.nulls ?? 0).toLocaleString('fr-FR')}</b> vides ({a.null_pct}%)
        </span>
        <span>
          <b>{(a.total ?? 0).toLocaleString('fr-FR')}</b> lignes
        </span>
      </div>
      {slices.length === 0 ? (
        <p className="muted">Aucune valeur.</p>
      ) : chart === 'pie' ? (
        <PieChart slices={slices} />
      ) : chart === 'table' ? (
        <table className="rc-table">
          <tbody>
            {slices.map((s, i) => (
              <tr key={i}>
                <td>{s.key}</td>
                <td>{s.count.toLocaleString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <BarList slices={slices} />
      )}
    </div>
  )
}

function BarList({ slices }) {
  const max = Math.max(...slices.map((s) => s.count), 1)
  return (
    <div className="rc-top">
      {slices.map((s, i) => (
        <div className="rc-tv" key={i}>
          <span className="rc-tv-lbl" title={s.key}>
            {s.key}
          </span>
          <span className="rc-tv-bar">
            <span
              style={{
                width: `${(s.count / max) * 100}%`,
                background: PIE_COLORS[i % PIE_COLORS.length],
              }}
            />
          </span>
          <span className="rc-tv-c">{s.count.toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  )
}

function PieChart({ slices }) {
  const total = slices.reduce((acc, s) => acc + s.count, 0) || 1
  const R = 54,
    C = 60
  let acc = 0
  const arcs = slices.map((s, i) => {
    const a0 = (acc / total) * 2 * Math.PI
    acc += s.count
    const a1 = (acc / total) * 2 * Math.PI
    const color = PIE_COLORS[i % PIE_COLORS.length]
    if (slices.length === 1) return <circle key={i} cx={C} cy={C} r={R} fill={color} />
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0 = C + R * Math.sin(a0),
      y0 = C - R * Math.cos(a0)
    const x1 = C + R * Math.sin(a1),
      y1 = C - R * Math.cos(a1)
    return (
      <path
        key={i}
        d={`M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large},1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`}
        fill={color}
      />
    )
  })
  return (
    <div className="rc-pie">
      <svg width="120" height="120" viewBox="0 0 120 120">
        {arcs}
      </svg>
      <div className="rc-legend">
        {slices.map((s, i) => (
          <div className="rc-leg" key={i}>
            <span className="rc-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="rc-leg-lbl" title={s.key}>
              {s.key}
            </span>
            <span className="rc-leg-c">
              {s.count.toLocaleString('fr-FR')} · {Math.round((s.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- « Clés multiples » analysis -----------------------------------------
const _fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))
const _keyLabel = (kobj) =>
  Object.values(kobj || {})
    .map((v) => (v === null || v === undefined || v === '' ? '(vide)' : String(v)))
    .join(' · ') || '(vide)'
const _isEmpty = (v) => v === null || v === undefined || v === ''

function KeysTile({ v, l }) {
  return (
    <div className="keys-tile">
      <b>{_fmtNum(v)}</b>
      <span>{l}</span>
    </div>
  )
}

function GroupBlock({ grp, keyCols, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const rows = grp.rows || []
  const allCols = rows.length ? Object.keys(rows[0]) : []
  // the key is constant within the group (shown in the header) — show the other
  // columns only, so the grid stays narrow; fall back to all if key == every col.
  const dataCols = allCols.filter((c) => !keyCols.includes(c))
  const cols = dataCols.length ? dataCols : allCols
  const size = grp.size ?? rows.length
  return (
    <div className="keys-group">
      <button className={`keys-group-h ${open ? 'on' : ''}`} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'down' : 'chev-right'} size={12} />
        <span className="keys-group-k" title={_keyLabel(grp.key)}>
          {_keyLabel(grp.key)}
        </span>
        <span className="keys-group-n">{_fmtNum(size)} lignes</span>
      </button>
      {open && (
        <div className="keys-group-body">
          {rows.length === 0 ? (
            <p className="muted">Aucune ligne.</p>
          ) : (
            <>
              <div className="keys-grid-wrap">
                <table className="keys-grid">
                  <thead>
                    <tr>
                      <th className="rownum">#</th>
                      {cols.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="rownum">{i + 1}</td>
                        {cols.map((c) =>
                          _isEmpty(r[c]) ? (
                            <td key={c} className="keys-null">
                              <i>(vide)</i>
                            </td>
                          ) : (
                            <td key={c} title={String(r[c])}>
                              {String(r[c])}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {size > rows.length && (
                <p className="keys-hint">
                  {rows.length} premières lignes sur {_fmtNum(size)}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function KeysExplorer({ pid, wid, nid, keyCols, bigGroups, smallGroups }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null) // { found: [groups] } | { error } | null
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('big') // 'big' | 'small'

  const search = async () => {
    const text = q.trim()
    if (!text) {
      setRes(null)
      return
    }
    setBusy(true)
    try {
      const r = await api.keysGroup(pid, wid, nid, keyCols, text)
      if (!r?.available) {
        setRes({ error: 'Sortie indisponible — réexécutez le bloc.' })
        setBusy(false)
        return
      }
      const map = new Map()
      for (const row of r.rows || []) {
        const kk = keyCols.map((c) => row[c]).join('')
        if (!map.has(kk))
          map.set(kk, { key: Object.fromEntries(keyCols.map((c) => [c, row[c]])), rows: [] })
        map.get(kk).rows.push(row)
      }
      setRes({ found: [...map.values()], truncated: (r.row_count || 0) > (r.rows || []).length })
    } catch (e) {
      setRes({ error: String(e.message || e) })
    }
    setBusy(false)
  }

  const browse = mode === 'small' ? smallGroups : bigGroups
  const shown = res?.found ?? browse
  return (
    <div className="keys-sec">
      <div className="keys-sec-h">
        Explorer les groupes
        <span className="keys-toggle">
          <button className={mode === 'big' ? 'on' : ''} onClick={() => setMode('big')}>
            plus gros
          </button>
          <button className={mode === 'small' ? 'on' : ''} onClick={() => setMode('small')}>
            plus petits
          </button>
        </span>
      </div>
      <div className="keys-search">
        <Icon name="search" size={13} />
        <input
          value={q}
          placeholder="rechercher une valeur de clé…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="ghost small" onClick={search} disabled={busy}>
          {busy ? '…' : 'Chercher'}
        </button>
        {res && (
          <button
            className="ghost small"
            onClick={() => {
              setQ('')
              setRes(null)
            }}
          >
            Effacer
          </button>
        )}
      </div>
      {res?.error && <p className="muted">{res.error}</p>}
      {res && !res.error && (
        <p className="keys-hint">
          {res.found.length} groupe(s) trouvé(s){res.truncated ? ' (aperçu tronqué)' : ''}.
        </p>
      )}
      {!res && (
        <p className="keys-hint">
          Les {browse.length} {mode === 'small' ? 'plus petits' : 'plus gros'} groupes (dépliez pour
          voir les lignes) :
        </p>
      )}
      <div className="keys-groups">
        {shown.length === 0 ? (
          <p className="muted">Aucun groupe.</p>
        ) : (
          shown.map((g, i) => (
            <GroupBlock
              key={i}
              grp={g}
              keyCols={keyCols}
              defaultOpen={!!res?.found && shown.length <= 3}
            />
          ))
        )}
      </div>
    </div>
  )
}

function KeysAnalysisView({ a, pid, wid, nid }) {
  const keyCols = a.key || []
  // a.error = no valid key; missing distinct_keys = stale/incomplete report
  // (e.g. backend not restarted) — show a clear message instead of "undefined%".
  if (a.error || a.distinct_keys === undefined) {
    return (
      <div className="report-card keys-card">
        <div className="rc-head">
          <b>{a.title || 'Clés multiples'}</b>
        </div>
        <p className="muted">
          {a.error ||
            'Analyse des clés indisponible — réexécutez le bloc (et vérifiez que le serveur est à jour).'}
        </p>
      </div>
    )
  }
  const dist = a.distribution || []
  const cons = a.consistency || []
  return (
    <div className="report-card keys-card">
      <div className="rc-head">
        <b>{a.title}</b>
        <span className="coltype">{keyCols.join(' + ')}</span>
      </div>
      <div className={`keys-verdict ${a.unique ? 'ok' : 'warn'}`}>
        {a.unique
          ? '✓ Clé candidate — chaque combinaison identifie une seule ligne'
          : `⚠ Non unique — ${_fmtNum(a.dup_keys)} clé(s) en doublon, ${_fmtNum(a.rows_in_dups)} lignes concernées`}
      </div>
      <div className="keys-tiles">
        <KeysTile v={a.total} l="lignes" />
        <KeysTile v={a.distinct_keys} l="clés distinctes" />
        <KeysTile v={a.dup_keys} l="en doublon" />
        <KeysTile v={a.singletons} l="uniques (×1)" />
        <KeysTile v={a.group_max} l="+ gros groupe" />
        <KeysTile v={a.group_min} l="+ petit groupe" />
        <KeysTile v={a.group_avg} l="taille moy." />
        <KeysTile v={a.group_median} l="taille méd." />
        <KeysTile v={`${a.uniqueness_pct}%`} l="unicité" />
        {a.null_keys > 0 && <KeysTile v={a.null_keys} l="clés vides" />}
      </div>

      {dist.length > 0 && (
        <div className="keys-sec">
          <div className="keys-sec-h">Distribution des tailles de groupe (nb de clés)</div>
          <BarList slices={dist.map((d) => ({ key: `${d.key} ligne(s)`, count: d.count }))} />
        </div>
      )}

      {cons.length > 0 && (
        <div className="keys-sec">
          <div className="keys-sec-h">
            Cohérence des autres colonnes par clé (dépendances fonctionnelles)
          </div>
          <table className="keys-cons">
            <tbody>
              {cons.map((e, i) => (
                <tr key={i} className={e.constant ? '' : 'varies'}>
                  <td>{e.column}</td>
                  <td>
                    {e.constant ? (
                      <span className="keys-badge ok">constante par clé</span>
                    ) : (
                      <span
                        className="keys-badge warn"
                        title={
                          e.example
                            ? `ex. clé ${_keyLabel(e.example.key)} → ${(e.example.values || []).join('  /  ')}`
                            : ''
                        }
                      >
                        varie dans {_fmtNum(e.varying_groups)} groupe(s)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <KeysExplorer
        pid={pid}
        wid={wid}
        nid={nid}
        keyCols={keyCols}
        bigGroups={a.top_groups || []}
        smallGroups={a.small_groups || []}
      />
    </div>
  )
}
