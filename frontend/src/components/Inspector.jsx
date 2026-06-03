import { useEffect, useState } from 'react'
import { api } from '../api'
import QueryBuilder from './QueryBuilder'
import Icon from './Icon'

export default function Inspector({ pid, node, files, inputs, onChange, onSchema, onDelete }) {
  if (!node) {
    return (
      <div className="inspector empty-inspector">
        <p className="muted">Sélectionnez un bloc pour le configurer, ou ajoutez-en un depuis la barre d'outils.</p>
        <div className="legend">
          <div><span className="dot src" /> Source — lit un fichier Excel/CSV</div>
          <div><span className="dot sql" /> SQL — transforme les données</div>
          <div><span className="dot exp" /> Export — écrit un fichier</div>
        </div>
      </div>
    )
  }
  const set = (patch) => onChange(node.id, patch)
  return (
    <div className="inspector">
      <div className="insp-head">
        <input className="insp-title" value={node.data.label || ''} onChange={(e) => set({ label: e.target.value })} />
        <button className="ghost danger small" onClick={() => onDelete(node.id)}>Supprimer</button>
      </div>
      <div className="insp-type">
        <span>{typeLabel(node.type)}</span>
        {node.type !== 'export' && (
          <label className="lock-toggle" title="Verrouiller : le bloc n'est pas recalculé tant qu'il est verrouillé (fige le résultat même si la source change).">
            <input type="checkbox" checked={!!node.data.locked} onChange={(e) => set({ locked: e.target.checked })} />
            <Icon name="lock" size={12} /> Verrouiller le résultat
          </label>
        )}
      </div>

      {node.type === 'source' && <SourceConfig pid={pid} node={node} files={files} set={set} onSchema={onSchema} />}
      {node.type === 'sql' && <SqlConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'dedup' && <DedupConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'validate' && <ValidateConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'pivot' && <PivotConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'clean' && <CleanConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'calc' && <CalcConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'union' && <UnionConfig node={node} inputs={inputs} set={set} />}
      {node.type === 'export' && <ExportConfig node={node} set={set} />}
    </div>
  )
}

function typeLabel(t) {
  return {
    source: 'Bloc Source', sql: 'Bloc SQL', dedup: 'Bloc Doublons', validate: 'Bloc Validation',
    pivot: 'Bloc Pivot', clean: 'Bloc Nettoyage', calc: 'Bloc Calcul', union: 'Bloc Union', export: 'Bloc Export',
  }[t] || t
}

const VAL_TESTS = [
  ['starts_with', 'commence par'], ['ends_with', 'finit par'], ['contains', 'contient'],
  ['not_contains', 'ne contient pas'], ['equals', 'est égal à'], ['not_equals', 'est différent de'],
  ['char_class', 'le Nᵉ caractère est (type)'], ['char_equals', 'le Nᵉ caractère est (valeur)'],
  ['substr_equals', 'les caractères X..N = valeur'], ['substr_class', 'les caractères X..N sont (type)'],
  ['length_eq', 'longueur ='], ['length_min', 'longueur ≥'], ['length_max', 'longueur ≤'],
  ['is_in', 'est dans la liste'], ['is_empty', 'est vide'], ['not_empty', 'est non vide'],
  ['is_numeric', 'est numérique'], ['regex', 'regex (contient)'], ['regex_full', 'regex (complète)'],
]
const CHAR_CLASS = [['letter', 'lettre'], ['upper', 'majuscule'], ['lower', 'minuscule'], ['digit', 'chiffre'], ['alnum', 'alphanumérique']]
const SEG_TYPES = [['literal', 'Texte exact'], ['letter', 'Lettres'], ['upper', 'Majuscules'], ['lower', 'Minuscules'], ['digit', 'Chiffres'], ['alnum', 'Alphanumérique'], ['set', 'Jeu de caractères'], ['any', "N'importe"]]
const needs = {
  value: ['starts_with', 'ends_with', 'contains', 'not_contains', 'equals', 'not_equals', 'char_equals', 'substr_equals', 'is_in', 'regex', 'regex_full'],
  position: ['char_class', 'char_equals'],
  startlen: ['substr_equals', 'substr_class'],
  cls: ['char_class', 'substr_class'],
  number: ['length_eq', 'length_min', 'length_max'],
}
const CLASS_RE_JS = { letter: '[A-Za-z]', upper: '[A-Z]', lower: '[a-z]', digit: '[0-9]', alnum: '[A-Za-z0-9]', any: '.' }
const CLASS_FR = { letter: 'lettre', upper: 'majuscule', lower: 'minuscule', digit: 'chiffre', alnum: 'alphanum.' }

