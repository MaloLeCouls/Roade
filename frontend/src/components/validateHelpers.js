// Shared helpers for the Validation / routing block: rule catalog, positional-mask
// pattern builder, condition factory and legacy-shape migration. Used by the
// Inspector, routing.jsx and ValidateNode. Mirrors backend engine.py.

export const CLASS_RE_JS = {
  letter: '[A-Za-z]',
  upper: '[A-Z]',
  lower: '[a-z]',
  digit: '[0-9]',
  alnum: '[A-Za-z0-9]',
  any: '.',
}
export const CLASS_FR = {
  letter: 'lettre',
  upper: 'majuscule',
  lower: 'minuscule',
  digit: 'chiffre',
  alnum: 'alphanum.',
}

// rule tests offered in the builders
export const VAL_TESTS = [
  ['starts_with', 'commence par'],
  ['ends_with', 'finit par'],
  ['contains', 'contient'],
  ['not_contains', 'ne contient pas'],
  ['equals', 'est égal à'],
  ['not_equals', 'est différent de'],
  ['char_class', 'le Nᵉ caractère est (type)'],
  ['char_equals', 'le Nᵉ caractère est (valeur)'],
  ['substr_equals', 'les caractères X..N = valeur'],
  ['substr_class', 'les caractères X..N sont (type)'],
  ['length_eq', 'longueur ='],
  ['length_min', 'longueur ≥'],
  ['length_max', 'longueur ≤'],
  ['is_in', 'est dans la liste'],
  ['is_empty', 'est vide'],
  ['not_empty', 'est non vide'],
  ['is_numeric', 'est numérique'],
  ['regex', 'regex (contient)'],
  ['regex_full', 'regex (complète)'],
  // numeric comparisons — work against a literal OR another column
  ['num_eq', '= (numérique)'],
  ['num_ne', '≠ (numérique)'],
  ['num_gt', '> (numérique)'],
  ['num_ge', '≥ (numérique)'],
  ['num_lt', '< (numérique)'],
  ['num_le', '≤ (numérique)'],
]
export const CHAR_CLASS = [
  ['letter', 'lettre'],
  ['upper', 'majuscule'],
  ['lower', 'minuscule'],
  ['digit', 'chiffre'],
  ['alnum', 'alphanumérique'],
]
// which extra fields a given test needs
export const needs = {
  value: [
    'starts_with',
    'ends_with',
    'contains',
    'not_contains',
    'equals',
    'not_equals',
    'char_equals',
    'substr_equals',
    'is_in',
    'regex',
    'regex_full',
  ],
  position: ['char_class', 'char_equals'],
  startlen: ['substr_equals', 'substr_class'],
  cls: ['char_class', 'substr_class'],
  number: ['length_eq', 'length_min', 'length_max'],
  numericValue: ['num_eq', 'num_ne', 'num_gt', 'num_ge', 'num_lt', 'num_le'],
}
// Tests where the right-hand side can be ANOTHER column instead of a literal —
// flips between r.value (literal) and r.column2 (column ref) via r.via.
export const VS_COLUMN_TESTS = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'num_eq',
  'num_ne',
  'num_gt',
  'num_ge',
  'num_lt',
  'num_le',
])

// Tests qui supportent le mode multi-valeur (r.values = liste). Sémantique :
// le test matche si au moins une valeur matche (« ANY-match »). Pour
// `not_contains`/`not_equals`, le backend bascule sur l'équivalent positif et
// inverse — sémantique « NONE-match ». `is_in` est exclu : c'est déjà une liste
// par construction (forme « F0, F1, FE… » dans le champ).
export const MULTI_VALUE_TESTS = new Set([
  'starts_with',
  'ends_with',
  'contains',
  'not_contains',
  'equals',
  'not_equals',
  'char_equals',
  'substr_equals',
  'regex',
  'regex_full',
])

// D.2 — la palette des sorties utilisateur est une vue (10 premières couleurs)
// de la palette catégorielle unique (`theme.js`). On re-exporte pour conserver
// l'API existante des modules qui importent `OUTPUT_COLORS` depuis ici.
export { OUTPUT_COLORS } from '../theme'
export const uid = () => 'o' + Math.random().toString(36).slice(2, 8)

// "Split by value" extractor: which part of a column value becomes the grouping key.
// 'whole' uses the cell value as-is (no extraction) — useful for short codes /
// categories. Mirrors backend engine._extract_key.
export const EXTRACTOR_TYPES = [
  ['whole', 'La valeur entière de la colonne'],
  ['after_last', 'Après le dernier séparateur'],
  ['before_first', 'Avant le premier séparateur'],
  ['segment', 'Nᵉ segment entre séparateurs'],
  ['substring', 'Sous-chaîne (position)'],
  ['regex', 'Regex (groupe capturé)'],
]
export const defaultExtractor = () => ({
  type: 'whole',
  sep: '.',
  index: 2,
  start: 1,
  length: 1,
  pattern: '',
})

