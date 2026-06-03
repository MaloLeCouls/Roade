// Shared helpers for the Validation block: positional-mask pattern builder and
// human-readable rule summaries. Used by the Inspector (config + live tester
// preview) and by ValidateNode (the "?" help bubble). Mirrors backend engine.py.

export const CLASS_RE_JS = { letter: '[A-Za-z]', upper: '[A-Z]', lower: '[a-z]', digit: '[0-9]', alnum: '[A-Za-z0-9]', any: '.' }
export const CLASS_FR = { letter: 'lettre', upper: 'majuscule', lower: 'minuscule', digit: 'chiffre', alnum: 'alphanum.' }

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

export function ruleSummary(r) {
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
