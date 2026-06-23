// Modèle de coût par type de bloc, pour estimer le temps d'exécution (ETA).
//
// `overhead` = coût fixe (ms) ; `perK` = ms par millier de lignes traitées.
// Les valeurs de départ (BASELINE) sont CALIBRÉES sur un run réel (cf. le script
// de calibration : Source/Union/Export mesurés à plusieurs volumes). Ensuite,
// chaque run affine le modèle tout seul : on apprend des durées réelles par une
// moyenne mobile (EMA), stockée dans localStorage — l'ETA colle donc à la
// machine de l'utilisateur, sans réglage manuel.
//
// SQL est volontairement approximatif (une jointure peut être quadratique) : on
// donne une estimation de départ, l'apprentissage par bloc fait le reste.

const BASELINE = {
  source: { overhead: 150, perK: 72 }, // lecture xlsx — mesuré ~72 ms/1k
  sql: { overhead: 80, perK: 12 }, // très variable (jointures) — approximation
  dedup: { overhead: 60, perK: 4 },
  union: { overhead: 60, perK: 3 }, // mesuré ~1,7 ms/1k
  cols: { overhead: 50, perK: 3 },
  report: { overhead: 50, perK: 3 },
  filter: { overhead: 60, perK: 6 },
  clean: { overhead: 60, perK: 8 },
  calc: { overhead: 60, perK: 8 },
  validate: { overhead: 60, perK: 20 }, // regex / masque ligne à ligne
  pivot: { overhead: 80, perK: 12 },
  export_xlsx: { overhead: 60, perK: 122 }, // mesuré ~122 ms/1k — le plus lourd
  export_csv: { overhead: 30, perK: 5 }, // mesuré ~4,5 ms/1k
}
const GENERIC = { overhead: 60, perK: 8 }
const LS_KEY = 'roade.etaModel.v1'

/** Clé de modèle d'un bloc — l'export se scinde xlsx/csv (coûts très différents). */
export function modelKey(node) {
  if (!node) return 'generic'
  if (node.type === 'export') {
    const fmt = (node.data?.format || 'xlsx').toLowerCase()
    return fmt === 'csv' ? 'export_csv' : 'export_xlsx'
  }
  return node.type
}

function loadLearned() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {}
  } catch {
    return {}
  }
}
function saveLearned(obj) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(obj))
  } catch {
    /* quota / navigation privée : on garde la baseline, pas grave */
  }
}

function coef(key) {
  return loadLearned()[key] || BASELINE[key] || GENERIC
}

/** Estime la durée (ms) d'un bloc pour `rows` lignes traitées. */
export function estimateNodeMs(key, rows) {
  const c = coef(key)
  const r = Math.max(0, rows || 0)
  return Math.round(c.overhead + (c.perK * r) / 1000)
}

/**
 * Apprend d'une durée réelle observée (EMA). Sur gros volume on isole le
 * coût/ligne (overhead négligeable) ; sur tout petit volume on ajuste
 * l'overhead. Entre les deux, on ne touche à rien (signal ambigu).
 */
export function learnDuration(key, rows, ms) {
  if (!key || !Number.isFinite(ms) || ms < 0) return
  const all = loadLearned()
  const cur = all[key] || BASELINE[key] || GENERIC
  let overhead = cur.overhead
  let perK = cur.perK
  const a = 0.35 // poids du nouveau point
  if (rows >= 5000) {
    const obsPerK = ((ms - overhead) / rows) * 1000
    if (obsPerK > 0) perK = (1 - a) * perK + a * obsPerK
  } else if (rows <= 500) {
    overhead = (1 - a) * overhead + a * ms
  }
  all[key] = {
    overhead: Math.max(0, Math.round(overhead)),
    perK: Math.max(0, Number(perK.toFixed(3))),
  }
  saveLearned(all)
}
