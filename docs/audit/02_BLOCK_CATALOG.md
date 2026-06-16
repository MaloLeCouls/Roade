# 02 — Catalogue des blocs

> Une fiche par bloc. Toutes les références : config par défaut dans `frontend/src/components/WorkflowEditor.jsx:120-145`, configurateur Inspector dans `frontend/src/components/Inspector.jsx`, runner dans `backend/engine.py`. Les types `type:` du JSON sont indiqués entre `«…»`.

## Vue d'ensemble

| `type` | Étiquette | Entrées | Sorties | Runner | Composant nœud | Inspector |
|---|---|---|---|---|---|---|
| `source` | Source | 0 | `out` | `_run_source` (`engine.py:319`) | `nodes/SourceNode.jsx` | `SourceConfig` (`Inspector.jsx:1302`) |
| `sql` | SQL | 1–2 (`in1`/`in2`) | `out` | `_run_sql` (`engine.py:332`) | `nodes/SqlNode.jsx` | `SqlConfig` (`Inspector.jsx:1378`) |
| `dedup` | Doublons | 1 (`in`) | `kept`, `dups`, `uniques` | `_run_dedup` (`engine.py:357`) | `nodes/DedupNode.jsx` | `DedupConfig` (`Inspector.jsx:1246`) |
| `validate` | Validation | 1 (`in`) | `valid`/`invalid` (split) **ou** N + `else` (route) | `_run_validate` (`engine.py:399`) → `_run_route` / `_run_split` (`engine.py:1062`, `1038`) | `nodes/ValidateNode.jsx` | `ValidateConfig` (`Inspector.jsx:70`) + `SplitConfig` (`Inspector.jsx:107`) |
| `pivot` | Pivot | 1 (`in`) | `out` | `_run_pivot` (`engine.py:1141`) | `nodes/PivotNode.jsx` | `PivotConfig` (`Inspector.jsx:268`) |
| `clean` | Nettoyage | 1 (`in`) | `out` | `_run_clean` (`engine.py:1178`) | `nodes/CleanNode.jsx` | `CleanConfig` (`Inspector.jsx:325`) |
| `calc` | Calcul | 1 (`in`) | `out` | `_run_calc` (`engine.py:1338`) | `nodes/CalcNode.jsx` | `CalcConfig` (`Inspector.jsx:851`) |
| `filter` | Filtre | 2 (`in`, `ref`) | `out` | `_run_filter` (`engine.py:1396`) | `nodes/FilterNode.jsx` | `FilterConfig` (`Inspector.jsx:926`) |
| `cols` | Colonnes | 1 (`in`) | `out` | `_run_cols` (`engine.py:1454`) | `nodes/ColsNode.jsx` | `ColsConfig` (`Inspector.jsx:1026`) |
| `report` | Analyse | 1 (`in`) | `out` (interne, pas d'ancre dessinée) | `_run_report` (`engine.py:1644`) | `nodes/ReportNode.jsx` | `ReportConfig` (`Inspector.jsx:1203`) |
| `union` | Union | N (1 ancre `in`, multi-edges) | `out` | `_run_union` (`engine.py:1673`) | `nodes/UnionNode.jsx` | `UnionConfig` (`Inspector.jsx:902`) |
| `export` | Export | 1 (`in`) | aucune | `_run_export` (`engine.py:1708`) | `nodes/ExportNode.jsx` | `ExportConfig` (`Inspector.jsx:1421`) |
| `frame` | Cadre | 0 | 0 | — (visuel) | `nodes/GroupNode.jsx` | — |
| `stop` | Bouchon | 1 (`in`, masquée si collé) | 0 | — (visuel) | `nodes/StopNode.jsx` | — |

Sources faisant foi pour les handles : `frontend/src/components/WorkflowEditor.jsx:171-195` (`NODE_OUTPUTS`) et `backend/engine.py:33-39` (`OUTPUTS`).

---

## Source — `«source»`

- **But** : lire un fichier Excel/CSV uploadé dans `projects/<pid>/files/` et le matérialiser en Parquet. Tête de chaîne.
- **Entrées** : 0. **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:121`) :
  ```js
  { label: 'Source', file: '', sheet: '', header_row: 0, cache: true }
  ```
  - `file` (string) — nom de fichier dans `files/`.
  - `sheet` (string) — feuille Excel (vide = première).
  - `header_row` (int) — ligne d'en-tête (1-based dans l'UI, 0-based dans `pd.read_excel(..., skiprows=hr)`, `engine.py:206`).
  - `cache` (bool) — réutiliser le Parquet matérialisé si la signature (`source_fingerprint`) n'a pas changé.
- **Runner** : `_run_source` (`engine.py:319-329`).
- **Lecture du fichier** : `_read_source` (`engine.py:204-211`) — `xlsx`/`xls` → `pd.read_excel(...)`, `tsv` → `pd.read_csv(sep="\t")`, autres CSV → `pd.read_csv(sep=None, engine="python")` (auto-sniff). **Aucun argument `encoding=`, `decimal=`, `thousands=`.**
- **Aperçu / profil** : oui (`preview_node`, `column_profile` traitent uniformément tous les blocs matérialisés).
- **Erreurs** : « aucun fichier sélectionné » (`engine.py:323`), « fichier introuvable » (`engine.py:326`). Pas d'erreur typée sur encodage / séparateur invalide — c'est la lecture pandas qui remonte.
- **Limites connues à documenter** : encodage figé UTF-8 (P12), séparateur décimal/milliers non géré (P12). Pas de gestion explicite d'un xlsx corrompu ou de cellules fusionnées.

---

## SQL — `«sql»`

- **But** : SELECT/WHERE/JOIN/GROUP/ORDER construit visuellement, ou SQL brut DuckDB.
- **Entrées** : 1 à 2 (`in1`, `in2`). **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:122`) :
  ```js
  { label: 'SQL', mode: 'builder', query: { select: [], where: [], joins: [], group_by: [], order_by: [] } }
  ```
