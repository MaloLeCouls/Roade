import { useEffect, useState } from 'react'

import { notify, subscribeToasts } from '../toast'

const AUTO_DISMISS_MS = 5000

export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    return subscribeToasts((item) => {
      setItems((arr) => [...arr, item])
      setTimeout(() => {
        setItems((arr) => arr.filter((i) => i.id !== item.id))
      }, AUTO_DISMISS_MS)
    })
  }, [])

  // C.4 — filet de sécurité : toute promesse rejetée sans `.catch` (au lieu de
  // se perdre dans la console) remonte comme toast. Couvre les anciennes
  // `api.deleteProject(...)` / `api.uploadFile(...)` qu'on ne va pas tous
  // wrapper à la main.
  useEffect(() => {
    const onUnhandled = (e) => {
      const msg = e.reason?.message || e.reason || 'Erreur réseau'
      notify(msg, 'error')
      e.preventDefault()
    }
    window.addEventListener('unhandledrejection', onUnhandled)
    return () => window.removeEventListener('unhandledrejection', onUnhandled)
  }, [])

  const dismiss = (id) => setItems((arr) => arr.filter((i) => i.id !== id))

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((i) => (
        <div
          key={i.id}
          className={`toast toast-${i.level}`}
          onClick={() => dismiss(i.id)}
          title="Cliquer pour fermer"
        >
          {i.message}
        </div>
      ))}
    </div>
  )
}
