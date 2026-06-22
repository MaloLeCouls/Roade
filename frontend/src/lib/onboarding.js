// G.3 — mémorise que l'utilisateur a déjà vu l'onboarding.
//
// Roade est local et mono-utilisateur : `localStorage` suffit (pas de roundtrip
// backend, propre à la machine). Le flag est posé DÈS le premier affichage, donc
// l'onboarding ne s'auto-affiche qu'**une seule fois** — jamais de prompt
// récurrent au lancement (un retour explicite reste possible via « Découvrir
// Roade »). `try/catch` au cas où localStorage est indisponible (mode privé
// strict) : l'absence de persistance ne doit jamais casser l'accueil.

const KEY = 'roade:onboarded:v1'

export function hasOnboarded() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* localStorage indisponible — pas bloquant */
  }
}
