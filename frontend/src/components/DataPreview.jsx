import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'

const PAGE = 200

export default function DataPreview({
  pid,
  wid,
  nodeId,
  label,
  outputs = [{ handle: 'out', label: '' }],
  initialTab = 'rows',
  initialColumn = null,
  initialHandle = null,
  onNav,
  onClose,
}) {
  const [tab, setTab] = useState(initialTab || 'rows')
  const [data, setData] = useState(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [handle, setHandle] = useState(initialHandle || outputs[0]?.handle || 'out')
  const [sort, setSort] = useState(null) // { col, dir }
  const [filters, setFilters] = useState({}) // colName -> contains text
  const [filterOpen, setFilterOpen] = useState(false)
  const [q, setQ] = useState('')
  const [activeColumn, setActiveColumn] = useState(initialColumn)

  const filterList = Object.entries(filters)
    .filter(([, f]) => f && (f.op === 'is_null' || (f.value !== '' && f.value != null)))
    .map(([column, f]) => ({ column, op: f.op || 'contains', value: f.value }))

  useEffect(() => {
    setLoading(true)
    api
      .preview(pid, wid, nodeId, {
        limit: PAGE,
        offset,
        handle,
        sort: sort?.col,
        dir: sort?.dir,
        q: q || undefined,
        filters: filterList,
      })
      .then((d) => {
        setData(d)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, wid, nodeId, offset, handle, sort, q, JSON.stringify(filterList)])

  // default the profile to the first column once data is known
  useEffect(() => {
    if (data?.available && !activeColumn && data.columns.length)
      setActiveColumn(data.columns[0].name)
  }, [data, activeColumn])

  // remember where the user was (tab + column) for next time
  useEffect(() => {
    if (onNav) onNav({ tab, column: activeColumn })
  }, [tab, activeColumn]) // eslint-disable-line

  // Échap ferme l'aperçu
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cycleSort = (col) => {
    setOffset(0)
    setSort((s) =>
      !s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null,
    )
  }

  // Clicking a frequent value (in the profile panel) filters the data view on it.
  const filterByValue = (column, value) => {
    setFilters((f) => ({
      ...f,
      [column]: value == null ? { op: 'is_null' } : { value, op: 'equals' },
    }))
    setTab('rows')
    setOffset(0)
    setFilterOpen(true)
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 60 }} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Aperçu — {label}</h3>
          {outputs.length > 1 && (
            <div className="out-switch">
              {outputs.map((o) => (
                <button
                  key={o.handle}
                  className={handle === o.handle ? 'oseg on' : 'oseg'}
                  onClick={() => {
                    setHandle(o.handle)
                    setOffset(0)
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <button className="ghost small" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>

        {!data ? (
          <div className="preview-main">
            <div className="preview-content">
              <p className="muted" style={{ padding: 16 }}>
                Chargement…
              </p>
            </div>
          </div>
        ) : !data.available ? (
          <div className="preview-main">
            <div className="preview-content">
              <div className="empty">Ce bloc n'a pas encore été exécuté.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-bar">
              <div className="tabs" role="tablist" aria-label="Vues de l'aperçu">
                <button
                  role="tab"
                  aria-selected={tab === 'rows'}
                  className={tab === 'rows' ? 'tab on' : 'tab'}
                  onClick={() => setTab('rows')}
                >
                  Données
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'cols'}
                  className={tab === 'cols' ? 'tab on' : 'tab'}
                  onClick={() => setTab('cols')}
                >
                  Colonnes ({data.columns.length})
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'stats'}
                  className={tab === 'stats' ? 'tab on' : 'tab'}
                  onClick={() => setTab('stats')}
                >
                  Statistiques
                </button>
                {data.clean_report && (
                  <button
                    role="tab"
                    aria-selected={tab === 'clean'}
                    className={tab === 'clean' ? 'tab on' : 'tab'}
                    onClick={() => setTab('clean')}
                  >
                    Nettoyage
                  </button>
                )}
              </div>
              {tab === 'rows' && (
                <div className="bar-tools">
                  <span className="search-wrap">
                    <span className="si">
                      <Icon name="search" size={13} />
                    </span>
                    <input
                      className="search"
                      placeholder="recherche globale…"
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value)
                        setOffset(0)
                      }}
                    />
                  </span>
                  <button
                    className={filterOpen ? 'ghost small on' : 'ghost small'}
                    onClick={() => setFilterOpen((v) => !v)}
                  >
                    <Icon name="filter" /> Filtres
                  </button>
                  {filterList.length > 0 && (
                    <button
                      className="ghost small"
                      onClick={() => {
                        setFilters({})
                        setOffset(0)
                      }}
                      title="Effacer tous les filtres"
                    >
                      Effacer ({filterList.length})
                    </button>
                  )}
                </div>
              )}
              <div className="rowcount">
                {data.row_count.toLocaleString('fr-FR')}
                {data.total_count != null &&
                  data.total_count !== data.row_count &&
                  ` / ${data.total_count.toLocaleString('fr-FR')}`}{' '}
                lignes
              </div>
            </div>

            <div className="preview-main">
              <div className="preview-content">
                {loading && <div className="loading-overlay">chargement…</div>}
                {tab === 'rows' && (
                  <RowsTable
                    columns={data.columns}
                    rows={data.rows}
                    sort={sort}
                    onSort={cycleSort}
                    filterOpen={filterOpen}
                    filters={filters}
                    active={activeColumn}
                    onFilter={(c, v) => {
                      setFilters((f) => ({ ...f, [c]: { value: v, op: 'contains' } }))
                      setOffset(0)
                    }}
                    onProfile={setActiveColumn}
                  />
                )}
                {tab === 'cols' && (
                  <ColumnsTab
                    columns={data.columns}
                    compiledSql={data.compiled_sql}
                    active={activeColumn}
                    onProfile={setActiveColumn}
                  />
                )}
                {tab === 'stats' && <StatsTable stats={data.stats} />}
                {tab === 'clean' && <CleanReport report={data.clean_report} />}
              </div>

              <ProfilePanel
                pid={pid}
                wid={wid}
                nodeId={nodeId}
                handle={handle}
                column={activeColumn}
                onPickValue={filterByValue}
              />
            </div>

            {tab === 'rows' && (
              <div className="modal-foot">
                <button
                  className="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}
                >
                  <Icon name="chev-left" /> Précédent
                </button>
                <span className="muted">
                  lignes {data.row_count === 0 ? 0 : offset + 1}–
                  {Math.min(offset + PAGE, data.row_count)}
                </span>
                <button
                  className="ghost"
                  disabled={offset + PAGE >= data.row_count}
                  onClick={() => setOffset(offset + PAGE)}
                >
                  Suivant <Icon name="chev-right" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function fmt(v) {
  if (v === null || v === undefined) return <span className="null">vide</span>
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: 6 })
  return String(v)
}

function RowsTable({
  columns,
  rows,
  sort,
  onSort,
  filterOpen,
  filters,
  onFilter,
  onProfile,
  active,
}) {
  return (
    <div className="tablewrap">
      <table className="dt">
        <thead>
          <tr>
            <th className="idx">#</th>
            {columns.map((c) => (
              <th key={c.name}>
                <div className="th-row">
                  <span
                    className={`th-name ${active === c.name ? 'active-col' : ''}`}
                    onClick={() => onSort(c.name)}
                    title="Trier"
                  >
                    {c.name}
                    {sort?.col === c.name && (
                      <span className="sort-ar">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                  <button
                    className={`th-prof ${active === c.name ? 'on' : ''}`}
                    onClick={() => onProfile(c.name)}
                    title="Profil de la colonne"
                  >
                    <Icon name="list" size={12} />
                  </button>
                </div>
                <span className="coltype">{c.type}</span>
              </th>
            ))}
          </tr>
          {filterOpen && (
            <tr className="filter-row">
              <th className="idx"></th>
              {columns.map((c) => {
                // E.10 — l'opérateur du filtre dépend du point d'entrée :
                //   - tapé ici (header)  → `contains` (recherche partielle)
                //   - cliqué dans le profil d'une valeur → `equals` (exact)
                // Avant, l'utilisateur n'avait aucun moyen de voir lequel
                // s'appliquait. On affiche maintenant le pictogramme dans
                // le champ et on l'explique dans le `title`.
                const f = filters[c.name]
                const isEquals = f?.op === 'equals'
                const isNull = f?.op === 'is_null'
                return (
                  <th key={c.name}>
                    <div className="col-filter-wrap">
                      <span
                        className="col-filter-op"
                        title={
                          isEquals
                            ? 'Filtre exact (=) — appliqué depuis le profil'
                            : isNull
                              ? 'Filtre : valeur vide'
                              : 'Filtre par sous-chaîne (contient…)'
                        }
                        aria-hidden="true"
                      >
                        {isEquals ? '=' : isNull ? '∅' : '~'}
                      </span>
                      <input
                        className="col-filter"
                        placeholder={isEquals ? '= valeur exacte' : 'contient…'}
                        value={isNull ? '' : (f?.value ?? '')}
                        onChange={(e) => onFilter(c.name, e.target.value)}
                      />
                    </div>
                  </th>
                )
              })}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="idx"></td>
              <td colSpan={columns.length} className="muted" style={{ padding: 16 }}>
                Aucune ligne.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td className="idx">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.name}>{fmt(r[c.name])}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

function ColumnsTab({ columns, compiledSql, active, onProfile }) {
  return (
    <div className="colnames">
      {compiledSql && (
        <details className="sql-inline">
          <summary>SQL généré</summary>
          <pre className="sql-view">{compiledSql}</pre>
        </details>
      )}
      <ul className="col-list">
        {columns.map((c, i) => (
          <li
            key={c.name}
            className={active === c.name ? 'on' : ''}
            onClick={() => onProfile(c.name)}
          >
            <span className="cl-idx">{i + 1}</span>
            <span className="cl-name">{c.name}</span>
            <span className="cl-type">
              <code>{c.type}</code>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatsTable({ stats }) {
  if (!stats?.length) return <div className="empty">Pas de statistiques disponibles.</div>
  const keys = Object.keys(stats[0])
  return (
    <div className="tablewrap">
      <table className="dt">
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.map((s, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k}>{fmt(s[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CleanReport({ report }) {
  if (!report?.length) return <div className="empty">Aucune opération de nettoyage exécutée.</div>
  return (
    <div className="clean-report">
      {report.map((r, i) => (
        <div className="cr-card" key={i}>
          <div className="cr-head">
            <span className="cr-op">{r.op_label}</span>
            <span className="cr-col">
              sur <b>{r.column}</b>
            </span>
          </div>
          <div className="cr-metrics">
            <span className="cr-m">
              <b>{r.changed.toLocaleString('fr-FR')}</b> modifiées
            </span>
            {r.was_null > 0 && (
              <span className="cr-m">
                <b>{r.was_null.toLocaleString('fr-FR')}</b> vides
              </span>
            )}
            {r.failed > 0 && (
              <span className="cr-m err">
                <b>{r.failed.toLocaleString('fr-FR')}</b> échecs (→ vide)
              </span>
            )}
          </div>
          {r.samples?.length > 0 && (
            <table className="cr-samples">
              <thead>
                <tr>
                  <th>avant</th>
                  <th></th>
                  <th>après</th>
                </tr>
              </thead>
              <tbody>
                {r.samples.map((s, j) => (
                  <tr key={j}>
                    <td>{s.old ?? <span className="null">vide</span>}</td>
                    <td>→</td>
                    <td>{s.new ?? <span className="null">vide</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

function ProfilePanel({ pid, wid, nodeId, handle, column, onPickValue }) {
  const [p, setP] = useState(null)
  useEffect(() => {
    if (!column) {
      setP(null)
      return
    }
    setP(null)
    api.profile(pid, wid, nodeId, column, handle).then(setP)
  }, [pid, wid, nodeId, handle, column])

  return (
    <div className="profile-panel">
      <div className="pp-head">
        <span className="pp-col">Profil : {column || '—'}</span>
      </div>
      {!column ? (
        <div className="pp-empty">Cliquez une colonne pour l'analyser.</div>
      ) : !p ? (
        <div className="pp-empty">Analyse…</div>
      ) : !p.available ? (
        <div className="pp-empty">Indisponible.</div>
      ) : (
        <div className="pp-body">
          <div className="pp-type">
            <code>{p.type}</code>
          </div>
          <div className="pp-grid">
            <Metric label="Lignes" value={p.total.toLocaleString('fr-FR')} />
            <Metric label="Vides" value={`${p.nulls} (${p.null_pct}%)`} />
            <Metric label="Distinctes" value={p.distinct.toLocaleString('fr-FR')} />
          </div>
          {p.numeric_stats && (
            <div className="pp-grid">
              <Metric label="min" value={fmt(p.numeric_stats.min)} />
              <Metric label="max" value={fmt(p.numeric_stats.max)} />
              <Metric label="moyenne" value={fmt(p.numeric_stats.avg)} />
              <Metric label="médiane" value={fmt(p.numeric_stats.median)} />
              <Metric label="écart-type" value={fmt(p.numeric_stats.stddev)} />
            </div>
          )}
          {p.histogram?.length > 0 && (
            <div className="pp-section">
              <div className="pp-title">Distribution</div>
              <Histogram bins={p.histogram} />
            </div>
          )}
          <div className="pp-section">
            <div className="pp-title">Valeurs fréquentes</div>
            <TopValues
              items={p.top_values}
              onPick={(val) => onPickValue && onPickValue(column, val)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <div className="m-val">{value}</div>
      <div className="m-lbl">{label}</div>
    </div>
  )
}

function Histogram({ bins }) {
  const max = Math.max(...bins.map((b) => b.count), 1)
  return (
    <div className="hist">
      {bins.map((b, i) => (
        <div className="hist-bar" key={i} title={`[${fmt(b.lo)} – ${fmt(b.hi)}] : ${b.count}`}>
          <div className="hist-fill" style={{ height: `${(b.count / max) * 100}%` }} />
        </div>
      ))}
    </div>
  )
}

function TopValues({ items, onPick }) {
  if (!items?.length) return <div className="muted">—</div>
  const max = Math.max(...items.map((v) => v.count), 1)
  return (
    <div className="topvals">
      {items.map((v, i) => (
        <div
          className={`tv${onPick ? ' clickable' : ''}`}
          key={i}
          onClick={onPick ? () => onPick(v.value) : undefined}
          title={onPick ? `Filtrer les données sur « ${v.value ?? 'vide'} »` : (v.value ?? 'vide')}
        >
          <div className="tv-label">{v.value ?? <span className="null">vide</span>}</div>
          <div className="tv-bar">
            <div className="tv-fill" style={{ width: `${(v.count / max) * 100}%` }} />
          </div>
          <div className="tv-count">{v.count.toLocaleString('fr-FR')}</div>
        </div>
      ))}
    </div>
  )
}
