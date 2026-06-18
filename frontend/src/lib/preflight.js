// Validation pré-run du workflow — E.3.
//
// Avant : entrée requise non branchée, cycle, SQL brut vide… ne sortaient
// qu'au runtime (cf. engine.py:323,335,364,1147,…). L'utilisateur lançait
// « Exécuter », attendait, et recevait une erreur 30s plus tard. Ici on
// détecte STATIQUEMENT ce qu'on peut, on l'affiche sous forme de badges
// sur les nodes, et le run pré-vérifie tout avant de partir.
//
// Cette fonction matérialise l'item 5 du « contrat de bloc » (F.0,
// `docs/CONTRAT_BLOC.md`) : tout nouveau type de bloc dont l'engine peut
// échouer de manière déterministe doit gagner sa règle ci-dessous.

// Types qui exigent une entrée (sinon l'engine plante immédiatement).
const NEEDS_INPUT = new Set([
  'sql',
  'dedup',
  'validate',
  'pivot',
  'clean',
  'calc',
  'filter',
  'cols',
  'report',
  'union',
  'export',
])

// Types qu'on ne lance pas (cosmétiques) et qui ne devraient pas porter d'erreur.
const VISUAL_ONLY = new Set(['frame', 'group', 'stop'])

/**
 * Inspecte la structure du workflow et remonte les erreurs statiques.
 * @param {Array<{id:string, type:string, data:object}>} nodes
 * @param {Array<{source:string, target:string, sourceHandle?:string, targetHandle?:string}>} edges
 * @returns {Record<string, Array<{kind:string, message:string}>>}
 */
export function preflightWorkflow(nodes, edges) {
  const issues = {}
  const add = (id, kind, message) => {
    if (!issues[id]) issues[id] = []
    issues[id].push({ kind, message })
  }

  const inputsBy = {}
  for (const e of edges) {
    if (!inputsBy[e.target]) inputsBy[e.target] = []
    inputsBy[e.target].push(e)
  }

  for (const n of nodes) {
    if (VISUAL_ONLY.has(n.type)) continue
    const d = n.data || {}

    if (NEEDS_INPUT.has(n.type) && !inputsBy[n.id]) {
      add(n.id, 'input_missing', 'Aucune entrée connectée — branchez un bloc en amont.')
    }

    if (n.type === 'source' && !d.file) {
      add(n.id, 'no_file', 'Aucun fichier sélectionné.')
    }

    if (n.type === 'sql' && d.mode === 'raw') {
      const sql = (d.raw_sql || '').trim()
      if (!sql) add(n.id, 'sql_empty', 'SQL brut vide.')
    }

    if (n.type === 'filter') {
      const main = d.mainCols || []
      const ref = d.refCols || []
      if (main.length === 0 || ref.length === 0) {
        add(n.id, 'filter_empty', 'Choisissez au moins une colonne de chaque côté du filtre.')
      } else if (main.length !== ref.length) {
        add(n.id, 'filter_mismatch', "Le nombre de colonnes diffère d'un côté à l'autre.")
      }
    }

    if (n.type === 'validate') {
      const target = d.target_column
      const mode = d.mode || 'rules'
      if (mode !== 'group' && !target) {
        add(n.id, 'validate_target', 'Colonne cible non choisie.')
      }
    }
  }

  // Détection de cycle : tout ce qui survit à un topo sort est dans un cycle.
  const indeg = {}
  const succ = {}
  for (const n of nodes) {
    indeg[n.id] = 0
    succ[n.id] = []
  }
  for (const e of edges) {
    if (indeg[e.target] !== undefined && succ[e.source]) {
      succ[e.source].push(e.target)
      indeg[e.target]++
    }
  }
  const queue = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id)
  const visited = new Set(queue)
  while (queue.length) {
    const cur = queue.shift()
    for (const m of succ[cur]) {
      indeg[m]--
      if (indeg[m] === 0 && !visited.has(m)) {
        visited.add(m)
        queue.push(m)
      }
    }
  }
  for (const n of nodes) {
    if (!visited.has(n.id) && !VISUAL_ONLY.has(n.type)) {
      add(n.id, 'cycle', "Ce bloc fait partie d'un cycle — l'exécution est impossible.")
    }
  }

  return issues
}

/** Indique si un graphe a au moins une erreur bloquante. */
export function hasBlockingIssues(issues) {
  for (const arr of Object.values(issues)) if (arr.length > 0) return true
  return false
}
