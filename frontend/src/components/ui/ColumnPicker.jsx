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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import Icon from '../Icon'

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

// Exporté pour les pickers de colonne « maison » (chips du bloc Doublons, etc.)
// qui doivent afficher le même libellé de type que la primitive (D.2 — une
// seule façon de nommer un type de colonne).
export function shortType(t) {
  if (!t) return ''
  return TYPE_SHORT[String(t).toUpperCase()] || String(t).toLowerCase()
}

// Catégorie pour la couleur du badge (texte / nombre / date / booléen / autre).
function typeKind(t) {
  const s = shortType(t)
  if (s === 'nombre') return 'num'
  if (s === 'date') return 'date'
  if (s === 'booléen') return 'bool'
  if (s === 'texte') return 'text'
  return 'other'
}

// Badge de type VISUELLEMENT distinct du nom de colonne (une étiquette colorée,
// pas un « · texte » fondu dans le nom — qui était ambigu si le nom contient
// un « · »). Affiché côté nom dans le sélecteur et dans la liste.
export function TypeBadge({ type }) {
  if (!type) return null
  return <span className={`typebadge tb-${typeKind(type)}`}>{shortType(type)}</span>
}

// Sélecteur de colonne mono — menu déroulant MAISON (pas un <select> natif, qui
// ne permet pas de styliser le type). Rendu en portal sur <body> pour ne jamais
// être rogné par l'inspecteur scrollable. Filtre au-delà de 7 colonnes.
function ColumnSelect({ items, value, onChange, placeholder, compact }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const [pos, setPos] = useState(null)
  const selected = items.find((c) => c.name === value)

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const openUp = below < 220 && r.top > below
    setPos({
      left: r.left,
      width: Math.max(r.width, 190),
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.min(300, (openUp ? r.top : below) - 12),
    })
  }
  useLayoutEffect(() => {
    if (open) place()
  }, [open])
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e) => e.key === 'Escape' && close()
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      close()
    }
    // Sur scroll/resize la position devient obsolète → on ferme (simple et sûr).
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(
    () => (query ? items.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())) : items),
    [items, query],
  )
  const pick = (name) => {
    onChange?.(name)
    setOpen(false)
    setQuery('')
  }
  const onListKey = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const opts = [...(popRef.current?.querySelectorAll('.colsel-opt') || [])]
    const i = opts.indexOf(document.activeElement)
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1
    opts[(next + opts.length) % opts.length]?.focus()
  }

  return (
    <div className={classList('colsel', compact && 'colsel-compact')}>
      <button
        ref={btnRef}
        type="button"
        className="colsel-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="colsel-current">
          {selected ? (
            <>
              <span className="colsel-name">{selected.name}</span>
              <TypeBadge type={selected.type} />
            </>
          ) : (
            <span className="colsel-ph">{placeholder}</span>
          )}
        </span>
        <span className="colsel-chev" aria-hidden="true">
          <Icon name="down" size={11} />
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="colsel-pop"
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            {items.length > 7 && (
              <input
                className="colsel-search"
                autoFocus
                placeholder="filtrer…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            <div className="colsel-list">
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={classList('colsel-opt', !value && 'on')}
                onClick={() => pick('')}
              >
                <span className="colsel-ph">{placeholder}</span>
              </button>
              {filtered.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="option"
                  aria-selected={c.name === value}
                  className={classList('colsel-opt', c.name === value && 'on')}
                  onClick={() => pick(c.name)}
                >
                  <span className="colsel-name">{c.name}</span>
                  <TypeBadge type={c.type} />
                </button>
              ))}
              {filtered.length === 0 && <div className="colsel-empty">aucune colonne</div>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
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
 * @param {boolean} [props.compact=false]  - rendu inline (pas de <label> qui
 *   wraperait : utilise `qb-select`, hérite de la largeur du parent). À utiliser
 *   dans les rangées `qb-row` (Calc / Clean / Filter) où la primitive doit
 *   tenir entre d'autres contrôles.
 */
export default function ColumnPicker({
  columns = [],
  value,
  onChange,
  multi = false,
  label,
  placeholder = '— choisir —',
  emptyMessage = 'Aucune colonne disponible',
  compact = false,
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
    if (compact) {
      // Dans une rangée, on doit rester un <select> pour ne pas casser le
      // flex layout. Disabled + placeholder explicite suffit.
      return (
        <select className="qb-select" disabled value="">
          <option value="">{emptyMessage}</option>
        </select>
      )
    }
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
                  <TypeBadge type={c.type} />
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // mono — menu déroulant maison avec badge de type. `compact` = inline (rangées
  // `.rrow`/`.qb-row`) ; sinon version étiquetée dans un `.fld`.
  if (compact) {
    return (
      <ColumnSelect
        items={items}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        compact
      />
    )
  }
  return (
    <div className="colpick colpick-mono fld">
      {label && <span className="fld-label">{label}</span>}
      <ColumnSelect items={items} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  )
}