- **Modes** :
  - `builder` (default) — config visuelle compilée via `query_builder.compile_query(...)` (`query_builder.py`).
  - `raw` — l'utilisateur écrit le SQL en clair (DuckDB), referencé sous l'alias `in1` (et `in2` si une 2ᵉ ancre est branchée).
- **Runner** : `_run_sql` (`engine.py:332-354`). Les inputs sont enregistrés comme tables DuckDB par alias puis désenregistrées en `finally`.
- **Aperçu / profil** : oui.
- **Erreurs** : « aucune entrée connectée » (`engine.py:335`), « SQL brut vide » (`engine.py:344`), erreurs DuckDB enveloppées avec le SQL compilé en pièce-jointe pour debug (`engine.py:350`).
- **Limites** : Pas de validation pré-run en ligne (P7). En mode `raw` l'utilisateur peut casser le runtime DuckDB par des appels système (peu probable mais aucun filtrage non plus). Pas de complétion SQL côté UI.

---

## Doublons — `«dedup»`

- **But** : repérer/séparer les lignes en double sur N colonnes-clés.
- **Entrées** : 1 (`in`). **Sorties** : `kept`, `dups`, `uniques` — trois ancres distinctes.
- **Config par défaut** (`WorkflowEditor.jsx:123`) :
  ```js
  { label: 'Doublons', key_columns: [], keep: 'first', dups_mode: 'all' }
  ```
  - `key_columns` (string[]) — vide ⇒ tout la ligne.
  - `keep` ∈ {`first`,`last`} — quel exemplaire garder.
  - `dups_mode` ∈ {`all`,`exemplar`,`extra`} (`engine.py:374-385`).
- **Runner** : `_run_dedup` (`engine.py:357-396`).
- **Cas limites bien gérés** : clé absente de l'entrée → erreur explicite « réexécutez l'amont, puis re-cochez » (`engine.py:364-369`). Tri stable des `dups` pour grouper visuellement (`engine.py:388-391`), avec fallback `TypeError` si types mixtes non comparables.
- **Aperçu / profil** : oui (par ancre — `BlockEditor` propose les onglets `kept`/`dups`/`uniques`).
- **Limites** : pas d'aperçu instantané (dry-run) du nombre de doublons avant matérialisation.

---

## Validation — `«validate»`

C'est le bloc le plus profond — il est, à lui seul, le contre-exemple de P10.

