// Shared helpers for the Validation / routing block: rule catalog, positional-mask
// pattern builder, condition factory and legacy-shape migration. Used by the
// Inspector, routing.jsx and ValidateNode. Mirrors backend engine.py.

export const CLASS_RE_JS = { letter: '[A-Za-z]', upper: '[A-Z]', lower: '[a-z]', digit: '[0-9]', alnum: '[A-Za-z0-9]', any: '.' }
export const CLASS_FR = { letter: 'lettre', upper: 'majuscule', lower: 'minuscule', digit: 'chiffre', alnum: 'alphanum.' }

// rule tests offered in the builders
export const VAL_TESTS = [
  ['starts_with', 'commence par'], ['ends_with', 'finit par'], ['contains', 'contient'],
  ['not_contains', 'ne contient pas'], ['equals', 'est égal à'], ['not_equals', 'est différent de'],
  ['char_class', 'le Nᵉ caractère est (type)'], ['char_equals', 'le Nᵉ caractère est (valeur)'],
  ['substr_equals', 'les caractères X..N = valeur'], ['substr_class', 'les caractères X..N sont (type)'],
  ['length_eq', 'longueur ='], ['length_min', 'longueur ≥'], ['length_max', 'longueur ≤'],
  ['is_in', 'est dans la liste'], ['is_empty', 'est vide'], ['not_empty', 'est non vide'],
  ['is_numeric', 'est numérique'], ['regex', 'regex (contient)'], ['regex_full', 'regex (complète)'],
]
export const CHAR_CLASS = [['letter', 'lettre'], ['upper', 'majuscule'], ['lower', 'minuscule'], ['digit', 'chiffre'], ['alnum', 'alphanumérique']]
// which extra fields a given test needs
export const needs = {
  value: ['starts_with', 'ends_with', 'contains', 'not_contains', 'equals', 'not_equals', 'char_equals', 'substr_equals', 'is_in', 'regex', 'regex_full'],
  position: ['char_class', 'char_equals'],
  startlen: ['substr_equals', 'substr_class'],
  cls: ['char_class', 'substr_class'],
  number: ['length_eq', 'length_min', 'length_max'],
}

// palette for user-defined outputs + a short id generator
export const OUTPUT_COLORS = ['#4E79A7', '#59A14F', '#E15759', '#F28E2B', '#B07AA1', '#76B7B2', '#EDC948', '#9C755F', '#FF9DA7', '#86BCB6']
export const uid = () => 'o' + Math.random().toString(36).slice(2, 8)

// segment kinds for the positional-mask builder
export const SEG_TYPES = [
  ['literal', 'Texte exact'], ['letter', 'Lettres'], ['upper', 'Majuscules'], ['lower', 'Minuscules'],
  ['digit', 'Chiffres'], ['alnum', 'Alphanumérique'], ['set', 'Jeu de caractères'], ['any', "N'importe"],
]

// a fresh named condition object (rules DNF, positional mask, *or* group check)
export function makeCondition(patch = {}) {
  return { id: 'c' + uid(), name: 'Condition', kind: 'rules', column: '', groups: [], segments: [], group_by: [], check: 'unique', n: '', value: '', test_samples: '', ...patch }
}

function rulesToGroups(rules, combine) {
  if (!rules || !rules.length) return []
  return combine === 'any' ? rules.map((r) => ({ rules: [r] })) : [{ rules }]   // OU → un groupe par règle ; ET → un seul groupe
}

