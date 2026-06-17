# Audit Roade — index & auto-évaluation

> Diagnostic terrain du dépôt à la date du **2026-06-17**, branche `main`, dernier commit `ced6b01`. Les fichiers d'audit listés ici ne modifient pas le code applicatif (`backend/`, `frontend/`). Toutes les références sont en `chemin/fichier.ext:ligne`.

## Table des matières

| # | Fichier | Sujet (une ligne) |
|---|---|---|
| 00 | `00_README.md` | Ce document : index, couverture, méthode. |
| 01 | `01_ARCHITECTURE_AND_INVENTORY.md` | Carte du système : stack, modules, modèle de données, API, navigation. |
| 02 | `02_BLOCK_CATALOG.md` | Catalogue exhaustif des 14 blocs : config, runner, aperçu, limites. |
| 03 | `03_BLOCK_CAPABILITY_MATRIX.md` | Matrice de profondeur des blocs (P10) + dissymétries. |
| 04 | `04_USER_FLOWS.md` | Parcours réels cliquables, comptés en clics + impasses. |
| 05 | `05_UX_HEURISTIC_AUDIT.md` | Audit UX heuristique (P1–P13 + Nielsen). |
| 06 | `06_DESIGN_SYSTEM_AUDIT.md` | Tokens, primitives, motifs ré-implémentés (P2). |
| 07 | `07_TECH_HEALTH_AND_RISKS.md` | Tests, lint, CI, sécurité, perf, distribution (P3, P4). |
| 08 | `08_DATA_INTEGRITY_AND_CORRECTNESS.md` | Encodage, séparateurs, types, cache, reproductibilité (P12, P13). |
| 09 | `09_OPEN_QUESTIONS_AND_ASSUMPTIONS.md` | Hypothèses, points non tranchés, questions au commanditaire. |

## Couverture & confiance (état actuel)