// Human-readable summary of an extractor, for hints.
export function extractorSummary(ex) {
  const e = ex || {}
  switch (e.type) {
    case 'whole':
      return 'la valeur entière'
    case 'before_first':
      return `avant le premier « ${e.sep || '_'} »`
    case 'segment':
      return `${e.index || 1}ᵉ segment selon « ${e.sep || '\\'} »`
    case 'substring':
      return `caractères ${e.start || 1}${e.length ? `…${Number(e.start || 1) + Number(e.length) - 1}` : '→'}`
    case 'regex':
      return `1er groupe de ${e.pattern || '(…)'}`
    default:
      return `après le dernier « ${e.sep || '.'} »`
  }
}

// segment kinds for the positional-mask builder
export const SEG_TYPES = [
  ['literal', 'Texte exact'],
  ['letter', 'Lettres'],
  ['upper', 'Majuscules'],
  ['lower', 'Minuscules'],
  ['digit', 'Chiffres'],
  ['alnum', 'Alphanumérique'],
  ['set', 'Jeu de caractères'],
  ['any', "N'importe"],
]

// a fresh named condition object (rules DNF, positional mask, *or* group check)
export function makeCondition(patch = {}) {
  return {
    id: 'c' + uid(),
    name: 'Condition',
    kind: 'rules',
    column: '',
    groups: [],
    segments: [],
    group_by: [],
    check: 'unique',
    n: '',
    value: '',
    test_samples: '',
    ...patch,
  }
}

function rulesToGroups(rules, combine) {
  if (!rules || !rules.length) return []
  return combine === 'any' ? rules.map((r) => ({ rules: [r] })) : [{ rules }] // OU → un groupe par règle ; ET → un seul groupe
}

// Normalize any historical validate-block shape to the unified conditions/outputs
// model. Idempotent. Output handles are preserved (valid/invalid for the
// conformity preset, existing ids for routers) so connected edges never break.
export function normalizeValidateData(data) {
  const d = { ...(data || {}) }
  if (d.mode === 'route' && Array.isArray(d.conditions)) return d // already the new model
  if (d.mode === 'route') {
    // route with inline conditions
    const conditions = []
    const outputs = (d.outputs || []).map((o, i) => {
      const cid = 'c' + (o.id || uid())
      conditions.push({
        id: cid,
        name: o.label || `Condition ${i + 1}`,
        kind: 'rules',
        column: '',
        groups: o.condition?.groups || [],
        segments: [],
        test_samples: '',
      })
      return {
        id: o.id,
        label: o.label,
        color: o.color,
        match: { conditionId: cid, negate: false },
      }
    })
    return { ...d, intent: d.intent || 'router', conditions, outputs }
  }
  // legacy conformity (mode 'rules' | 'mask') → control preset; handles stay valid/invalid
  const kind = d.mode === 'mask' ? 'mask' : 'rules'
  const cond = makeCondition({
    name: 'Conforme',
    kind,
    column: d.target_column || '',
    groups: kind === 'rules' ? rulesToGroups(d.rules || [], d.combine || 'all') : [],
    segments: kind === 'mask' ? d.segments || [] : [],
    test_samples: d.test_samples || '',
  })
  return {
    ...d,
    mode: 'route',
    intent: 'control',
    target_column: d.target_column || '',
    case_sensitive: !!d.case_sensitive,
    routing: 'first',
    conditions: [cond],
    outputs: [
      {
        id: 'valid',
        label: 'Conformes',
        color: '#59A14F',
        match: { conditionId: cond.id, negate: false },
      },
      {
        id: 'invalid',
        label: 'Non conformes',
        color: '#E15759',
        match: { conditionId: cond.id, negate: true },
      },
    ],
    else_enabled: false,
    else_label: d.else_label || 'Non classé',
    else_color: d.else_color || '#9aa3b2',
    add_flag: !!d.add_flag,
  }
}

// ---- Préréglage Contrôler / Router (intent) -------------------------------- //
// « Contrôler » = un aiguillage à 2 sorties Conformes / Non conformes sur la 1re
// condition. « Router » = autant de sorties que voulu. Bascule SANS PERTE : les
// sorties d'un routeur sont planquées dans `router_stash` et restaurées au
// retour — changer d'avis ne supprime jamais une sortie déjà créée.

export function controlOutputs(condId) {
  return [
    {
      id: 'valid',
      label: 'Conformes',
      color: '#59A14F',
      match: { conditionId: condId, negate: false },
    },
    {
      id: 'invalid',
      label: 'Non conformes',
      color: '#E15759',
      match: { conditionId: condId, negate: true },
    },
  ]
}

function isControlShaped(d, condId) {
  const o = d.outputs || []
  return (
    o.length === 2 &&
    o[0]?.id === 'valid' &&
    o[1]?.id === 'invalid' &&
    o.every((x) => x.match?.conditionId === condId) &&
    d.else_enabled === false
  )
}

