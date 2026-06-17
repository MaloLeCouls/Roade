// Source unique des palettes côté JS (cf. todo D.2).
// Avant : TYPE_COLOR / HANDLE_COLOR étaient dupliqués dans WorkflowEditor.jsx
// et WorkflowFlow.jsx ; FRAME_COLORS dans WorkflowEditor.jsx ; PIE_COLORS dans
// BlockEditor.jsx ; OUTPUT_COLORS dans validateHelpers.js. Cinq définitions à
// tenir en sync à la main → première qui dérive, et la cohérence se casse en
// silence (un bloc validate violet ici, indigo là).
//
// Les valeurs ci-dessous doivent rester en sync avec les tokens `--t-*` de
// `styles.css` (`:root`). Si vous changez une couleur d'identité, changez les
// deux côtés — il n'y a qu'un endroit à toucher de chaque côté maintenant.

// ---- identités de blocs ---------------------------------------------------- //
// Couleurs qui distinguent les types de blocs sur le canevas (ports + liens).
export type BlockType =
  | 'source'
  | 'sql'
  | 'dedup'
  | 'validate'
  | 'pivot'
  | 'clean'
  | 'calc'
  | 'filter'
  | 'cols'
  | 'report'
  | 'union'
  | 'export'
  | 'frame'
  | 'stop'

export const TYPE_COLOR: Record<BlockType, string> = {
  source: '#4E79A7',
  sql: '#59734F',
  dedup: '#8d6ea0',
  validate: '#5b6bb0',
  pivot: '#b1605f',
  clean: '#4f9a93',
  calc: '#b05a86',
  filter: '#3f8c8c',
  cols: '#7a6cb0',
  report: '#6b8e3d',
  union: '#8a7560',
  export: '#c08436',
  frame: '#5b6bb0',
  stop: '#7d8590',
}

// Les ancres « multi-sortie » (dedup → kept/dups/uniques, validate → valid/invalid)
// portent leur propre couleur de rôle qui surcouche celle du type de bloc.
export type HandleRole = 'kept' | 'dups' | 'uniques' | 'valid' | 'invalid'

export const HANDLE_COLOR: Record<HandleRole, string> = {
  kept: '#3f7a4f',
  dups: '#c0392f',
  uniques: '#3556a8',
  valid: '#3f7a4f',
  invalid: '#c0392f',
}

// Palette restreinte proposée pour colorier un cadre (clic droit → couleur).
export const FRAME_COLORS = ['#5b6bb0', '#4E79A7', '#59A14F', '#E1A33A', '#B05A86', '#7d8590']

// ---- palettes catégorielles (camemberts, sorties Validation) --------------- //
// Une seule liste de fond — `OUTPUT_COLORS` n'est qu'une vue (les 10 premières).
// Inspirée d'une palette qualitative type Tableau 10/20 — pas reconnaissable
// comme telle, mais éprouvée pour discriminer ~10 catégories sans clash.
export const CATEGORICAL_COLORS = [
  '#4E79A7',
  '#59A14F',
  '#E15759',
  '#F28E2B',
  '#B07AA1',
  '#76B7B2',
  '#EDC948',
  '#9C755F',
  '#FF9DA7',
  '#86BCB6',
  '#bab0ac',
  '#8cd17d',
]

export const PIE_COLORS = CATEGORICAL_COLORS
export const OUTPUT_COLORS = CATEGORICAL_COLORS.slice(0, 10)
