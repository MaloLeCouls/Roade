// F.5 — estimation statique du « ce bloc va être lourd ».
//
// Avant : un Pivot sur 500k lignes ou un SQL avec jointure sur deux gros
// tableaux se lançaient sans préavis ; l'utilisateur cliquait Exécuter et
// découvrait au bout de 30s qu'il aurait pu attendre. C'est le « plausible
// mais lent » : exactement la sensation que le doctrine anti-slop #3 (finir
// les bords) cible.
//
// Maintenant, dès que l'amont d'un bloc a tourné (donc qu'on connaît son
// nombre de lignes), on dépose une pastille « lourd » sur le bloc aval avec
// une estimation et un rappel du *pourquoi* (pivot multiplicatif, jointure
// quadratique, dédoublonnage global…). Pas de blocage — c'est un signal.
//
// Toujours statique : on N'EXÉCUTE PAS la requête pour estimer. Si l'amont
// n'a jamais tourné, on renvoie null (pas de signal — on ne ment pas).

// Blocs sans besoin d'estimation : Source a sa propre barre de progression
// pendant la lecture, Frame/Stop sont visuels.
const SKIP_TYPES = new Set(['source', 'frame', 'stop'])

/**
 * Estime la charge d'un bloc avant exécution à partir des comptes de lignes
 * remontés par le dernier run de l'amont.
 *
 * @param {{id:string, type:string, data?:object}} node
 * @param {Array<{source:string, target:string}>} edges
 * @param {Record<string, {ran?:boolean, rows?:number}>} status
 * @returns {null | { rows:number, level:'heavy'|'critical', reason:string }}
 */
export function estimateBlockLoad(node, edges, status) {
  if (!node || SKIP_TYPES.has(node.type)) return null

  const incoming = edges.filter((e) => e.target === node.id)
  if (incoming.length === 0) return null

  // Somme des lignes amont *connues* (un amont jamais exécuté n'est pas compté ;
  // on ne devine pas — c'est explicitement le contrat « pas de mensonge »).
  let totalRows = 0
  let knownInputs = 0
  for (const e of incoming) {
    const s = status?.[e.source]
    if (s?.ran && typeof s.rows === 'number') {
      totalRows += s.rows
      knownInputs += 1
    }
  }
  if (knownInputs === 0) return null

  // Seuils par défaut + spécialisation par type de bloc. Les valeurs ne sont
  // pas calibrées sur une machine spécifique — elles correspondent à l'ordre
  // de grandeur où une opération bascule de « instantané » à « visible à l'œil ».
  let heavyAt = 100_000
  let criticalAt = 2_000_000
  let reason = ''

  if (node.type === 'pivot') {
    const mode = node.data?.mode || 'pivot'
    if (mode === 'pivot') {
      // Le pivot peut faire exploser le nombre de colonnes selon la cardinalité
      // de la colonne pivot ; le coût mémoire est ~ rows × distinct.
      heavyAt = 50_000
      criticalAt = 500_000
      reason =
        'le pivot regroupe les lignes par index et crée une colonne par valeur distincte — son coût croît avec la cardinalité de la colonne pivot'
    } else {
      reason = 'le dépivotement multiplie le nombre de lignes par le nombre de colonnes dépivotées'
    }
  } else if (node.type === 'sql' && incoming.length > 1) {
    // Jointure : un cross-join non filtré est quadratique.
    heavyAt = 50_000
    criticalAt = 500_000
    reason = 'jointure entre plusieurs entrées — sans clé sélective le coût est ~ rows1 × rows2'
  } else if (node.type === 'filter') {
    reason = 'semi/anti-jointure — chaque ligne de l\'entrée principale est cherchée dans la référence'
  } else if (node.type === 'dedup') {
    reason = 'détection de doublons : DuckDB doit voir l\'ensemble pour grouper'
  } else if (node.type === 'union') {
    reason = `empilement de ${incoming.length} entrée${incoming.length > 1 ? 's' : ''} — la sortie cumule leurs lignes`
  } else if (node.type === 'validate') {
    // Le coût d'une Validation grimpe vite si les règles font des regex sur
    // texte ligne par ligne.
    reason = 'classement ligne à ligne — les contrôles textuels (regex, masque) sont les plus coûteux'
  } else if (node.type === 'export') {
    // XLSX est sensiblement plus lent que CSV/Parquet à grosse volumétrie.
    const fmt = node.data?.format || 'xlsx'
    if (fmt === 'xlsx') {
      heavyAt = 200_000
      criticalAt = 1_048_576 // limite Excel
      reason = "l'écriture XLSX est lente sur gros volumes ; envisager CSV/Parquet"
    } else {
      heavyAt = 500_000
      reason = "écriture d'un gros fichier"
    }
  } else {
    // Clean / Calc / Cols / Report : coût linéaire, message générique.
    reason = "opération linéaire en nombre de lignes"
  }

  if (totalRows < heavyAt) return null
  return {
    rows: totalRows,
    level: totalRows >= criticalAt ? 'critical' : 'heavy',
    reason,
  }
}

/**
 * Estime la charge de tous les blocs d'un workflow d'un coup.
 *
 * @param {Array<{id:string, type:string, data?:object}>} nodes
 * @param {Array<{source:string, target:string}>} edges
 * @param {Record<string, {ran?:boolean, rows?:number}>} status
 * @returns {Record<string, { rows:number, level:'heavy'|'critical', reason:string }>}
 */
export function estimateWorkflowLoad(nodes, edges, status) {
  const out = {}
  for (const n of nodes) {
    const est = estimateBlockLoad(n, edges, status)
    if (est) out[n.id] = est
  }
  return out
}

/** Formate un nombre de lignes pour l'affichage (séparateur fr-FR). */
export function formatRows(n) {
  return Number(n || 0).toLocaleString('fr-FR')
}