| Fichier | Statut | Confiance | Ce qui n'a pas pu être vérifié |
|---|---|---|---|
| 00 | rédigé | élevée | — |
| 01 | rédigé | **élevée** sur stack/modules/API/navigation ; **moyenne** sur la complétude exhaustive de chaque route (paramètres optionnels) | aucune exécution dynamique faite ; je n'ai pas instrumenté les imports croisés (graphe d'appels) |
| 02 | rédigé | **élevée** sur la structure de `DEFAULT_DATA` et le mapping config → runner ; **moyenne** sur la liste exhaustive des cas limites gérés par chaque `_run_*` | l'auto-évaluation a porté sur la lecture statique de `engine.py`, sans génération de cas pathologiques |
| 03 | rédigé | **élevée** sur les 10 capacités auditées — chaque cellule est sourcée à `fichier:ligne` (Inspector, nodes, engine) | la matrice ne tient pas compte des chemins d'erreur *non* déclenchables depuis l'UI courante (ex. erreurs `formula.py` que l'utilisateur ne peut pas atteindre sans passer en « formule avancée »). « Validation pré-run en ligne » a été interprété comme un signal visible **sur le nœud du canevas** — un audit plus permissif pourrait créditer le dry-run de Validation (visible dans l'Inspector). |
| 04 | rédigé | **élevée** sur les comptes de clics et les contrôles dupliqués (preuves à `fichier:ligne`) ; **moyenne** sur la fidélité de l'expérience perçue : je n'ai pas lancé l'app pour mesurer la latence ressentie ni le comportement du `confirm()` natif | aucun test d'utilisabilité réel ; les *raccourcis clavier* listés sont ceux trouvés en `grep`, je n'ai pas pu vérifier ceux gérés par React Flow nativement (ex. molette = zoom). |
| 05 | rédigé | **élevée** sur les 35 constats et 10 atouts (tous sourcés à `fichier:ligne`) ; **moyenne** sur la *sévérité* attribuée — la frontière B/M/m est mon jugement éditorial, à recalibrer si tu préfères une autre granularité | aucun audit a11y outillé (Axe, VoiceOver) — la note a11y repose sur la rareté des attributs `aria/role/tabIndex` ; aucun test de contraste réel (juste relevé des couleurs hardcodées). |
| 06 | rédigé | **élevée** sur les comptes (tokens, usage `var(--…)`, occurrences `<input>`/`<select>`/modales/`InfoBubble`, distincts padding/gap/font-size/border-radius/couleurs) — tous via `grep` reproductible | je n'ai pas exécuté le rendu pour mesurer le contraste WCAG des couleurs employées ; je n'ai pas étudié la **cascade** (quelles règles écrasent quelles autres) ni la spécificité (présence de `!important` peu fréquente — 1 sur `border-radius`, à confirmer). |
| 07 | rédigé | **élevée** sur l'inventaire (LOC, présence/absence des configs, liste des `_test_*.py`, motifs d'erreur) et sur les vecteurs sécurité (§ 5.1–5.5) reproduisibles par lecture du code | je n'ai **pas tenté d'exécuter** les attaques décrites — § 5.2 (path-traversal sur `pid`) et § 5.5 (`os.startfile`) sont validées en lecture du source mais non reproduites ; § 5.4 (DuckDB `raw`) suppose le comportement par défaut de la version installée (à confirmer sur la 1.3.2 exacte). |
| 08 | rédigé | **élevée** sur les chemins de lecture/écriture et la signature de cache (chaque trou sourcé) | je n'ai **pas exécuté** les *notes de reproduction* — elles sont déduites du code. Les comportements pandas/DuckDB cités correspondent aux versions épinglées (`pandas>=2.3.2`, `duckdb>=1.3.2`) ; ils peuvent varier sur des minor antérieurs. Le `_sanitize_filename` est cité mais non lu intégralement. |
| 09 | rédigé | **n/a** (le document EST l'exposition des incertitudes) — 12 hypothèses explicitées, 10 zones grises, 15 questions au commanditaire | nature même du document : il ne tranche rien, il pose ce qui doit être tranché avant l'étape 3. |

## Méthode

- **Exploration statique seule.** Aucun changement de fichier source ni d'exécution du backend / dev-server. Lecture brute, `Grep`, `Glob`, comptage de lignes avec `wc -l`.
- **Fichiers lus intégralement** : `App.jsx`, `api.js`, `main.py`, `storage.py`, `WorkflowEditor.jsx` (partiellement, ~1 156 lignes), `ROADE_GUIDE_CLAUDE_CODE.md`, `README.md`, `requirements.txt`, `package.json`, `.gitignore`.
- **Fichiers consultés ciblé** : `engine.py` (segments — `_extract_key`, `_run_filter`, `_run_split`, exécution principale), `Inspector.jsx` (segments — `SplitConfig`, `FilterConfig`), `routing.jsx` (segments — `OutputsPane`, `FlowMap`), un workflow JSON réel (`projects/codif-sermatec/workflows/582acec9.json`).
- **Comptes systématiques** : LOC par fichier source (`wc -l`), nombre de routes (`grep ^@app`), nombre de hooks React utilisés (`grep useState|useEffect…`), nombre d'attributs `aria/role/tabIndex` (`grep`).
- **Pas d'agent secondaire utilisé** pour cette première itération — exploration directe.

## Pour la suite

**Étape 2 — terminée.** Les 10 fichiers `00` → `09` sont rédigés, tout constat factuel est sourcé à `fichier:ligne`. Aucun fichier de code applicatif (`backend/`, `frontend/`) n'a été modifié pendant ce chantier.

**Avant l'étape 3** — voir `09_OPEN_QUESTIONS_AND_ASSUMPTIONS.md` § 3 (15 questions au commanditaire). Les réponses à Q1 (cap final), Q2 (multi-utilisateur), Q3 (plateformes) et Q15 (forme du livrable) recalibrent la roadmap entière.
