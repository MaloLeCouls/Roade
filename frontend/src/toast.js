// Mini-bus de notifications (toasts). Pas de lib externe : un Set d'observateurs
// suffit, et on évite d'imposer un Context React (qui forcerait à wrapper toute
// l'app et à passer le hook même là où on appelle juste `api.X().catch(...)`).
//
// Cf. C.4 : avant, plusieurs actions (suppressions, upload) lançaient un
// `api.X()` *sans* `.catch`, donc un backend coupé échouait silencieusement.
// `<Toaster />` (monté dans App) écoute aussi `unhandledrejection` pour
// remonter automatiquement TOUTE promesse rejetée sans handler.

const listeners = new Set()
let nextId = 1

export function notify(message, level = 'error') {
  const item = { id: nextId++, message: String(message || 'Erreur inconnue'), level }
  for (const l of listeners) l(item)
  return item.id
}

export function subscribeToasts(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