// Normalize any historical validate-block shape to the unified conditions/outputs
// model. Idempotent. Output handles are preserved (valid/invalid for the
// conformity preset, existing ids for routers) so connected edges never break.
export function normalizeValidateData(data) {
  const d = { ...(data || {}) }
  if (d.mode === 'route' && Array.isArray(d.conditions)) return d            // already the new model
  if (d.mode === 'route') {                                                  // route with inline conditions
    const conditions = []
    const outputs = (d.outputs || []).map((o, i) => {
      const cid = 'c' + (o.id || uid())
      conditions.push({ id: cid, name: o.label || `Condition ${i + 1}`, kind: 'rules', column: '', groups: o.condition?.groups || [], segments: [], test_samples: '' })
      return { id: o.id, label: o.label, color: o.color, match: { conditionId: cid, negate: false } }
    })
    return { ...d, intent: d.intent || 'router', conditions, outputs }
  }
  // legacy conformity (mode 'rules' | 'mask') → control preset; handles stay valid/invalid
  const kind = d.mode === 'mask' ? 'mask' : 'rules'
  const cond = makeCondition({
    name: 'Conforme', kind, column: d.target_column || '',
    groups: kind === 'rules' ? rulesToGroups(d.rules || [], d.combine || 'all') : [],
    segments: kind === 'mask' ? (d.segments || []) : [],
    test_samples: d.test_samples || '',
  })
  return {
    ...d, mode: 'route', intent: 'control',
    target_column: d.target_column || '', case_sensitive: !!d.case_sensitive, routing: 'first',
    conditions: [cond],
    outputs: [
      { id: 'valid', label: 'Conformes', color: '#59A14F', match: { conditionId: cond.id, negate: false } },
      { id: 'invalid', label: 'Non conformes', color: '#E15759', match: { conditionId: cond.id, negate: true } },
    ],
    else_enabled: false, else_label: d.else_label || 'Non classé', else_color: d.else_color || '#9aa3b2',
    add_flag: !!d.add_flag, add_reason: d.add_reason !== false,
  }
}

export function escapeRe(s) { return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// Live, client-side reconstruction of the positional-mask regex (mirror of
// backend _mask_pattern) so the user sees the pattern instantly.
export function buildMaskPattern(segs, caseSensitive) {
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

// A negated rule reads as its positive twin when it has one, so the UI never
// shows a double negative ("NON ne contient pas" -> "contient").
const RULE_OPPOSITE = {
  contains: 'not_contains', not_contains: 'contains', equals: 'not_equals',
  not_equals: 'equals', is_empty: 'not_empty', not_empty: 'is_empty',
}

export function ruleSummary(r) {
  const v = r.value ?? ''
  const cls = CLASS_FR[r.charclass] || r.charclass || ''
  const end = Number(r.start || 1) + Number(r.length || 1) - 1
  const col = r.column ? `[${r.column}] ` : ''
  let test = r.test
  let neg = r.negate ? 'NON ' : ''
  if (r.negate && RULE_OPPOSITE[test]) { test = RULE_OPPOSITE[test]; neg = '' }
  let body
  switch (test) {
    case 'starts_with': body = `commence par « ${v} »`; break
    case 'ends_with': body = `finit par « ${v} »`; break
    case 'contains': body = `contient « ${v} »`; break
    case 'not_contains': body = `ne contient pas « ${v} »`; break
    case 'equals': body = `= « ${v} »`; break
    case 'not_equals': body = `≠ « ${v} »`; break
    case 'regex': body = `regex (contient) ${v}`; break
    case 'regex_full': body = `regex (complète) ${v}`; break
    case 'length_eq': body = `longueur = ${v}`; break
    case 'length_min': body = `longueur ≥ ${v}`; break
    case 'length_max': body = `longueur ≤ ${v}`; break
    case 'char_class': body = `caractère ${r.position || 1} = ${cls}`; break
    case 'char_equals': body = `caractère ${r.position || 1} = « ${v} »`; break
    case 'substr_equals': body = `caractères ${r.start || 1}…${end} = « ${v} »`; break
    case 'substr_class': body = `caractères ${r.start || 1}…${end} = ${cls}`; break
    case 'is_in': body = `dans la liste : ${v}`; break
    case 'is_empty': body = 'est vide'; break
    case 'not_empty': body = 'est non vide'; break
    case 'is_numeric': body = 'est numérique'; break
    default: body = r.test || '?'
  }
  return `${neg}${col}${body}`
}
