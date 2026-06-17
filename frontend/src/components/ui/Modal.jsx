// Primitive Modal — D.5.
//
// Avant : 4 modales (BlockEditor, DataPreview, WorkflowFlow, FlowMapModal)
// chacune son propre overlay, son propre z-index littéral, son propre traitement
// de l'Escape. Aucune ne piégeait le focus. `Tab` te sortait du dialog vers
// la page derrière (audit 05 #6/#15).
//
// Cette primitive corrige les trois points : Escape ferme, focus trap actif
// tant que la modale est ouverte, attributs ARIA conformes, z-index tokenisé.

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, title, onClose, size = 'md', children }) {
  const overlayRef = useRef(null)
  const lastFocused = useRef(null)

  useEffect(() => {
    if (!open) return
    lastFocused.current = document.activeElement

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap : Tab boucle entre les focusables de la modale.
      const root = overlayRef.current
      if (!root) return
      const focusables = root.querySelectorAll(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)

    // Focus initial : le 1er focusable de la modale.
    const first = overlayRef.current?.querySelector(FOCUSABLE_SELECTOR)
    first?.focus()

    return () => {
      document.removeEventListener('keydown', onKey, true)
      // Rendre le focus à l'élément qui l'avait — bonne pratique a11y.
      lastFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const onOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose?.()
  }

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={onOverlayClick} role="presentation">
      <div
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        {title && (
          <header className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button type="button" className="modal-close" aria-label="Fermer" onClick={onClose}>
              ×
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