// Déduit l'intention quand le champ n'est pas posé (blocs existants) : on infère
// « contrôle » seulement si la forme y ressemble (≤ 2 sorties valid/invalid,
// ≤ 1 condition), sinon « router » — pour ne jamais masquer les sorties d'un
// routeur existant.
export function inferIntent(d) {
  if (d.intent === 'control' || d.intent === 'router') return d.intent
  const o = d.outputs || []
  const conds = d.conditions || []
  const looksControl =
    o.length <= 2 && o.every((x) => x.id === 'valid' || x.id === 'invalid') && conds.length <= 1
  return looksControl ? 'control' : 'router'
}

// Patch à appliquer pour basculer l'intention (à passer à `set`/`onChange`).
export function intentPatch(d, intent) {
  const conditions = d.conditions || []
  if (intent === 'control') {
    const cond0 = conditions[0] || makeCondition({ name: 'Conforme' })
    const patch = {
      intent: 'control',
      conditions: conditions.length ? conditions : [cond0],
      outputs: controlOutputs(cond0.id),
      else_enabled: false,
    }
    // Planque les sorties courantes si ce n'était pas déjà un contrôle.
    if (!isControlShaped(d, cond0.id) && (d.outputs || []).length) {
      patch.router_stash = { outputs: d.outputs, else_enabled: d.else_enabled }
    }
    return patch
  }
  // Router : restaure le stash s'il existe, sinon garde les sorties courantes.
  if (d.router_stash) {
    return {
      intent: 'router',
      outputs: d.router_stash.outputs || d.outputs || [],
      else_enabled: d.router_stash.else_enabled,
      router_stash: null,
    }
  }
  return { intent: 'router' }
}

export function escapeRe(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Live, client-side reconstruction of the positional-mask regex (mirror of
// backend _mask_pattern) so the user sees the pattern instantly.
export function buildMaskPattern(segs, caseSensitive) {
  const parts = []
  for (const seg of segs || []) {
    const t = seg.type || 'any'
    if (t === 'literal') {
      parts.push(escapeRe(seg.value || ''))
      continue
    }
    const base = t === 'set' ? `[${escapeRe(seg.value || '')}]` : CLASS_RE_JS[t] || '.'
    const ln = seg.length,
      lo = seg.min,
      hi = seg.max
    let quant
    if (ln !== undefined && ln !== '' && ln !== null) quant = `{${Number(ln)}}`
    else if (
      (lo !== undefined && lo !== '' && lo !== null) ||
      (hi !== undefined && hi !== '' && hi !== null)
    )
      quant = `{${lo !== '' && lo != null ? Number(lo) : 0},${hi !== '' && hi != null ? Number(hi) : ''}}`
    else quant = '{1}'
    parts.push(base + quant)
  }
  if (!parts.length) return ''
  return (caseSensitive ? '' : '(?i)') + parts.join('')
}

// A negated rule reads as its positive twin when it has one, so the UI never
// shows a double negative ("NON ne contient pas" -> "contient").
const RULE_OPPOSITE = {
  contains: 'not_contains',
  not_contains: 'contains',
  equals: 'not_equals',
  not_equals: 'equals',
  is_empty: 'not_empty',
  not_empty: 'is_empty',
}

export function ruleSummary(r) {
  const v = r.value ?? ''
  const cls = CLASS_FR[r.charclass] || r.charclass || ''
  const end = Number(r.start || 1) + Number(r.length || 1) - 1
  const col = r.column ? `[${r.column}] ` : ''
  let test = r.test
  let neg = r.negate ? 'NON ' : ''
  if (r.negate && RULE_OPPOSITE[test]) {
    test = RULE_OPPOSITE[test]
    neg = ''
  }
  let body
  switch (test) {
    case 'starts_with':
      body = `commence par « ${v} »`
      break
    case 'ends_with':
      body = `finit par « ${v} »`
      break
    case 'contains':
      body = `contient « ${v} »`
      break
    case 'not_contains':
      body = `ne contient pas « ${v} »`
      break
    case 'equals':
      body = `= « ${v} »`
      break
    case 'not_equals':
      body = `≠ « ${v} »`
      break
    case 'regex':
      body = `regex (contient) ${v}`
      break
    case 'regex_full':
      body = `regex (complète) ${v}`
      break
    case 'length_eq':
      body = `longueur = ${v}`
      break
    case 'length_min':
      body = `longueur ≥ ${v}`
      break
    case 'length_max':
      body = `longueur ≤ ${v}`
      break
    case 'char_class':
      body = `caractère ${r.position || 1} = ${cls}`
      break
    case 'char_equals':
      body = `caractère ${r.position || 1} = « ${v} »`
      break
    case 'substr_equals':
      body = `caractères ${r.start || 1}…${end} = « ${v} »`
      break
    case 'substr_class':
      body = `caractères ${r.start || 1}…${end} = ${cls}`
      break
    case 'is_in':
      body = `dans la liste : ${v}`
      break
    case 'is_empty':
      body = 'est vide'
      break
    case 'not_empty':
      body = 'est non vide'
      break
    case 'is_numeric':
      body = 'est numérique'
      break
    default:
      body = r.test || '?'
  }
  return `${neg}${col}${body}`
}
