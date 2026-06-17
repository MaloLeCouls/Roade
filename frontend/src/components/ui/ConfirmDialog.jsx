// ConfirmDialog + useConfirm — E.4.
//
// Remplace les `window.confirm(...)` natifs (3 occurrences : suppression de
// projet, fichier, workflow). Le natif est moche, hors charte, et un
// `Entrée` par mégarde supprime — alors qu'un dialog Roade peut :
//  - laisser focus sur le bouton « Annuler » par défaut (anti-mégarde)
//  - styler le bouton destructif en danger
//  - se fermer proprement à l'Escape (Modal D.5 gère déjà)
//  - rester piégé en focus tant qu'il est ouvert
//
// API : `const [ask, dialogNode] = useConfirm()` ; on `await ask({...})`
// pour une promise booléenne. Le `dialogNode` doit être inséré dans l'arbre.

import { useCallback, useEffect, useRef, useState } from 'react'

import Button from './Button'
import Modal from './Modal'

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
  onCancel,
}) {
  // Focus initial sur le bouton "Annuler" (anti-mégarde), pas sur le bouton
  // destructif. Le focus trap de <Modal> fera le reste.
  const cancelRef = useRef(null)
  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  return (
    <Modal open={open} onClose={onCancel} size="sm" title={title}>
      {message && <p className="confirm-msg">{message}</p>}
      <div className="confirm-actions">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function useConfirm() {
  const [state, setState] = useState(null)

  const ask = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve })
      }),
    [],
  )

  const close = (answer) => {
    state?.resolve?.(answer)
    setState(null)
  }

  const dialogNode = state ? (
    <ConfirmDialog
      open
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null

  return [ask, dialogNode]
}

export default ConfirmDialog
