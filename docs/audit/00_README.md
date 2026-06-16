# Audit Roade — index & auto-évaluation

> Diagnostic terrain du dépôt à la date du **2026-06-16**, branche `main`, dernier commit `4eda611`. Les fichiers d'audit listés ici ne modifient pas le code applicatif (`backend/`, `frontend/`). Toutes les références sont en `chemin/fichier.ext:ligne`.

## Table des matières

| # | Fichier | Sujet (une ligne) |
|---|---|---|
| 00 | `00_README.md` | Ce document : index, couverture, méthode. |
| 01 | `01_ARCHITECTURE_AND_INVENTORY.md` | Carte du système : stack, modules, modèle de données, API, navigation. |
| 02 | `02_BLOCK_CATALOG.md` | Catalogue exhaustif des 14 blocs : config, runner, aperçu, limites. |
| 03 | `03_BLOCK_CAPABILITY_MATRIX.md` | Matrice de profondeur des blocs (P10) + dissymétries. *(à venir)* |
| 04 | `04_USER_FLOWS.md` | Parcours réels cliquables, comptés en clics + impasses. *(à venir)* |
| 05 | `05_UX_HEURISTIC_AUDIT.md` | Audit UX heuristique (P1–P13 + Nielsen). *(à venir)* |
| 06 | `06_DESIGN_SYSTEM_AUDIT.md` | Tokens, primitives, motifs ré-implémentés (P2). *(à venir)* |
| 07 | `07_TECH_HEALTH_AND_RISKS.md` | Tests, lint, CI, sécurité, perf, distribution (P3, P4). *(à venir)* |
| 08 | `08_DATA_INTEGRITY_AND_CORRECTNESS.md` | Encodage, séparateurs, types, cache, reproductibilité (P12, P13). *(à venir)* |
| 09 | `09_OPEN_QUESTIONS_AND_ASSUMPTIONS.md` | Hypothèses, points non tranchés, questions au commanditaire. *(à venir)* |

## Couverture & confiance (état actuel)

| Fichier | Statut | Confiance | Ce qui n'a pas pu être vérifié |
|---|---|---|---|
| 00 | rédigé | élevée | — |
| 01 | rédigé | **élevée** sur stack/modules/API/navigation ; **moyenne** sur la complétude exhaustive de chaque route (paramètres optionnels) | aucune exécution dynamique faite ; je n'ai pas instrumenté les imports croisés (graphe d'appels) |
| 02 | rédigé | **élevée** sur la structure de `DEFAULT_DATA` et le mapping config → runner ; **moyenne** sur la liste exhaustive des cas limites gérés par chaque `_run_*` | l'auto-évaluation a porté sur la lecture statique de `engine.py`, sans génération de cas pathologiques |
| 03–09 | non rédigés | n/a | à produire dans les tours suivants |

## Méthode

- **Exploration statique seule.** Aucun changement de fichier source ni d'exécution du backend / dev-server. Lecture brute, `Grep`, `Glob`, comptage de lignes avec `wc -l`.
- **Fichiers lus intégralement** : `App.jsx`, `api.js`, `main.py`, `storage.py`, `WorkflowEditor.jsx` (partiellement, ~1 156 lignes), `ROADE_GUIDE_CLAUDE_CODE.md`, `README.md`, `requirements.txt`, `package.json`, `.gitignore`.
- **Fichiers consultés ciblé** : `engine.py` (segments — `_extract_key`, `_run_filter`, `_run_split`, exécution principale), `Inspector.jsx` (segments — `SplitConfig`, `FilterConfig`), `routing.jsx` (segments — `OutputsPane`, `FlowMap`), un workflow JSON réel (`projects/codif-sermatec/workflows/582acec9.json`).
- **Comptes systématiques** : LOC par fichier source (`wc -l`), nombre de routes (`grep ^@app`), nombre de hooks React utilisés (`grep useState|useEffect…`), nombre d'attributs `aria/role/tabIndex` (`grep`).
- **Pas d'agent secondaire utilisé** pour cette première itération — exploration directe.

## Pour la suite

Les fichiers `03` → `09` seront produits dans des tours ultérieurs. Le présent index sera mis à jour à mesure (statut, confiance, lacunes).
