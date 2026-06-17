// Palette de commandes (Ctrl+K) — E.6.
//
// Liste filtrable d'actions du workflow + raccourcis. Anti-slop : pas une lib
// (kbar, cmdk, …), juste un input + une liste filtrée. ↑↓ pour naviguer,
// Entrée pour valider, Escape ferme.

import { useEffect, useMemo, useRef, useState } from 'react'

import Modal from './Modal'

export default function CommandPalette({ open, onClose, commands = [] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus immédiat sur le champ (Modal piège déjà le focus dans le dialog).
      const id = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(id)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => {
      const hay = `${c.label} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [commands, query])

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)))
  }, [filtered])

  const run = (i) => {
    const cmd = filtered[i]
    if (!cmd) return
    onClose()
    // setTimeout → le focus restitué par Modal a le temps de finir avant
    // que la commande déclenche d'éventuels nouveaux modaux.
    setTimeout(() => cmd.action(), 0)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(active)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Palette de commandes">
      <input
        ref={inputRef}
        className="fld-input cmd-input"
        placeholder="Tapez pour filtrer… (ex. exécuter, source)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Filtrer les commandes"
      />
      {filtered.length === 0 ? (
        <p className="muted cmd-empty">Aucune commande ne correspond.</p>
      ) : (
        <ul className="cmd-list" role="listbox">
          {filtered.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={`cmd-item${i === active ? ' cmd-item-on' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              <span className="cmd-label">{c.label}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
              {c.shortcut && <kbd className="cmd-kbd">{c.shortcut}</kbd>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
