import { useEffect, useState } from 'react'
import { api } from '../api'
import Icon from './Icon'
import {
  VAL_TESTS, CHAR_CLASS, needs, SEG_TYPES, OUTPUT_COLORS, uid,
  buildMaskPattern, makeCondition,
} from './validateHelpers'

/*
 * Validation block = named CONDITIONS (rules-DNF or positional mask) + OUTPUTS
 * that each reference one condition (optionally negated). No "control vs router"
 * split: a conforme/non-conforme check is just a 2-output routing.
 *
 *   ConditionsEditor — left pane: the "what to test" (conditions + live testers).
 *   OutputsPane      — right pane: compact flow map + the "where it goes"
 *                      (outputs, attribution, per-output preview) — fills the space.
 */

// Live distribution (server dry-run, no materialization), debounced on config change.
export function useRoutePreview(pid, wid, node) {
  const d = node.data
  const [dist, setDist] = useState({ total: 0, counts: {}, error: null, loading: false })
  const cfgKey = JSON.stringify({ o: d.outputs, cn: d.conditions, r: d.routing, e: d.else_enabled, cs: d.case_sensitive, tc: d.target_column })
  useEffect(() => {
    setDist((s) => ({ ...s, loading: true }))
    const h = setTimeout(() => {
      api.routePreview(pid, wid, node.id, d)
        .then((r) => setDist({ total: r.total, counts: r.counts || {}, error: null, loading: false }))
        .catch((e) => setDist((s) => ({ ...s, counts: {}, error: e.message, loading: false })))
    }, 350)
    return () => clearTimeout(h)
  }, [cfgKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return dist
}

/* ======================================================================== *
 *  LEFT — conditions (the "what to test")
 * ======================================================================== */

export function ConditionsEditor({ node, cols, onChange }) {
  const d = node.data
  const conditions = d.conditions || []
  const setConditions = (next) => onChange({ conditions: next })
  const updCond = (i, patch) => setConditions(conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const addCond = () => setConditions([...conditions, makeCondition({ name: `Condition ${conditions.length + 1}` })])
  const delCond = (i) => {
    const removed = conditions[i]
    onChange({
      conditions: conditions.filter((_, j) => j !== i),
      outputs: (d.outputs || []).map((o) => (o.match?.conditionId === removed?.id ? { ...o, match: { conditionId: '', negate: false } } : o)),
    })
  }

  return (
    <div className="conditions-editor">
      <div className="route-toolbar">
        <label className="fld" style={{ flex: 1, marginBottom: 0 }}>
          <span>Colonne par défaut</span>
          <select value={d.target_column || ''} onChange={(e) => onChange({ target_column: e.target.value })}>
            <option value="">—</option>
            {cols.length === 0 && <option value="">(exécutez l'amont)</option>}
            {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>
        <label className="qb-check" style={{ marginBottom: 2 }}>
          <input type="checkbox" checked={!!d.case_sensitive} onChange={(e) => onChange({ case_sensitive: e.target.checked })} />
          Sensible à la casse
        </label>
      </div>

      {conditions.length === 0 && <div className="qb-hint">Aucune condition. Créez-en une, puis attribuez-la à une sortie (à droite).</div>}
      {conditions.map((c, i) => (
        <div className="ccard" key={c.id}>
          <div className="ccard-head">
            <Icon name="filter" size={13} />
            <input className="ocard-name" value={c.name || ''} placeholder="Nom de la condition"
              onChange={(e) => updCond(i, { name: e.target.value })} />
            <button className="ghost danger small" onClick={() => delCond(i)} title="Supprimer la condition"><Icon name="x" /></button>
          </div>
          <ConditionBuilder cond={c} cols={cols} defaultCol={d.target_column} caseSensitive={!!d.case_sensitive}
            onChange={(patch) => updCond(i, patch)} />
        </div>
      ))}
      <button className="ghost route-add" onClick={addCond}><Icon name="plus" /> Ajouter une condition</button>
    </div>
  )
}

function ConditionBuilder({ cond, cols, defaultCol, caseSensitive, onChange }) {
  const kind = cond.kind || 'rules'
  return (
    <div className="cond-builder">
      <div className="cond-builder-head">
        <div className="mode-toggle sm">
          <button className={kind === 'rules' ? 'on' : ''} onClick={() => onChange({ kind: 'rules' })}>Règles</button>
          <button className={kind === 'mask' ? 'on' : ''} onClick={() => onChange({ kind: 'mask' })}>Masque</button>
          <button className={kind === 'group' ? 'on' : ''} onClick={() => onChange({ kind: 'group' })}>Groupe</button>
        </div>
        {kind !== 'group' && (
          <label className="cond-col">
            <span className="qb-lbl">colonne</span>
            <select className="qb-select" value={cond.column || ''} onChange={(e) => onChange({ column: e.target.value })}>
              <option value="">{defaultCol ? `défaut : ${defaultCol}` : '(par défaut)'}</option>
              {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {kind === 'mask'
        ? <MaskBuilder segments={cond.segments || []} caseSensitive={caseSensitive} onChange={(segments) => onChange({ segments })} />
        : kind === 'group'
          ? <GroupCheckBuilder cond={cond} cols={cols} onChange={onChange} />
          : <RulesBuilder groups={cond.groups || []} cols={cols} defaultCol={cond.column || defaultCol} onChange={(groups) => onChange({ groups })} />}
      {kind !== 'group' && <ConditionTester cond={cond} caseSensitive={caseSensitive} onChange={onChange} />}
    </div>
  )
}

// Catalog of group checks: [value, label, scope, extra]
//   scope 'col'  → needs a column to verify ; 'size' → about the group size only
//   extra 'number' → a N field ; 'value' → a free value field ; null → nothing
const GROUP_CHECKS = [
  ['unique', 'toutes différentes (unicité)', 'col', null],
  ['constant', 'toutes identiques (constance)', 'col', null],
  ['distinct_eq', 'exactement N valeurs distinctes', 'col', 'number'],
  ['distinct_min', 'au moins N valeurs distinctes', 'col', 'number'],
  ['distinct_max', 'au plus N valeurs distinctes', 'col', 'number'],
  ['contains', 'contenir la valeur', 'col', 'value'],
  ['not_contains', 'ne pas contenir la valeur', 'col', 'value'],
  ['size_eq', 'compter exactement N lignes', 'size', 'number'],
  ['size_min', 'compter au moins N lignes', 'size', 'number'],
  ['size_max', 'compter au plus N lignes', 'size', 'number'],
]

// Group check: routes rows by a property of the *group* (rows sharing a key).
// Layout reads as a sentence — the repeating KEY on top, then, indented below,
// the checked column and the property it must satisfy. It SORTS rows (a NON on
// the output isolates the offenders); it never adds a column.
function GroupCheckBuilder({ cond, cols, onChange }) {
  const keys = cond.group_by || []
  const toggle = (c) => onChange({ group_by: keys.includes(c) ? keys.filter((x) => x !== c) : [...keys, c] })
  const check = cond.check || 'unique'
  const spec = GROUP_CHECKS.find((g) => g[0] === check) || GROUP_CHECKS[0]
  const onCol = spec[2] === 'col'
  const extra = spec[3]
  return (
    <div className="cond-group-check">
      <div className="grp-key">
        <div className="grp-key-head">
          <Icon name="list" size={13} />
          <span>Clé de regroupement <span className="qb-lbl">— ce qui se répète</span></span>
        </div>
        <div className="checklist">
          {cols.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
          {cols.map((c) => (
            <label key={c.name} className="qb-check">
              <input type="checkbox" checked={keys.includes(c.name)} onChange={() => toggle(c.name)} />
              {c.name} <span className="coltype-inline">{c.type}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grp-rule">
        <span className="grp-rule-lead">dans chaque groupe,</span>
        <div className="grp-rule-body">
          {onCol && (
            <select className="qb-select" value={cond.column || ''} onChange={(e) => onChange({ column: e.target.value })}>
              <option value="">(colonne)</option>
              {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          )}
          <span className="qb-lbl">doit</span>
          <select className="qb-select" value={check} onChange={(e) => onChange({ check: e.target.value })}>
            {GROUP_CHECKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {extra === 'number' && (
            <input className="qb-input narrow" type="number" min="0" value={cond.n ?? ''}
              onChange={(e) => onChange({ n: e.target.value })} />
          )}
          {extra === 'value' && (
            <input className="qb-input" placeholder="valeur" value={cond.value ?? ''}
              onChange={(e) => onChange({ value: e.target.value })} />
          )}
        </div>
      </div>

      {keys.length === 0 && (
        <div className="qb-warn">
          ⚠ Aucune <b>clé de regroupement</b> cochée : le contrôle porte alors sur <b>toute la table</b>
          (l'unicité devient globale → si la colonne a des doublons, tout devient non conforme).
          Cochez ci-dessus la colonne qui se répète (ex. le nom de fichier).
        </div>
      )}
      <div className="qb-hint grp-hint">
        Une sortie reçoit la condition (groupes conformes) ; mets <b>NON</b> sur l'autre pour isoler les anomalies.
      </div>
    </div>
  )
}

// Rules as a DNF: OR of groups, each group an AND of rules (NON per rule).
function RulesBuilder({ groups, cols, defaultCol, onChange }) {
  const addGroup = () => onChange([...groups, { rules: [{ test: 'contains', value: '' }] }])
  const updGroup = (gi, rules) => onChange(groups.map((g, j) => (j === gi ? { ...g, rules } : g)))
  const delGroup = (gi) => onChange(groups.filter((_, j) => j !== gi))
  return (
    <div className="ocard-cond">
      {groups.length === 0 && <div className="qb-hint">Aucune règle. Ajoutez un groupe.</div>}
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="cond-or">OU</div>}
          <ConditionGroup rules={g.rules || []} cols={cols} defaultCol={defaultCol}
            onChange={(rules) => updGroup(gi, rules)} onDelete={() => delGroup(gi)} />
        </div>
      ))}
      <button className="ghost small cond-addgroup" onClick={addGroup}>+ Groupe (OU)</button>
    </div>
  )
}

function ConditionGroup({ rules, cols, defaultCol, onChange, onDelete }) {
  const upd = (i, patch) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const add = () => onChange([...rules, { test: 'contains', value: '' }])
  const del = (i) => onChange(rules.filter((_, j) => j !== i))
  return (
    <div className="cond-group">
      <div className="cond-group-head">
        <span className="qb-lbl">TOUTES ces conditions (ET)</span>
        <button className="ghost danger small" onClick={onDelete} title="Supprimer le groupe"><Icon name="x" /></button>
      </div>
      {rules.map((r, i) => (
        <div key={i}>
          {i > 0 && <span className="cond-and">ET</span>}
          <RuleRow r={r} cols={cols} defaultCol={defaultCol} onChange={(p) => upd(i, p)} onDelete={() => del(i)} />
        </div>
      ))}
      <button className="ghost small" onClick={add}>+ Condition (ET)</button>
    </div>
  )
}

export function RuleRow({ r, cols, defaultCol, onChange, onDelete }) {
  return (
    <div className="rrow">
      <button className={`neg ${r.negate ? 'on' : ''}`} onClick={() => onChange({ negate: !r.negate })}
        title="Inverser cette condition (NON)">NON</button>
      <select className="qb-select" value={r.column || ''} onChange={(e) => onChange({ column: e.target.value })} title="Colonne testée">
        <option value="">{defaultCol ? `(défaut : ${defaultCol})` : '(colonne par défaut)'}</option>
        {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      <select className="qb-select" value={r.test} onChange={(e) => onChange({ test: e.target.value })}>
        {VAL_TESTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {needs.position.includes(r.test) && (
        <><span className="qb-lbl">pos</span>
          <input className="qb-input narrow" type="number" min="1" value={r.position ?? 1} onChange={(e) => onChange({ position: Number(e.target.value) })} /></>
      )}
      {needs.startlen.includes(r.test) && (
        <><span className="qb-lbl">de</span>
          <input className="qb-input narrow" type="number" min="1" value={r.start ?? 1} onChange={(e) => onChange({ start: Number(e.target.value) })} />
          <span className="qb-lbl">sur</span>
          <input className="qb-input narrow" type="number" min="1" value={r.length ?? 1} onChange={(e) => onChange({ length: Number(e.target.value) })} /></>
      )}
      {needs.cls.includes(r.test) && (
        <select className="qb-select" value={r.charclass || 'letter'} onChange={(e) => onChange({ charclass: e.target.value })}>
          {CHAR_CLASS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
      {needs.number.includes(r.test) && (
        <input className="qb-input narrow" type="number" min="0" value={r.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} />
      )}
      {needs.value.includes(r.test) && (
        <input className="qb-input" placeholder={r.test === 'is_in' ? 'F0, F1, FE…' : 'valeur'} value={r.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} />
      )}
      {onDelete && <button className="ghost danger small rrow-del" onClick={onDelete}><Icon name="x" /></button>}
    </div>
  )
}

export function MaskBuilder({ segments, caseSensitive, onChange }) {
  const updSeg = (i, patch) => onChange(segments.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const moveSeg = (i, dir) => { const j = i + dir; if (j < 0 || j >= segments.length) return; const a = [...segments];[a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  const delSeg = (i) => onChange(segments.filter((_, j) => j !== i))
  const pattern = buildMaskPattern(segments, caseSensitive)
  return (
    <div className="mask-builder">
      <div className="qb-hint">Segment par segment, dans l'ordre. Ex. « AB1-2024 » : Texte « AB » · Chiffres ×1 · Texte « - » · Chiffres ×4.</div>
      <button className="ghost small" onClick={() => onChange([...segments, { type: 'letter', length: 1 }])}>+ Segment</button>
      <div className="clean-ops">
        {segments.map((s, i) => (
          <div className="vrule" key={i}>
            <div className="qb-row">
              <span className="vrule-idx">{i + 1}</span>
              <select className="qb-select" value={s.type} onChange={(e) => updSeg(i, { type: e.target.value })}>
                {SEG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button className="mini" onClick={() => moveSeg(i, -1)} disabled={i === 0}><Icon name="up" /></button>
              <button className="mini" onClick={() => moveSeg(i, 1)} disabled={i === segments.length - 1}><Icon name="down" /></button>
              <button className="ghost danger small" onClick={() => delSeg(i)}><Icon name="x" /></button>
            </div>
            <div className="qb-row indent">
              {(s.type === 'literal' || s.type === 'set') ? (
                <><span className="qb-lbl">{s.type === 'set' ? 'caractères' : 'texte'}</span>
                  <input className="qb-input" value={s.value || ''} onChange={(e) => updSeg(i, { value: e.target.value })} /></>
              ) : (
                <><span className="qb-lbl">longueur</span>
                  <input className="qb-input narrow" type="number" min="1" placeholder="exact" value={s.length ?? ''} onChange={(e) => updSeg(i, { length: e.target.value === '' ? '' : Number(e.target.value) })} />
                  <span className="qb-lbl">ou min</span>
                  <input className="qb-input narrow" type="number" min="0" value={s.min ?? ''} onChange={(e) => updSeg(i, { min: e.target.value === '' ? '' : Number(e.target.value) })} />
                  <span className="qb-lbl">max</span>
                  <input className="qb-input narrow" type="number" min="0" value={s.max ?? ''} onChange={(e) => updSeg(i, { max: e.target.value === '' ? '' : Number(e.target.value) })} /></>
              )}
            </div>
          </div>
        ))}
        {segments.length === 0 && <div className="qb-hint">Aucun segment — cliquez « + Segment ».</div>}
      </div>
      {pattern && <div className="vtest-pattern"><span className="qb-lbl">motif généré</span> <code>{pattern}</code></div>}
    </div>
  )
}

// Live green/red tester for a single condition (debounced, uses the unsaved
// config). Hidden behind a checkbox so it stays out of the way unless wanted.
function ConditionTester({ cond, caseSensitive, onChange }) {
  const samplesText = cond.test_samples || ''
  const sampleLines = samplesText.split('\n').map((s) => s.trim()).filter(Boolean)
  const [open, setOpen] = useState(!!samplesText)
  const [test, setTest] = useState({ results: [], error: null, loading: false })
  const cfgKey = JSON.stringify({ k: cond.kind, g: cond.groups, s: cond.segments, cs: caseSensitive })
  useEffect(() => {
    if (!open || sampleLines.length === 0) { setTest({ results: [], error: null, loading: false }); return }
    setTest((t) => ({ ...t, loading: true }))
    const cfg = { kind: cond.kind || 'rules', groups: cond.groups || [], segments: cond.segments || [], case_sensitive: caseSensitive }
    const h = setTimeout(() => {
      api.validateTest(cfg, sampleLines)
        .then((r) => setTest({ results: r.ok ? (r.results || []) : [], error: r.ok ? null : r.error, loading: false }))
        .catch((e) => setTest({ results: [], error: e.message, loading: false }))
    }, 300)
    return () => clearTimeout(h)
  }, [cfgKey, samplesText, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const passCount = test.results.filter((r) => r.valid).length
  return (
    <div className="vtest">
      <label className="vtest-toggle">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        <span className="ports-title">Testeur</span>
        {open && test.loading && <span className="vtest-spin">…</span>}
        {open && sampleLines.length > 0 && !test.error && (
          <span className={`vtest-score ${passCount === sampleLines.length ? 'all' : ''}`}>{passCount}/{sampleLines.length}</span>
        )}
      </label>
      {open && (
        <>
          <textarea className="vtest-input" rows={2} spellCheck={false}
            placeholder={'Exemples (un par ligne)… F0-01073.pdf'}
            value={samplesText} onChange={(e) => onChange({ test_samples: e.target.value })} />
          {test.error && <div className="qb-warn">{test.error}</div>}
          {sampleLines.length > 0 && !test.error && (
            <div className="vtest-results">
              {sampleLines.map((s, i) => {
                const r = test.results[i]
                const ok = r?.valid
                return (
                  <div className="vtest-item" key={i}>
                    <div className={`vtest-row ${ok ? 'ok' : 'ko'}`}>
                      <span className="vtest-mark"><Icon name={ok ? 'check' : 'x'} size={11} /></span>
                      <span className="vtest-val" title={s}>{s}</span>
                      {!ok && r?.motif && r.motif !== 'OK' && <span className="vtest-motif" title={r.motif}>{r.motif}</span>}
                    </div>
                    {r?.steps?.length > 0 && (
                      <div className="vtest-steps">
                        {r.steps.map((st, j) => (
                          <span key={j} className={`vstep ${st.status}`} title={st.label}>{st.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ======================================================================== *
 *  RIGHT — flow map + outputs settings (the "where it goes") + preview
 * ======================================================================== */

export function OutputsPane({ pid, wid, node, onChange, onPreview }) {
  const dist = useRoutePreview(pid, wid, node)
  const d = node.data
  const conditions = d.conditions || []
  const outputs = d.outputs || []
  const routing = d.routing || 'first'

  // display-only sort of the flow map (does NOT touch the outputs' real order —
  // in 'first' mode that order drives the partition routing).
  const [sortDesc, setSortDesc] = useState(false)

  const items = [
    ...outputs.map((o) => ({ id: o.id, label: o.label || o.id, color: o.color, count: dist.counts[o.id] ?? 0 })),
    ...(d.else_enabled !== false ? [{ id: 'else', label: d.else_label || 'Non classé', color: d.else_color || '#9aa3b2', count: dist.counts.else ?? 0 }] : []),
  ]
  const flowItems = sortDesc ? [...items].sort((a, b) => (b.count || 0) - (a.count || 0)) : items

  const setOutput = (i, patch) => onChange({ outputs: outputs.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const addOutput = () => onChange({
    outputs: [...outputs, {
      id: uid(), label: `Sortie ${outputs.length + 1}`,
      color: OUTPUT_COLORS[outputs.length % OUTPUT_COLORS.length],
      match: { conditionId: conditions[0]?.id || '', negate: false },
    }],
  })
  const delOutput = (i) => onChange({ outputs: outputs.filter((_, j) => j !== i) })
  const moveOutput = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= outputs.length) return
    const a = [...outputs];[a[i], a[j]] = [a[j], a[i]]; onChange({ outputs: a })
  }

  return (
    <div className="opane">
      <div className="opane-flow">
        <div className="route-flow-head">
          <span className="ports-title">Carte des flux</span>
          {dist.loading && <span className="vtest-spin">…</span>}
          <div className="route-mode">
            <div className="mode-toggle sm">
              <button className={routing === 'first' ? 'on' : ''} onClick={() => onChange({ routing: 'first' })}
                title="Chaque ligne va dans la PREMIÈRE sortie dont la condition est vraie (ensembles disjoints).">Partition</button>
              <button className={routing === 'all' ? 'on' : ''} onClick={() => onChange({ routing: 'all' })}
                title="Une ligne peut aller dans PLUSIEURS sorties.">Chevauchement</button>
            </div>
          </div>
          <button className={`flow-sort ${sortDesc ? 'on' : ''}`} onClick={() => setSortDesc((v) => !v)}
            title={sortDesc ? 'Ordre des sorties' : 'Trier par effectif décroissant'}>
            <Icon name="sort" size={13} /> {sortDesc ? 'décroissant' : 'trier'}
          </button>
          <span className="route-total">Entrée : {dist.total.toLocaleString('fr-FR')}</span>
        </div>
        {dist.error ? <div className="qb-warn">{dist.error}</div> : <FlowMap items={flowItems} total={dist.total} height={230} />}
      </div>

      <div className="opane-outs">
        <div className="ports-head">
          <span className="ports-title">Sorties</span>
          <span className="qb-hint" style={{ marginLeft: 'auto' }}>chaque sortie reçoit une condition</span>
        </div>
        <div className="opane-outs-list">
          {outputs.map((o, i) => (
            <OutputRow key={o.id} o={o} index={i} last={i === outputs.length - 1} conditions={conditions}
              count={dist.counts[o.id]} onChange={(patch) => setOutput(i, patch)} onDelete={() => delOutput(i)}
              onMove={(dir) => moveOutput(i, dir)} onPreview={() => onPreview(o.id)} />
          ))}
          <button className="ghost route-add" onClick={addOutput}><Icon name="plus" /> Ajouter une sortie</button>
          <div className="route-else">
            <label className="qb-check">
              <input type="checkbox" checked={d.else_enabled !== false} onChange={(e) => onChange({ else_enabled: e.target.checked })} />
              Sortie « reste » pour les lignes non classées
            </label>
            {d.else_enabled !== false && (
              <div className="route-else-cfg">
                <input type="color" value={d.else_color || '#9aa3b2'} onChange={(e) => onChange({ else_color: e.target.value })} />
                <input className="qb-input" value={d.else_label || ''} placeholder="Non classé"
                  onChange={(e) => onChange({ else_label: e.target.value })} />
                {dist.counts.else != null && <span className="route-count">{dist.counts.else.toLocaleString('fr-FR')}</span>}
                <button className="mini" title="Aperçu de cette sortie" onClick={() => onPreview('else')}><Icon name="eye" /></button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function OutputRow({ o, index, last, conditions, count, onChange, onDelete, onMove, onPreview }) {
  const match = o.match || { conditionId: '', negate: false }
  const setMatch = (patch) => onChange({ match: { ...match, ...patch } })
  return (
    <div className="ocard" style={{ borderLeftColor: o.color }}>
      <div className="ocard-head">
        <input type="color" value={o.color || '#4E79A7'} onChange={(e) => onChange({ color: e.target.value })} title="Couleur de la sortie" />
        <input className="ocard-name" value={o.label || ''} placeholder="Nom de la sortie" onChange={(e) => onChange({ label: e.target.value })} />
        {count != null && <span className="route-count">{count.toLocaleString('fr-FR')}</span>}
        <button className="mini" title="Aperçu des données de cette sortie" onClick={onPreview}><Icon name="eye" /></button>
        <button className="mini" onClick={() => onMove(-1)} disabled={index === 0}><Icon name="up" /></button>
        <button className="mini" onClick={() => onMove(1)} disabled={last}><Icon name="down" /></button>
        <button className="ghost danger small" onClick={onDelete}><Icon name="x" /></button>
      </div>
      <div className="ocard-attr">
        <span className="qb-lbl">reçoit</span>
        <button className={`neg ${match.negate ? 'on' : ''}`} onClick={() => setMatch({ negate: !match.negate })}
          title="Inverser : les lignes qui NE satisfont PAS la condition">NON</button>
        <select className="qb-select" value={match.conditionId || ''} onChange={(e) => setMatch({ conditionId: e.target.value })}>
          <option value="">— choisir une condition —</option>
          {conditions.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
        </select>
      </div>
      {!match.conditionId && <div className="qb-hint">Sans condition attribuée, cette sortie reste vide.</div>}
    </div>
  )
}

// One-stage Sankey: a single input bar on the left fans out into the outputs.
export function FlowMap({ items, total, height = 380 }) {
  const W = 760, barW = 15, gap = 10, padL = 96, padR = 198
  const n = items.length
  const S = Math.max(1, items.reduce((a, it) => a + (it.count || 0), 0))
  // Right-side bands get a minimum height so a tiny category (and its two-line
  // label) stays fully readable instead of collapsing onto its neighbour. The SVG
  // grows taller if the floors no longer fit, so every output is always visible.
  const minSlot = 30
  const H = Math.max(height, n * minSlot + gap * Math.max(0, n - 1))
  const usableH = Math.max(20, H - gap * Math.max(0, n - 1))
  const floor = Math.min(minSlot, usableH / Math.max(1, n))
  const extra = Math.max(0, usableH - floor * n)
  const leftX = padL, rightX = W - padR
  // top/bottom padding so a band's three-line label (which extends below its
  // centre) is never clipped at the edges of the SVG.
  const padT = 6, padB = 22
  // share of the whole input, 2 decimals, French formatting (e.g. "75,55 %")
  const pct = (c) => (total > 0 ? `${((c || 0) / total * 100).toFixed(2).replace('.', ',')} %` : '')
  let ly = 0, ry = 0
  const ribbons = items.map((it) => {
    const c = it.count || 0
    const lh = (c / S) * H
    const rh = floor + (c / S) * extra
    const seg = { it, ly0: ly, ly1: ly + lh, ry0: ry, ry1: ry + rh }
    ly += lh; ry += rh + gap
    return seg
  })
  const ribbon = (x0, a0, b0, x1, a1, b1) => {
    const mx = (x0 + x1) / 2
    return `M ${x0} ${a0} C ${mx} ${a0}, ${mx} ${a1}, ${x1} ${a1} L ${x1} ${b1} C ${mx} ${b1}, ${mx} ${b0}, ${x0} ${b0} Z`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H + padT + padB}`} className="flow-svg" preserveAspectRatio="xMidYMid meet">
      <g transform={`translate(0, ${padT})`}>
        <rect x={leftX - barW} y={0} width={barW} height={H} rx={2} fill="#9aa3b2" />
        <text x={leftX - barW - 6} y={14} textAnchor="end" className="flow-in">Entrée</text>
        <text x={leftX - barW - 6} y={28} textAnchor="end" className="flow-in-n">{total.toLocaleString('fr-FR')}</text>
        {ribbons.map(({ it, ly0, ly1, ry0, ry1 }) => (
          <g key={it.id}>
            <path d={ribbon(leftX, ly0, ly1, rightX, ry0, ry1)} fill={it.color} opacity="0.5" />
            <rect x={rightX} y={ry0} width={barW} height={Math.max(1, ry1 - ry0)} rx={2} fill={it.color} />
            <text x={rightX + barW + 7} y={(ry0 + ry1) / 2 - 1} className="flow-lbl">
              {it.label}<tspan className="flow-pct"> · {pct(it.count)}</tspan>
            </text>
            <text x={rightX + barW + 7} y={(ry0 + ry1) / 2 + 12} className="flow-cnt">{(it.count || 0).toLocaleString('fr-FR')}</text>
          </g>
        ))}
        {S === 1 && items.every((it) => !it.count) && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="flow-empty">— exécute l'amont pour voir la répartition —</text>
        )}
      </g>
    </svg>
  )
}
