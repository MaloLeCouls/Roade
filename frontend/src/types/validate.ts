// Types des données du bloc Validation (cf. todo 0.9 — premier shape typé).
//
// Le bloc Validation porte la complexité la plus dense de Roade : 4 modes
// (`rules`, `mask`, `group`, `route`), des conditions imbriquées, des sorties
// dynamiques. L'audit 07 § 3 pointait que cette `data` polymorphe était LE
// piège à régressions silencieuses du front (l'Inspector lit `data.target_column`
// alors qu'en mode group il y a `group_by`, etc.).
//
// On commence ici par TYPER cette shape — c'est le critère « Terminé » de 0.9
// (« la shape `validate.data` est typée et vérifiée en CI »). Les autres blocs
// suivront en passes incrémentales.

import type { HandleRole } from '../theme'

// ---- Règles atomiques ----------------------------------------------------- //
export type CharClass = 'letter' | 'upper' | 'lower' | 'digit' | 'alnum' | 'any'

// L'ensemble des tests recensés dans validateHelpers.js (`VAL_TESTS`).
export type RuleTest =
  | 'starts_with'
  | 'ends_with'
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'char_class'
  | 'char_equals'
  | 'substr_equals'
  | 'length_eq'
  | 'length_min'
  | 'length_max'
  | 'matches_regex'
  | 'is_empty'
  | 'not_empty'
  | 'numeric'
  | 'not_numeric'

export interface ValidationRule {
  test: RuleTest
  value?: string | number
  /** 1-based position pour `char_class` / `char_equals`. */
  position?: number
  start?: number
  length?: number
  charclass?: CharClass
  /** Label libre (UI) — n'affecte pas le calcul. */
  label?: string
  negate?: boolean
}

export interface RuleGroup {
  rules: ValidationRule[]
}

export interface RulesConfig {
  groups: RuleGroup[]
  /** Combinateur entre les groupes — défaut = `all` (ET). */
  combine?: 'all' | 'any'
  case_sensitive?: boolean
}

// ---- Masque positionnel --------------------------------------------------- //
export type MaskSegmentType = CharClass | 'literal' | 'set'

export interface MaskSegment {
  type: MaskSegmentType
  /** Pour `literal` / `set`. */
  value?: string
  length?: number
  min?: number
  max?: number
}

// ---- Routage / conformité ------------------------------------------------- //
export type RouteIntent = 'router' | 'control'
export type RoutingMode = 'first' | 'all'

export interface NamedCondition {
  id: string
  name: string
  /** `rules` (par défaut) ou `mask`. */
  kind: 'rules' | 'mask'
  /** Colonne cible si différente de `target_column`. */
  column?: string
  groups?: RuleGroup[] // si kind === 'rules'
  segments?: MaskSegment[] // si kind === 'mask'
}

export interface OutputMatch {
  /** Référence à `NamedCondition.id`. */
  conditionId: string
  negate?: boolean
}

export interface ValidationOutput {
  /** Identifiant interne unique de cette sortie (ex. `oa`, `valid`, …). */
  id: string
  label: string
  color: string
  /** Match nommé OU condition inline legacy (back-compat). */
  match?: OutputMatch
  /** Legacy : condition inline à 1 sortie. Maintenue le temps que les workflows
   * historiques migrent. */
  condition?: { groups?: RuleGroup[] }
}

// ---- Mode « groupe » ------------------------------------------------------ //
export interface GroupCheck {
  check:
    | 'unique'
    | 'constant'
    | 'no_null'
    | 'all_null'
    | 'not_all_null'
    | 'distinct_min'
    | 'contains'
    | 'size_min'
    | 'rows_satisfy'
    | 'determines'
    | 'distinct_cmp'
  column?: string
  column2?: string
  n?: number
  value?: string | number
  op?: 'gt' | 'lt' | 'eq' | 'ne' | 'ge' | 'le'
  when?: RulesConfig
  then?: RulesConfig
}

export interface GroupConfig {
  group_by: string[]
  checks: GroupCheck[]
}

// ---- Diagnostics ---------------------------------------------------------- //
export interface DiagnosticsConfig {
  /** Ajoute une colonne `valide` (bool) sur les sorties. */
  add_flag?: boolean
  /** Ajoute une colonne `motif` sur les sorties. */
  add_reason?: boolean
}

// ---- ValidateData (union discriminée par `mode`) -------------------------- //
interface ValidateBase extends DiagnosticsConfig {
  /** Libellé affiché sur le nœud (purement cosmétique). */
  label?: string
  description?: string
  /** Colonne sur laquelle s'appliquent règles/masque/route. */
  target_column?: string
  case_sensitive?: boolean
}

export interface ValidateRulesData extends ValidateBase {
  mode: 'rules'
  combine?: 'all' | 'any'
  rules?: ValidationRule[]
  groups?: RuleGroup[]
}

export interface ValidateMaskData extends ValidateBase {
  mode: 'mask'
  segments?: MaskSegment[]
}

export interface ValidateGroupData extends ValidateBase {
  mode: 'group'
  group_by?: string[]
  checks?: GroupCheck[]
}

export interface ValidateRouteData extends ValidateBase {
  mode: 'route'
  intent?: RouteIntent
  routing?: RoutingMode
  else_enabled?: boolean
  conditions?: NamedCondition[]
  outputs?: ValidationOutput[]
}

export type ValidateData =
  | ValidateRulesData
  | ValidateMaskData
  | ValidateGroupData
  | ValidateRouteData

// ---- Sorties matérialisées ------------------------------------------------ //
// Une exécution Validation produit un handle par `ValidationOutput.id`, plus
// éventuellement `else`. Les rôles « kept / dups / uniques / valid / invalid »
// sont gérés par `HandleRole` côté palette.
export type ValidationHandle = HandleRole | string
