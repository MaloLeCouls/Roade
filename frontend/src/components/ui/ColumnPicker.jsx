// ColumnPicker — D.7.
//
// Unifie les trois façons de choisir une colonne qui coexistaient :
//   - `ColSelect` (mono-colonne) : affichait le NOM mais PAS LE TYPE → on
//     comparait des dates à des strings sans le savoir (cf. Filtre, audit 03)
//   - `ColChecklist` (multi-colonne) : affichait le type, plus complet
//   - 5 `<select>` nus directement dans l'Inspector (pivot, validate, etc.)
//
// Cette primitive affiche TOUJOURS le type, mono ou multi, parce qu'un picker
// de colonne dans un outil de données qui n'affiche pas le type est ce qui
// produit le bug "j'ai filtré sur une string parce que je croyais que c'était
// un nombre" — exactement la sensation "plausible-mais-faux" qu'on combat.

import { useMemo } from 'react'

function classList(...parts) {
  return parts.filter(Boolean).join(' ')
}

// Mappe les labels DuckDB en suffixe court FR pour économiser l'espace.
const TYPE_SHORT = {
  BIGINT: 'nombre',
  INTEGER: 'nombre',
  DOUBLE: 'nombre',
  DECIMAL: 'nombre',
  FLOAT: 'nombre',
  BOOLEAN: 'booléen',
  DATE: 'date',
  TIMESTAMP: 'date',
  VARCHAR: 'texte',
  TEXT: 'texte',
}

function shortType(t) {
  if (!t) return ''
  return TYPE_SHORT[String(t).toUpperCase()] || String(t).toLowerCase()
}

/**
 * @param {object} props
 * @param {{name:string,type?:string}[]} props.columns  - {name, type} sortis du backend
 * @param {string | string[]} props.value
 * @param {(v:string|string[]) => void} props.onChange
 * @param {boolean} [props.multi=false]
 * @param {string} [props.label]
 * @param {string} [props.placeholder='— choisir —']
 * @param {string} [props.emptyMessage='Aucune colonne disponible']
 */
export default function ColumnPicker({
  columns = [],
  value,
  onChange,
  multi = false,
  label,
  placeholder = '— choisir —',
  emptyMessage = 'Aucune colonne disponible',
}) {
  const items = useMemo(
    () =>
      (columns || []).map((c) => ({
        name: c?.name ?? String(c),
        type: c?.type || '',
      })),
    [columns],
  )

  if (items.length === 0) {
    return (
      <div className="colpick colpick-empty">
        {label && <span className="fld-label">{label}</span>}
        <span className="muted">{emptyMessage}</span>
      </div>
    )
  }

  if (multi) {
    const set = new Set(Array.isArray(value) ? value : [])
    const toggle = (name) => {
      const next = new Set(set)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      onChange?.(Array.from(next))
    }
    return (
      <div className="colpick colpick-multi">
        {label && <span className="fld-label">{label}</span>}
        <ul className="colpick-list" role="listbox" aria-multiselectable="true">
          {items.map((c) => {
            const checked = set.has(c.name)
            return (
              <li
                key={c.name}
                role="option"
                aria-selected={checked}
                className={classList('colpick-item', checked && 'colpick-item-on')}
              >
                <label className="colpick-row">
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.name)} />
                  <span className="colpick-name">{c.name}</span>
                  {c.type && <span className="colpick-type">{shortType(c.type)}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // mono
  return (
    <label className="colpick colpick-mono fld">
      {label && <span className="fld-label">{label}</span>}
      <select
        className="fld-select"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {items.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
            {c.type ? ` · ${shortType(c.type)}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