- **But** : classer chaque ligne vers une ou plusieurs sorties selon des conditions (`route` mode) ou éclater par valeur extraite d'une colonne (`split` mode).
- **Entrée** : 1 (`in`). **Sorties** : statiques `valid`/`invalid` par défaut ; dynamiques en mode `route` (une ancre par sortie + `else` optionnel).
- **Config par défaut** (`WorkflowEditor.jsx:124-134`) — ne pas répéter intégralement ici ; champs principaux :
  - `mode`: `'route'` ; `intent`: `'control'`.
  - `target_column`, `case_sensitive`, `routing` (`'first'` partition / `'all'` chevauchement).
  - `conditions: [{id, name, kind, column, groups, segments, when, test_samples}]` — `kind` ∈ {`rules`,`mask`,`group`}.
  - `outputs: [{id, label, color, match:{conditionId, negate}, value?}]` ; `value?` n'apparaît qu'en mode split.
  - `split: {enabled, column, extractor:{type, sep, index, start, length, pattern}}` — voir `validateHelpers.js:45-52` (6 types d'extracteur, dont `whole` ajouté commit `7449912`).
  - `else_enabled`, `else_label`, `else_color`, `add_flag`, `add_reason`, `test_samples`.
- **Runner principal** : `_run_validate` (`engine.py:399`) qui orchestre.
  - Mode split (`split.enabled === true`) → `_run_split` (`engine.py:1038-1059`).
  - Mode route → `_run_route` (`engine.py:1062-1085`).
- **Capacités spécifiques** (rare sur cette catégorie d'outil) :
  - **Dry-run distribution** : `route_preview` (`engine.py:1088`) renvoie `{total, counts:{handle:count}}` sans matérialisation, alimenté en debounce côté front (`routing.jsx:22-35`).
  - **Scan des valeurs distinctes** : `split_scan` (`engine.py:1100`) — pour générer une sortie par valeur trouvée. Inclut désormais le bucket vide (commit `7449912`).
  - **Testeur autonome** : `validate_test` (`engine.py`, route `/api/validate/test`) — lignes en clair → verdict, sans toucher au workflow.
- **Aperçu / profil** : oui, par sortie (onglets dans `BlockEditor`).
- **Cas limites maîtrisés** : édition de sortie nommée → `prune_orphan_edges` (`engine.py:53-71`) et `prune_node_outputs` (`storage.py:200-231`). Sortie nommée supprimée → arêtes et Bouchons attachés correspondants nettoyés côté front (`WorkflowEditor.jsx:486-504` + cleanup attached stops, commit `7449912`).
- **Limites** : la complexité du modèle a un coût (`validateHelpers.js` + `routing.jsx` + `Inspector.jsx:70-175` totalisent **~1 297 LOC** rien que pour Validation/Split/Route). Aucune autre brique de l'app n'approche cette profondeur — c'est l'écart de profondeur le plus marqué.

---

## Pivot — `«pivot»`

- **But** : tableau croisé (`pivot`) ou dépivotement (`unpivot`).
- **Entrée** : 1. **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:135`) :
  ```js
  { label: 'Pivot', mode: 'pivot', index_columns: [], value_columns: [],
    pivot_column: '', value_column: '', agg: 'SUM', name_column: 'variable' }
  ```
- **Modes** :
  - `unpivot` — `df.melt(...)` avec `name_column`/`value_column` paramétrables (`engine.py:1144-1153`).
  - `pivot` — `pd.pivot_table(...)` avec une seule fonction d'agrégat parmi `SUM/AVG/MIN/MAX/COUNT/MEDIAN/FIRST/LAST` (`engine.py:1160-1166`).
- **Runner** : `_run_pivot` (`engine.py:1141-1166`).
- **Aperçu / profil** : oui.
- **Erreurs** : « sélectionnez les colonnes à dépivoter » (`engine.py:1147`), « renseignez lignes, colonne à éclater et valeurs » (`engine.py:1159`).
- **Limites** : un seul agrégat (`agg:`) — pas de multi-agrégat par colonne. Le `name_column`/`value_column` est unique pour tout le bloc.

---

## Nettoyage — `«clean»`

- **But** : enchaîner des opérations colonnes (trim, casse, replace, fillna, conversion type, round, abs).
- **Entrée** : 1. **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:136`) :
  ```js
  { label: 'Nettoyage', operations: [] }
  ```
  - `operations[i]` : `{ op, column, enabled?, ...params }` où `op` ∈ liste `_CLEAN_LABELS` (`engine.py:1169-1175`) = 11 opérations.
- **Runner** : `_run_clean` (`engine.py:1178`). Chaque opération produit une ligne de rapport `{op, column, changed, failed, was_null, samples}` (5 exemples avant/après) attachée au meta — exploité dans `BlockEditor` pour l'onglet « rapport de nettoyage ».
- **Aperçu / profil** : oui.
- **Limites** : pas de prévisualisation par opération avant exécution. Pas de transformation conditionnelle (« nettoyer seulement si X »).

---

## Calcul — `«calc»`

- **But** : colonnes calculées par formules style Excel et fonctions par groupe.
- **Entrée** : 1. **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:137`) :
  ```js
  { label: 'Calcul', columns: [] }
  ```
  - `columns[i]` : `{ kind: 'formula'|'group', name, formula?, fn?, source?, key_columns?, order_by?, value_when?, fallback? }`.
- **Runner** : `_run_calc` (`engine.py:1338`) appuyé sur `formula.py` (319 LOC) pour la compilation des expressions Excel-like. Fonctions de groupe (`Inspector.jsx:196-213`) : 16 dont la dernière `value_when` (commit `b02ee93`) est un mini-éditeur dédié.
- **Aperçu / profil** : oui.
- **Limites** : la liste exhaustive des fonctions supportées est dans `formula.py` (à auditer dans `08`).

---

## Filtre — `«filter»`

- **But** : semi-jointure / anti-jointure sur une clé composite (N paires de colonnes).
- **Entrées** : 2 — `in` (données à filtrer) et `ref` (table de référence, jamais fusionnée).
- **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:138`) :
  ```js
  { label: 'Filtre', mode: 'keep', column: '', ref_column: '', case_insensitive: false }
  ```
  Depuis le commit `7449912`, le format pratique est `{ mode, pairs: [{column, ref_column}, ...], case_insensitive }` ; `column`/`ref_column` deviennent un miroir de la première paire pour la rétro-compat.