function escapeRe(s) { return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Live, client-side reconstruction of the positional-mask regex (mirror of
// backend _mask_pattern) so the user sees the pattern instantly.
function buildMaskPattern(segs, caseSensitive) {
  const parts = []
  for (const seg of segs || []) {
    const t = seg.type || 'any'
    if (t === 'literal') { parts.push(escapeRe(seg.value || '')); continue }
    const base = t === 'set' ? `[${escapeRe(seg.value || '')}]` : (CLASS_RE_JS[t] || '.')
    const ln = seg.length, lo = seg.min, hi = seg.max
    let quant
    if (ln !== undefined && ln !== '' && ln !== null) quant = `{${Number(ln)}}`
    else if ((lo !== undefined && lo !== '' && lo !== null) || (hi !== undefined && hi !== '' && hi !== null))
      quant = `{${lo !== '' && lo != null ? Number(lo) : 0},${hi !== '' && hi != null ? Number(hi) : ''}}`
    else quant = '{1}'
    parts.push(base + quant)
  }
  if (!parts.length) return ''
  return (caseSensitive ? '' : '(?i)') + parts.join('')
}

function ruleSummary(r) {
  const v = r.value ?? ''
  const cls = CLASS_FR[r.charclass] || r.charclass || ''
  const end = Number(r.start || 1) + Number(r.length || 1) - 1
  switch (r.test) {
    case 'starts_with': return `commence par « ${v} »`
    case 'ends_with': return `finit par « ${v} »`
    case 'contains': return `contient « ${v} »`
    case 'not_contains': return `ne contient pas « ${v} »`
    case 'equals': return `est égal à « ${v} »`
    case 'not_equals': return `est différent de « ${v} »`
    case 'regex': return `regex (contient) ${v}`
    case 'regex_full': return `regex (complète) ${v}`
    case 'length_eq': return `longueur = ${v}`
    case 'length_min': return `longueur ≥ ${v}`
    case 'length_max': return `longueur ≤ ${v}`
    case 'char_class': return `caractère ${r.position || 1} = ${cls}`
    case 'char_equals': return `caractère ${r.position || 1} = « ${v} »`
    case 'substr_equals': return `caractères ${r.start || 1}…${end} = « ${v} »`
    case 'substr_class': return `caractères ${r.start || 1}…${end} = ${cls}`
    case 'is_in': return `dans la liste : ${v}`
    case 'is_empty': return 'est vide'
    case 'not_empty': return 'est non vide'
    case 'is_numeric': return 'est numérique'
    default: return r.test
  }
}

function ValidateConfig({ node, inputs, set }) {
  const d = node.data
  const mode = d.mode || 'rules'
  const rules = d.rules || []
  const segs = d.segments || []
  const samplesText = d.test_samples || ''
  const sampleLines = samplesText.split('\n').map((s) => s.trim()).filter(Boolean)
  const updRule = (i, patch) => set({ rules: rules.map((r, j) => j === i ? { ...r, ...patch } : r) })
  const updSeg = (i, patch) => set({ segments: segs.map((s, j) => j === i ? { ...s, ...patch } : s) })
  const moveSeg = (i, dir) => { const j = i + dir; if (j < 0 || j >= segs.length) return; const a = [...segs];[a[i], a[j]] = [a[j], a[i]]; set({ segments: a }) }

  // ---- live tester (debounced, uses the unsaved config) ----
  const [test, setTest] = useState({ results: [], error: null, loading: false })
  const cfgKey = JSON.stringify({ mode, t: d.target_column, cs: !!d.case_sensitive, cb: d.combine, rules, segs })
  useEffect(() => {
    if (sampleLines.length === 0) { setTest({ results: [], error: null, loading: false }); return }
    setTest((t) => ({ ...t, loading: true }))
    const cfg = { mode, target_column: d.target_column, case_sensitive: d.case_sensitive, combine: d.combine, rules, segments: segs }
    const h = setTimeout(() => {
      api.validateTest(cfg, sampleLines)
        .then((r) => setTest({ results: r.ok ? (r.results || []) : [], error: r.ok ? null : r.error, loading: false }))
        .catch((e) => setTest({ results: [], error: e.message, loading: false }))
    }, 300)
    return () => clearTimeout(h)
  }, [cfgKey, samplesText]) // eslint-disable-line react-hooks/exhaustive-deps

  const maskPattern = mode === 'mask' ? buildMaskPattern(segs, d.case_sensitive) : ''
  const passCount = test.results.filter((r) => r.valid).length

  return (
    <div className="insp-body">
      {inputs.length === 0 && <div className="qb-warn">Connectez une entrée puis exécutez l'amont pour charger les colonnes.</div>}

      <div className="ports-head">
        <span className="ports-title">Validation de nomenclature</span>
        <InfoBubble>
          Contrôle qu'une colonne respecte un format. Deux sorties : <b>Conformes</b> et <b>Non conformes</b>.<br />
          Activez la colonne <b>« motif »</b> pour savoir, sur chaque ligne, quelle règle échoue.
        </InfoBubble>
      </div>

      <label className="fld">
        <span>Colonne à contrôler</span>
        <ColSelect inputs={inputs} value={d.target_column} onChange={(v) => set({ target_column: v })} allowEmpty />
      </label>

      <div className="mode-toggle">
        <button className={mode === 'rules' ? 'on' : ''} onClick={() => set({ mode: 'rules' })}>Règles</button>
        <button className={mode === 'mask' ? 'on' : ''} onClick={() => set({ mode: 'mask' })}>Masque positionnel</button>
      </div>

      <label className="qb-check" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={!!d.case_sensitive} onChange={(e) => set({ case_sensitive: e.target.checked })} />
        Sensible à la casse (majuscules / minuscules)
      </label>

      {mode === 'rules' ? (
        <>
          <label className="fld">
            <span>Une ligne est conforme si…</span>
            <select value={d.combine || 'all'} onChange={(e) => set({ combine: e.target.value })}>
              <option value="all">toutes les règles sont respectées (ET)</option>
              <option value="any">au moins une règle est respectée (OU)</option>
            </select>
          </label>
          <button className="ghost small" onClick={() => set({ rules: [...rules, { test: 'starts_with', value: '' }] })}>+ Règle</button>
          <div className="clean-ops">
            {rules.map((r, i) => (
              <div className="vrule" key={i}>
                <div className="qb-row">
                  <span className="vrule-idx">{i + 1}</span>
                  <select className="qb-select" value={r.test} onChange={(e) => updRule(i, { test: e.target.value })}>
                    {VAL_TESTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button className="ghost danger small vrule-del" onClick={() => set({ rules: rules.filter((_, j) => j !== i) })}><Icon name="x" /></button>
                </div>
                {(needs.position.includes(r.test) || needs.startlen.includes(r.test) || needs.cls.includes(r.test) || needs.number.includes(r.test) || needs.value.includes(r.test)) && (
                  <div className="qb-row indent">
                    {needs.position.includes(r.test) && (
                      <><span className="qb-lbl">position</span>
                        <input className="qb-input narrow" type="number" min="1" value={r.position ?? 1} onChange={(e) => updRule(i, { position: Number(e.target.value) })} /></>
                    )}
                    {needs.startlen.includes(r.test) && (
                      <><span className="qb-lbl">de</span>
                        <input className="qb-input narrow" type="number" min="1" value={r.start ?? 1} onChange={(e) => updRule(i, { start: Number(e.target.value) })} />
                        <span className="qb-lbl">sur</span>
                        <input className="qb-input narrow" type="number" min="1" value={r.length ?? 1} onChange={(e) => updRule(i, { length: Number(e.target.value) })} /></>
                    )}
                    {needs.cls.includes(r.test) && (
                      <select className="qb-select" value={r.charclass || 'letter'} onChange={(e) => updRule(i, { charclass: e.target.value })}>
                        {CHAR_CLASS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    )}
                    {needs.number.includes(r.test) && (
                      <input className="qb-input narrow" type="number" min="0" value={r.value ?? ''} onChange={(e) => updRule(i, { value: e.target.value })} />
                    )}
                    {needs.value.includes(r.test) && (
                      <input className="qb-input" placeholder={r.test === 'is_in' ? 'F0, F1, FE, FX…' : 'valeur'} value={r.value ?? ''} onChange={(e) => updRule(i, { value: e.target.value })} />
                    )}
                  </div>
                )}
                <div className="vrule-sum">{ruleSummary(r)}</div>
              </div>
            ))}
            {rules.length === 0 && <div className="qb-hint">Aucune règle — cliquez « + Règle ».</div>}
          </div>
        </>
      ) : (
        <>
          <div className="ports-head" style={{ marginTop: 4 }}>
            <span className="ports-title">Segments, dans l'ordre</span>
            <InfoBubble>
              Décrivez la chaîne segment par segment. Ex. « AB1-2024 » :
              Texte « AB » · Chiffres ×1 · Texte « - » · Chiffres ×4.<br />
              « Jeu de caractères » = un seul caractère parmi ceux listés (ex. <code>FR</code> → F ou R).
            </InfoBubble>
          </div>
          <button className="ghost small" onClick={() => set({ segments: [...segs, { type: 'letter', length: 1 }] })}>+ Segment</button>
          <div className="clean-ops">
            {segs.map((s, i) => (
              <div className="vrule" key={i}>
                <div className="qb-row">
                  <span className="vrule-idx">{i + 1}</span>
                  <select className="qb-select" value={s.type} onChange={(e) => updSeg(i, { type: e.target.value })}>
                    {SEG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button className="mini" onClick={() => moveSeg(i, -1)} disabled={i === 0}><Icon name="up" /></button>
                  <button className="mini" onClick={() => moveSeg(i, 1)} disabled={i === segs.length - 1}><Icon name="down" /></button>
                  <button className="ghost danger small" onClick={() => set({ segments: segs.filter((_, j) => j !== i) })}><Icon name="x" /></button>
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
            {segs.length === 0 && <div className="qb-hint">Aucun segment — cliquez « + Segment ».</div>}
          </div>
          {maskPattern && (
            <div className="vtest-pattern"><span className="qb-lbl">motif généré</span> <code>{maskPattern}</code></div>
          )}
        </>
      )}

      {/* ---------- live tester ---------- */}
      <div className="vtest">
        <div className="ports-head">
          <span className="ports-title">Testeur {test.loading && <span className="vtest-spin">…</span>}</span>
          <InfoBubble>
            Collez des exemples (un par ligne) pour voir <b>en direct</b> lesquels passent et,
            sinon, quelle règle échoue. Ces exemples sont enregistrés avec le bloc.
          </InfoBubble>
          {sampleLines.length > 0 && !test.error && (
            <span className={`vtest-score ${passCount === sampleLines.length ? 'all' : ''}`}>{passCount}/{sampleLines.length}</span>
          )}
        </div>
        <textarea className="vtest-input" rows={4} spellCheck={false}
          placeholder={'F0-01073-0-01.pdf\nF1-01153-0-Feuille1.pdf\nXX-123'}
          value={samplesText} onChange={(e) => set({ test_samples: e.target.value })} />
        {test.error && <div className="qb-warn">{test.error}</div>}
        {sampleLines.length > 0 && !test.error && (
          <div className="vtest-results">
            {sampleLines.map((s, i) => {
              const r = test.results[i]
              const ok = r?.valid
              return (
                <div className={`vtest-row ${ok ? 'ok' : 'ko'}`} key={i}>
                  <span className="vtest-mark"><Icon name={ok ? 'check' : 'x'} size={11} /></span>
                  <span className="vtest-val" title={s}>{s}</span>
                  {!ok && r?.motif && r.motif !== 'OK' && <span className="vtest-motif" title={r.motif}>{r.motif}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="fld" style={{ marginTop: 14 }}>
        <span>Colonnes de diagnostic à ajouter</span>
        <label className="qb-check"><input type="checkbox" checked={!!d.add_flag} onChange={(e) => set({ add_flag: e.target.checked })} /> « valide » (oui / non)</label>
        <label className="qb-check"><input type="checkbox" checked={!!d.add_reason} onChange={(e) => set({ add_reason: e.target.checked })} /> « motif » (règle en échec)</label>
      </div>

      <div className="outs-legend">
        <div><span className="odot kept" /> <b>Conformes</b> — respectent les règles</div>
        <div><span className="odot dups" /> <b>Non conformes</b> — à corriger (voir « motif »)</div>
      </div>
    </div>
  )
}

const CLEAN_OPS = [
  ['trim', 'Supprimer les espaces'],
  ['upper', 'MAJUSCULES'],
  ['lower', 'minuscules'],
  ['capitalize', 'Capitaliser'],
  ['replace', 'Rechercher / remplacer'],
  ['fillna', 'Remplir les vides'],
  ['to_number', 'Convertir en nombre'],
  ['to_integer', 'Convertir en entier'],
  ['to_date', 'Convertir en date'],
  ['round', 'Arrondir'],
  ['abs', 'Valeur absolue'],
]
const PIVOT_AGG = ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'MEDIAN', 'FIRST', 'LAST']

function ColSelect({ inputs, value, onChange, allowEmpty }) {
  const cols = inputs[0]?.columns || []
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">—</option>}
      {cols.length === 0 && <option value="">(exécutez l'amont)</option>}
      {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
    </select>
  )
}

function ColChecklist({ inputs, selected, onToggle }) {
  const cols = inputs[0]?.columns || []
  return (
    <div className="checklist">
      {cols.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
      {cols.map((c) => (
        <label key={c.name} className="qb-check">
          <input type="checkbox" checked={selected.includes(c.name)} onChange={() => onToggle(c.name)} />
          {c.name} <span className="coltype-inline">{c.type}</span>
        </label>
      ))}
    </div>
  )
}

function PivotConfig({ node, inputs, set }) {
  const d = node.data
  const mode = d.mode || 'pivot'
  const idx = d.index_columns || []
  const vals = d.value_columns || []
  const toggleIdx = (c) => set({ index_columns: idx.includes(c) ? idx.filter((x) => x !== c) : [...idx, c] })
  const toggleVal = (c) => set({ value_columns: vals.includes(c) ? vals.filter((x) => x !== c) : [...vals, c] })
  return (
    <div className="insp-body">
      <div className="mode-toggle">
        <button className={mode === 'pivot' ? 'on' : ''} onClick={() => set({ mode: 'pivot' })}>Pivot</button>
        <button className={mode === 'unpivot' ? 'on' : ''} onClick={() => set({ mode: 'unpivot' })}>Dépivot</button>
      </div>

      {mode === 'pivot' ? (
        <>
          <p className="qb-hint">Transforme les valeurs d'une colonne en nouvelles colonnes (comme un TCD Excel).</p>
          <div className="fld">
            <span>Lignes (colonnes conservées)</span>
            <ColChecklist inputs={inputs} selected={idx} onToggle={toggleIdx} />
          </div>
          <label className="fld">
            <span>Colonne à éclater en colonnes</span>
            <ColSelect inputs={inputs} value={d.pivot_column} onChange={(v) => set({ pivot_column: v })} allowEmpty />
          </label>
          <label className="fld">
            <span>Colonne de valeurs</span>
            <ColSelect inputs={inputs} value={d.value_column} onChange={(v) => set({ value_column: v })} allowEmpty />
          </label>
          <label className="fld">
            <span>Agrégat</span>
            <select value={d.agg || 'SUM'} onChange={(e) => set({ agg: e.target.value })}>
              {PIVOT_AGG.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
        </>
      ) : (
        <>
          <p className="qb-hint">Transforme plusieurs colonnes en deux colonnes (nom, valeur).</p>
          <div className="fld">
            <span>Colonnes à dépivoter</span>
            <ColChecklist inputs={inputs} selected={vals} onToggle={toggleVal} />
          </div>
          <label className="fld">
            <span>Nom de la colonne « nom »</span>
            <input value={d.name_column || ''} placeholder="variable" onChange={(e) => set({ name_column: e.target.value })} />
          </label>
          <label className="fld">
            <span>Nom de la colonne « valeur »</span>
            <input value={d.value_column || ''} placeholder="valeur" onChange={(e) => set({ value_column: e.target.value })} />
          </label>
        </>
      )}
    </div>
  )
}

function CleanConfig({ node, inputs, set }) {
  const d = node.data
  const ops = d.operations || []
  const upd = (i, patch) => set({ operations: ops.map((o, j) => j === i ? { ...o, ...patch } : o) })
  const del = (i) => set({ operations: ops.filter((_, j) => j !== i) })
  const add = () => set({ operations: [...ops, { op: 'trim', column: inputs[0]?.columns?.[0]?.name || '', enabled: true }] })
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= ops.length) return
    const a = [...ops];[a[i], a[j]] = [a[j], a[i]]; set({ operations: a })
  }
  return (
    <div className="insp-body">
      {inputs.length === 0 && <div className="qb-warn">Connectez une entrée puis exécutez l'amont pour charger les colonnes.</div>}
      <p className="qb-hint">Les opérations s'appliquent dans l'ordre, l'une après l'autre. Un rapport montre à chaque exécution ce qui a changé / échoué.</p>
      <button className="ghost small" onClick={add}>+ Opération</button>
      <div className="clean-ops">
        {ops.map((o, i) => (
          <div className={`clean-op ${o.enabled === false ? 'off' : ''}`} key={i}>
            <div className="qb-row">
              <input type="checkbox" checked={o.enabled !== false} onChange={(e) => upd(i, { enabled: e.target.checked })} title="Activer / désactiver" />
              <select className="qb-select" value={o.op} onChange={(e) => upd(i, { op: e.target.value })}>
                {CLEAN_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="qb-lbl">sur</span>
              <select className="qb-select" value={o.column || ''} onChange={(e) => upd(i, { column: e.target.value })}>
                <option value="">— colonne —</option>
                {(inputs[0]?.columns || []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {o.op === 'replace' && (
              <div className="qb-row indent">
                <input className="qb-input" placeholder="chercher" value={o.find || ''} onChange={(e) => upd(i, { find: e.target.value })} />
                <span className="qb-eq">→</span>
                <input className="qb-input" placeholder="remplacer" value={o.replace || ''} onChange={(e) => upd(i, { replace: e.target.value })} />
                <label className="qb-check"><input type="checkbox" checked={!!o.regex} onChange={(e) => upd(i, { regex: e.target.checked })} />regex</label>
              </div>
            )}
            {o.op === 'fillna' && (
              <div className="qb-row indent">
                <span className="qb-lbl">par</span>
                <input className="qb-input" placeholder="valeur" value={o.value || ''} onChange={(e) => upd(i, { value: e.target.value })} />
                <select className="qb-select tiny" value={o.value_type || 'text'} onChange={(e) => upd(i, { value_type: e.target.value })}>
                  <option value="text">texte</option><option value="number">nombre</option>
                </select>
              </div>
            )}
            {o.op === 'to_date' && (
              <div className="qb-row indent">
                <input className="qb-input" placeholder="format ex: %d/%m/%Y (vide = auto)" value={o.format || ''} onChange={(e) => upd(i, { format: e.target.value })} />
              </div>
            )}
            {o.op === 'round' && (
              <div className="qb-row indent">
                <span className="qb-lbl">décimales</span>
                <input className="qb-input narrow" type="number" min="0" value={o.digits ?? 0} onChange={(e) => upd(i, { digits: Number(e.target.value) })} />
              </div>
            )}
            <div className="clean-op-actions">
              <button className="mini" onClick={() => move(i, -1)} disabled={i === 0}><Icon name="up" /></button>
              <button className="mini" onClick={() => move(i, 1)} disabled={i === ops.length - 1}><Icon name="down" /></button>
              <button className="ghost danger small" onClick={() => del(i)}><Icon name="x" /></button>
            </div>
          </div>
        ))}
        {ops.length === 0 && <div className="qb-hint">Aucune opération.</div>}
      </div>
    </div>
  )
}

const CALC_EXAMPLES = [
  ['prix_ttc', '[prix_ht] * 1.2'],
  ['statut', 'IF([stock] > 0, "OK", "Rupture")'],
  ['nom_complet', '[nom] & " " & [prenom]'],
  ['categorie', 'IF([montant] >= 1000, "Grand", IF([montant] >= 100, "Moyen", "Petit"))'],
]

function CalcConfig({ node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const items = d.columns || []
  const upd = (i, patch) => set({ columns: items.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  const del = (i) => set({ columns: items.filter((_, j) => j !== i) })
  const add = () => set({ columns: [...items, { name: '', expr: '', enabled: true }] })
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const a = [...items];[a[i], a[j]] = [a[j], a[i]]; set({ columns: a })
  }
  const appendCol = (i, c) => {
    const cur = items[i].expr || ''
    upd(i, { expr: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + `[${c}]` })
  }
  return (
    <div className="insp-body">
      {inputs.length === 0 && <div className="qb-warn">Connectez une entrée puis exécutez l'amont pour charger les colonnes.</div>}
      <div className="ports-head">
        <span className="ports-title">Colonnes calculées</span>
        <InfoBubble>
          Formules façon Excel. Une formule peut réutiliser une colonne calculée plus haut ;
          si le nom existe déjà, la colonne est remplacée.<br />
          <b>Syntaxe</b> : colonne = <code>[Nom]</code> · texte = <code>"texte"</code> · concaténer = <code>&amp;</code><br />
          <b>Fonctions</b> : IF, AND, OR, NOT, CONCAT, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, LEN,
          ROUND, ABS, MOD, POWER, MIN, MAX, COALESCE, ISBLANK, YEAR, MONTH, DAY, TODAY, TEXT, VALUE
        </InfoBubble>
      </div>
      <button className="ghost small" onClick={add}>+ Colonne calculée</button>
      <div className="clean-ops">
        {items.map((o, i) => (
          <div className={`clean-op ${o.enabled === false ? 'off' : ''}`} key={i}>
            <div className="qb-row">
              <input type="checkbox" checked={o.enabled !== false} onChange={(e) => upd(i, { enabled: e.target.checked })} title="Activer / désactiver" />
              <input className="qb-input" placeholder="nom de la colonne" value={o.name || ''} onChange={(e) => upd(i, { name: e.target.value })} />
            </div>
            <div className="qb-row indent">
              <span className="qb-eq">=</span>
              <textarea className="qb-input calc-expr" rows={2} placeholder='ex : IF([stock] > 0, "OK", "Rupture")'
                value={o.expr || ''} onChange={(e) => upd(i, { expr: e.target.value })} />
            </div>
            {cols.length > 0 && (
              <div className="calc-cols">
                {cols.map((c) => (
                  <button key={c.name} className="calc-coltag" title="Insérer cette colonne" onClick={() => appendCol(i, c.name)}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div className="clean-op-actions">
              <button className="mini" onClick={() => move(i, -1)} disabled={i === 0}><Icon name="up" /></button>
              <button className="mini" onClick={() => move(i, 1)} disabled={i === items.length - 1}><Icon name="down" /></button>
              <button className="ghost danger small" onClick={() => del(i)}><Icon name="x" /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="calc-examples">
            <div className="qb-hint">Aucune colonne. Exemples :</div>
            {CALC_EXAMPLES.map(([n, e], i) => (
              <button key={i} className="calc-example" onClick={() => set({ columns: [...items, { name: n, expr: e, enabled: true }] })}>
                <b>{n}</b> = <code>{e}</code>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UnionConfig({ node, inputs, set }) {
  const d = node.data
  return (
    <div className="insp-body">
      <div className="ports-head">
        <span className="ports-title">Union (empilement)</span>
        <InfoBubble>Empile (concatène) les lignes de <b>toutes</b> les entrées reliées à l'ancre <b>in</b>. Reliez-y plusieurs blocs.</InfoBubble>
      </div>
      <div className="fld"><span>Entrées connectées : {inputs.length}</span></div>
      <label className="fld">
        <span>Alignement des colonnes</span>
        <select value={d.by_name === false ? 'pos' : 'name'} onChange={(e) => set({ by_name: e.target.value === 'name' })}>
          <option value="name">Par nom de colonne (tolère l'ordre / colonnes manquantes)</option>
          <option value="pos">Par position</option>
        </select>
      </label>
      <label className="qb-check">
        <input type="checkbox" checked={!!d.distinct} onChange={(e) => set({ distinct: e.target.checked })} />
        Supprimer les lignes en double après empilement
      </label>
    </div>
  )
}

function DedupConfig({ node, inputs, set }) {
  const d = node.data
  const cols = inputs[0]?.columns || []
  const selected = d.key_columns || []
  const toggle = (name) => {
    const next = selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name]
    set({ key_columns: next })
  }
  return (
    <div className="insp-body">
      {inputs.length === 0 && (
        <div className="qb-warn">Connectez une entrée (ancre <b>in</b>) puis exécutez le bloc amont pour charger ses colonnes.</div>
      )}

      <div className="fld">
        <div className="fld-head">
          <span>Colonnes-clés (détection des doublons)</span>
          <InfoBubble>Aucune cochée → doublon sur la <b>ligne entière</b>. Plusieurs cochées → doublon sur leur <b>combinaison</b>.</InfoBubble>
        </div>
        <div className="checklist">
          {cols.length === 0 && <div className="qb-hint">— colonnes non chargées —</div>}
          {cols.map((c) => (
            <label key={c.name} className="qb-check">
              <input type="checkbox" checked={selected.includes(c.name)} onChange={() => toggle(c.name)} />
              {c.name} <span className="coltype-inline">{c.type}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="fld">
        <span>Exemplaire à conserver</span>
        <select value={d.keep || 'first'} onChange={(e) => set({ keep: e.target.value })}>
          <option value="first">Première occurrence</option>
          <option value="last">Dernière occurrence</option>
        </select>
      </label>

      <label className="fld">
        <span>Sortie « Doublons » contient…</span>
        <select value={d.dups_mode || 'all'} onChange={(e) => set({ dups_mode: e.target.value })}>
          <option value="all">Toutes les occurrences des groupes en double</option>
          <option value="exemplar">Un exemplaire par groupe en double</option>
          <option value="extra">Seulement les occurrences en trop</option>
        </select>
      </label>

      <div className="outs-legend">
        <div><span className="odot kept" /> <b>Dédoublonné</b> — un exemplaire par groupe (flux « sans doublons »)</div>
        <div><span className="odot dups" /> <b>Doublons</b> — selon l'option ci-dessus</div>
        <div><span className="odot uniq" /> <b>Uniques</b> — lignes présentes une seule fois</div>
      </div>
    </div>
  )
}

function SourceConfig({ pid, node, files, set, onSchema }) {
  const d = node.data
  const [sheets, setSheets] = useState(null)

  const refresh = (file, sheet, headerRow) => {
    if (!file) return
    api.peek(pid, file, sheet, headerRow).then((p) => {
      if (p.sheets) setSheets(p.sheets)
      onSchema(node.id, p.columns)
    }).catch(() => {})
  }

  useEffect(() => { if (d.file) refresh(d.file, d.sheet, d.header_row || 0) }, [d.file, d.sheet, d.header_row])

  return (
    <div className="insp-body">
      <label className="fld">
        <span>Fichier source</span>
        <select value={d.file || ''} onChange={(e) => { setSheets(null); set({ file: e.target.value, sheet: '' }) }}>
          <option value="">— choisir —</option>
          {files.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
        </select>
      </label>

      {sheets && sheets.length > 0 && (
        <label className="fld">
          <span>Feuille</span>
          <select value={d.sheet || ''} onChange={(e) => set({ sheet: e.target.value })}>
            {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}

      <label className="fld">
        <span>Lignes d'en-tête à ignorer</span>
        <input type="number" min="0" value={d.header_row || 0} onChange={(e) => set({ header_row: Number(e.target.value) })} />
      </label>

      {files.length === 0 && <div className="qb-warn">Aucun fichier dans le projet. Importez un Excel/CSV depuis la page du projet.</div>}
    </div>
  )
}

function InfoBubble({ children }) {
  return (
    <span className="info-bubble" tabIndex={0}>
      <Icon name="info" size={14} />
      <span className="info-pop" role="tooltip">{children}</span>
    </span>
  )
}

function PortTag({ num, name, optional, source }) {
  const connected = !!source
  const loaded = (source?.columns || []).length > 0
  const state = !connected
    ? (optional ? 'optionnel' : 'à brancher')
    : (loaded ? source.label : 'exécuter l’amont')
  return (
    <span className={`port-tag ${connected ? 'on' : 'off'} ${optional ? 'opt' : ''}`}
      title={connected ? `Branché sur « ${source.label} »` : (optional ? 'Entrée optionnelle' : 'Aucune entrée branchée')}>
      <span className="port-tag-num">{num}</span>
      <span className="port-tag-txt">
        <span className="port-tag-name">{name}</span>
        <span className="port-tag-state">{state}</span>
      </span>
    </span>
  )
}

function SqlConfig({ node, inputs, set }) {
  const d = node.data
  const mode = d.mode || 'builder'
  const in1 = inputs.find((i) => i.alias === 'in1')
  const in2 = inputs.find((i) => i.alias === 'in2')
  return (
    <div className="insp-body">
      <div className="ports">
        <div className="ports-head">
          <span className="ports-title">Entrées</span>
          <InfoBubble>
            <b>Port 1</b> — table principale (le <code>FROM</code>, alias <code>in1</code>).<br />
            <b>Port 2</b> (<code>in2</code>) — <b>optionnel</b>, à brancher seulement pour une <b>jointure</b> avec une 2ᵉ table.<br />
            Une seule entrée suffit pour filtrer, agréger, trier…
          </InfoBubble>
        </div>
        <div className="ports-row">
          <PortTag num="1" name="principale" source={in1} />
          <PortTag num="2" name="jointure" optional source={in2} />
        </div>
      </div>
      <div className="mode-toggle">
        <button className={mode === 'builder' ? 'on' : ''} onClick={() => set({ mode: 'builder' })}>Constructeur visuel</button>
        <button className={mode === 'raw' ? 'on' : ''} onClick={() => set({ mode: 'raw' })}>SQL brut</button>
      </div>

      {mode === 'raw' ? (
        <>
          <p className="qb-hint">Utilisez les alias d'entrée comme tables : <code>in1</code>, <code>in2</code>.</p>
          <textarea className="sql-edit" rows={12} placeholder={'SELECT *\nFROM in1\nWHERE ...'}
            value={d.raw_sql || ''} onChange={(e) => set({ raw_sql: e.target.value })} />
        </>
      ) : (
        <QueryBuilder value={d.query} inputs={inputs} onChange={(q) => set({ query: q })} />
      )}
    </div>
  )
}

function ExportConfig({ node, set }) {
  const d = node.data
  return (
    <div className="insp-body">
      <label className="fld">
        <span>Nom du fichier</span>
        <input value={d.filename || ''} placeholder="resultat" onChange={(e) => set({ filename: e.target.value })} />
      </label>
      <label className="fld">
        <span>Format</span>
        <select value={d.format || 'xlsx'} onChange={(e) => set({ format: e.target.value })}>
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="csv">CSV (.csv)</option>
        </select>
      </label>
      <p className="qb-hint">Le fichier sera écrit dans le dossier <b>files/</b> du projet après exécution.</p>
    </div>
  )
}
