// ConnectDialog — alternative clavier au drag de connexion (E.7 passe 3).
//
// React Flow ne propose pas de chemin clavier pour créer un lien : il faut
// glisser la souris d'un port à l'autre. Ce dialog ouvre la même action via
// trois selects (port source / bloc cible / port cible). Ctrl+L sur un bloc
// sélectionné l'ouvre ; il est aussi accessible depuis le clic-droit du nœud
// et depuis la palette Ctrl+K.

import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'

export default function ConnectDialog({
  open,
  sourceId,
  nodes,
  outputsFor,
  inputsFor,
  edges,
  onConfirm,
  onClose,
}) {
  const sourceNode = nodes.find((n) => n.id === sourceId)
  const outputs = useMemo(
    () => (sourceNode ? outputsFor(sourceNode) : []),
    [sourceNode, outputsFor],
  )

  // Cibles candidates = tout bloc différent du source qui a au moins une entrée.
  // Frame et Source n'en ont pas — ils sortent naturellement de la liste.
  const targets = useMemo(
    () => nodes.filter((n) => n.id !== sourceId && inputsFor(n).length > 0),
    [nodes, sourceId, inputsFor],
  )

  const [sourceHandle, setSourceHandle] = useState('')
  const [targetId, setTargetId] = useState('')
  const [targetHandle, setTargetHandle] = useState('')

  useEffect(() => {
    if (!open) return
    setSourceHandle(outputs[0]?.handle || '')
    setTargetId(targets[0]?.id || '')
  }, [open, outputs, targets])

  const targetNode = targets.find((n) => n.id === targetId)
  const targetInputs = useMemo(
    () => (targetNode ? inputsFor(targetNode) : []),
    [targetNode, inputsFor],
  )

  useEffect(() => {
    setTargetHandle(targetInputs[0]?.handle || '')
  }, [targetId, targetInputs])

  if (!open || !sourceNode) return null

  const isUnion = targetNode?.type === 'union'
  const willReplace =
    !isUnion &&
    edges?.some((e) => e.target === targetId && e.targetHandle === targetHandle)

  const canConnect = sourceHandle && targetId && targetHandle

  const submit = (e) => {
    e?.preventDefault?.()
    if (!canConnect) return
    onConfirm({
      source: sourceId,
      sourceHandle,
      target: targetId,
      targetHandle,
    })
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Connecter ce bloc à…">
      <form className="connect-form" onSubmit={submit}>
        <p className="connect-from">
          Depuis : <b>{labelOf(sourceNode)}</b>
          {outputs.length === 1 && outputs[0].label && (
            <span className="connect-hint"> · {outputs[0].label}</span>
          )}
        </p>

        {outputs.length > 1 && (
          <label className="connect-row">
            <span>Port de sortie</span>
            <select
              value={sourceHandle}
              onChange={(e) => setSourceHandle(e.target.value)}
            >
              {outputs.map((o) => (
                <option key={o.handle} value={o.handle}>
                  {o.label || o.handle}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="connect-row">
          <span>Bloc cible</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={targets.length === 0}
          >
            {targets.length === 0 ? (
              <option value="">Aucun bloc cible disponible</option>
            ) : (
              targets.map((n) => (
                <option key={n.id} value={n.id}>
                  {labelOf(n)} — {n.type}
                </option>
              ))
            )}
          </select>
        </label>

        {targetInputs.length > 1 && (
          <label className="connect-row">
            <span>Port d'entrée</span>
            <select
              value={targetHandle}
              onChange={(e) => setTargetHandle(e.target.value)}
            >
              {targetInputs.map((i) => (
                <option key={i.handle} value={i.handle}>
                  {i.label || i.handle}
                </option>
              ))}
            </select>
          </label>
        )}

        {willReplace && (
          <p className="connect-warn" role="status">
            Ce port reçoit déjà un lien : il sera remplacé.
          </p>
        )}

        <div className="connect-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="primary" disabled={!canConnect}>
            Connecter
          </button>
        </div>
      </form>
    </Modal>
  )
}

function labelOf(node) {
  return node.data?.label || node.type
}