- **Runner** : `_run_filter` (`engine.py:1396-1453`). Implémentation : `Series` de tuples côté données + `set` de tuples côté ref, semi/anti-join selon `mode`. Colonne avec NaN → ligne exclue de la lookup (parité avec l'implémentation mono-colonne d'origine).
- **Aperçu / profil** : oui.
- **Erreurs** : entrées non connectées, colonne absente, paires vides (`engine.py:1404-1418`).
- **Limites** : pas de visualisation de la zone d'intersection (Venn) ; pas d'aperçu interactif des lignes qui *seraient* exclues avant matérialisation.

---

## Colonnes — `«cols»`

- **But** : réordonner, supprimer, renommer.
- **Entrée** : 1. **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:139`) :
  ```js
  { label: 'Colonnes', columns: [] }
  ```
  - `columns[i]` : `{ name, keep, rename }`.
- **Runner** : `_run_cols` (`engine.py:1454-1454+`). Cas limite intéressant : colonnes apparues *en amont* après la définition de la liste sont **appendées** automatiquement (rien n'est silencieusement perdu — `engine.py:1443-1445`).
- **Limites** : pas de validation des noms renommés (doublons après renommage = erreur runtime, `engine.py:1449-1451`) ; pas de prévisualisation.

---

## Analyse — `«report»`

- **But** : bloc terminal qui *matérialise* son entrée (pour rester aperçu-able) et calcule des analyses par colonne (camembert / barres / tableau / « clés multiples »). Apparaît dans la documentation Excel.
- **Entrée** : 1. **Sortie** : `out` (la passe-plat — n'affiche pas d'ancre de sortie sur le canevas, `WorkflowEditor.jsx:180-182`).
- **Config par défaut** (`WorkflowEditor.jsx:140`) :
  ```js
  { label: 'Analyse', note: '', columns: [] }
  ```
  - `analyses[i]` : `{ column, kind: 'values'|'keys'|'prefix'|'suffix'|'length'|'mask', chart, ... }`. Default fallback : une analyse `values` par colonne choisie (`engine.py:1658-1660`).
- **Runner** : `_run_report` (`engine.py:1644-1670`). Stocke `report = {note, row_count, analyses[]}` dans le meta.
- **Aperçu / profil** : aperçu via `BlockEditor` (data + analyses).
- **Limites** : pas d'export propre du report seul (passe via « Documenter »).

---

## Union — `«union»`

- **But** : empiler N tableaux ; par nom (`UNION ALL BY NAME`) ou par position (`UNION ALL`), avec option `DISTINCT`.
- **Entrées** : N (une ancre `in` qui accepte plusieurs arêtes — voir `WorkflowEditor.jsx:336-344` `onConnect`).
- **Sortie** : `out`.
- **Config par défaut** (`WorkflowEditor.jsx:141`) :
  ```js
  { label: 'Union', by_name: true, distinct: false }
  ```
- **Runner** : `_run_union` (`engine.py:1673-1695`). SQL DuckDB en clair.
- **Aperçu / profil** : oui.
- **Erreurs** : « aucune entrée connectée » (`engine.py:1675-1676`).
- **Limites** : nœud très simple (`nodes/UnionNode.jsx` = 26 LOC) — c'est l'autre extrême par rapport à Validation côté profondeur.

---

## Export — `«export»`

- **But** : écrire un `.xlsx` ou `.csv` dans `projects/<pid>/exports/<workflow>/`. Option « feuille d'un classeur » qui regroupe plusieurs Exports d'un même workflow dans un seul `.xlsx`.
- **Entrée** : 1. **Sortie** : aucune.
- **Config par défaut** (`WorkflowEditor.jsx:142`) :
  ```js
  { label: 'Export', filename: 'resultat', format: 'xlsx', auto_name: true, enabled: true, to_workbook: false }
  ```
- **Runner** : `_run_export` (`engine.py:1708-1742`). Si `enabled === false` et pas de « Super run » → skipped (`engine.py:1711-1712`). Si entrée vide → skipped (`engine.py:1715-1716`).
- **Aperçu** : oui (lecture de l'amont, ajouté commit `79fa9d0`).
- **Limites** : encodage et options CSV non paramétrables (P12). `df.to_csv(out_path, index=False)` (`engine.py:1736`) ⇒ UTF-8, virgule comme séparateur, point comme décimal — non négociable côté UI. Idem `df.to_excel(...)` — pas d'options de format de cellule.

---

## Cadre — `«frame»`

- **But** : rectangle nommé qui regroupe visuellement des blocs ; le déplacer déplace son contenu (snapshot/diff sur drag, `WorkflowEditor.jsx:457-476`).
- **Entrées/Sorties** : 0/0.
- **Config par défaut** (`WorkflowEditor.jsx:143`) :
  ```js
  { label: 'Groupe', w: 460, h: 300, color: '#5b6bb0' }
  ```
- **Runner** : aucun (`engine.py:2180` skip explicite `type ∈ {frame, group, stop}`).
- **Composant** : `nodes/GroupNode.jsx` (33 LOC) avec `NodeResizer` React Flow.
- **Cas limites** : ancien `type:'group'` renommé `'frame'` au chargement (`WorkflowEditor.jsx:270`).
- **Limites** : pas d'imbrication, pas de groupement par sélection automatique.

---

## Bouchon — `«stop»`

- **But** : marquer une sortie laissée *fermée volontairement*. Sert de cap visuel ; ne consomme rien à l'exécution.
- **Entrées/Sorties** : 0/0 logiques. Depuis le commit `7449912`, le Bouchon n'a plus d'arête : il est collé en `parentId` au bloc source.
- **Config par défaut** (`WorkflowEditor.jsx:144`) :
  ```js
  { label: 'Bouchon', note: '' }
  ```
- **Runner** : aucun (cf. `engine.py:2178-2180`).
- **Composant** : `nodes/StopNode.jsx` (39 LOC).
- **Cas limites** : migration automatique au chargement des Bouchons anciennement reliés par une arête (`WorkflowEditor.jsx:269-302`). Suppression du parent → suppression du Bouchon collé (`WorkflowEditor.jsx:486-491`).

---

## Remarques transversales (servent l'audit 03)

- Le contrat « entrée nommée » est régulier : `in` partout, sauf SQL qui utilise `in1`/`in2`, et Filtre qui utilise `in`/`ref`. Ce sont les deux exceptions du contrat — à signaler pour P10.
- Le contrat « sortie nommée » est régulier : `out` partout sauf dedup (3 ancres) et validate (statique ou dynamique). Le bloc validate en mode `route` est le seul à avoir des sorties **personnalisables par l'utilisateur**.
- **Aperçu** disponible pour 12 blocs sur 14 (tout sauf `frame`/`stop`).
- **Profilage de colonne** : disponible partout où il y a un Parquet matérialisé ; même implémentation (`column_profile`, `engine.py`).
- **Testeur en place** : seul `validate` en a un explicite (route `POST /api/validate/test`). Aucun autre bloc n'expose de cas de test isolé.
- **Validation pré-run sur le canevas** : pas vu côté nœuds — les erreurs ne s'affichent qu'après tentative d'exécution (P7).
