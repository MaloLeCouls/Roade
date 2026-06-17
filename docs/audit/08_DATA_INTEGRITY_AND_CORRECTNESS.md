# 08 — Intégrité & correction des données (P12, P13)

> Le dossier le plus critique : un outil de données se juge à ses *bords*. À chaque section, une **note de reproduction** indique le scénario qui déclenche le risque. Toutes les références à `fichier:ligne`.

## TL;DR

- **Encodage** : `pd.read_csv` est appelé **sans `encoding=`** (`engine.py:210, 211`) → UTF-8 par défaut. Sur un CSV FR exporté par Excel en CP1252/Latin-1, mojibake ou `UnicodeDecodeError` non géré.
- **Virgule décimale / séparateur de milliers** : aucun (`engine.py:210-211`). `1 234,56` reste une chaîne ; toutes les agrégations DuckDB cassent silencieusement.
- **Séparateur CSV** : sniffé automatiquement (`sep=None, engine="python"`). Le bon. Mais aucun *override* utilisateur, aucun aperçu du résultat du sniffing.
- **Types** : inférés par pandas, mappés en 4 catégories grossières dans `_dtype_label` (`engine.py:214-224`). **L'utilisateur ne peut pas corriger le type** — il faut un bloc Calcul avec une formule.
- **Sortie CSV** : `df.to_csv(out_path, index=False)` (`engine.py:1736`) — UTF-8, `,`, `.`, ligne `\n`. **Non paramétrable**.
- **Signatures de cache** : `_node_signature` (back, `engine.py:158-175`) et `nodeDataSig` (front, `WorkflowEditor.jsx:31-53`) sont **équivalentes**, basées sur l'hex SHA-256 d'un JSON trié. Trois clés exclues : `label`, `description`, `locked`, `cache` côté back ; même chose côté front + `__dirty`. **Le `workflow_name` n'est pas dans la signature** — un renommage rebascule la cible disque des exports sans inval cache.
- **Reproductibilité** : déterministe pour `pivot/clean/cols/calc/filter/union/dedup` (pas de `random`, pas de timezone). `_run_dedup` a un *fallback* qui désordonne le résultat si les valeurs sont non comparables (`engine.py:388-391`). `_run_pivot` dépend de l'ordre des index pandas — stable sur les versions actuelles.

---

## 1. Encodage

### 1.1 Lecture (sources & inputs)

`_read_source` (`engine.py:202-211`) :

```python
def _read_source(path, sheet, header_row: int) -> pd.DataFrame:
    ext = path.suffix.lower()
    hr = int(header_row or 0)
    if ext in _EXCEL_EXT:
        return pd.read_excel(path, sheet_name=(sheet or 0), skiprows=hr)
    if ext == ".parquet":
        return pd.read_parquet(path)
    if ext in (".tsv", ".txt"):
        return pd.read_csv(path, sep="\t", skiprows=hr)
    return pd.read_csv(path, sep=None, engine="python", skiprows=hr)
```

`grep "encoding="` dans `engine.py` → **aucune occurrence**. Toutes les autres `encoding=` du backend sont sur le JSON de configuration (`storage.py`), pas sur les données.

**Conséquences** :
- pandas part en UTF-8 par défaut sur les CSV/TSV/TXT.
- Un CSV exporté par Excel FR (encodage CP1252/Latin-1) :
  - en lecture *stricte* → `UnicodeDecodeError` non capté → 500.
  - en lecture *lax* (pandas remplace par `�`) → mojibake silencieux (`Garçon` → `Gar??on`).
- L'utilisateur **ne peut pas surcharger** l'encodage : `data.source.cache/sheet/header_row` sont les seuls champs (`WorkflowEditor.jsx:121`).

> **Note de reproduction.** Un `.csv` produit par Excel FR avec accents et `;` comme séparateur déclenche l'erreur ou le mojibake. Tester : `notepad → "Garçon;42\nÉcole;1"` enregistré en `ANSI` → ouvrir comme Source.

### 1.2 Écriture (Export)

`_run_export` (`engine.py:1733-1742`) :

```python
if fmt == "csv":
    out_path = out_dir / f"{fn}.csv"
    df.to_csv(out_path, index=False)
else:
    out_path = out_dir / f"{fn}.xlsx"
    df.to_excel(out_path, index=False)
```

- CSV : UTF-8 (défaut pandas), virgule comme séparateur, `\n` comme fin de ligne (sur Windows pandas peut ajouter `\r\n` selon la version). **Aucun BOM** → Excel FR n'autodétecte pas l'UTF-8 et affiche du mojibake.
- XLSX : binaire openpyxl, sans option de formatage cellulaire.
- **Aucune option côté UI** : `ExportConfig` (`Inspector.jsx:1421+`) propose `filename`, `format`, `auto_name`, `enabled`, `to_workbook` — ni encodage, ni séparateur, ni BOM.

> **Note de reproduction.** Exporter en `.csv` un tableau contenant des accents → l'ouvrir dans Excel FR → accents cassés.

---

## 2. Séparateur, décimales, milliers, dates

### 2.1 Sniffing du séparateur CSV

`pd.read_csv(path, sep=None, engine="python", skiprows=hr)` (`engine.py:211`).

- `sep=None` + `engine="python"` active le **sniffer csv** standard library (`csv.Sniffer`).
- Avantage : marche sur `,`, `;`, `\t`, `|` sans config.
- Inconvénients :
  - Le sniffer échoue silencieusement sur un fichier d'1 seule colonne : il choisit *un* caractère ASCII présent dans le contenu, ce qui peut casser des champs textuels.
  - Sur un fichier ambigu (`Nom;Prénom\nDupont,Jean`), il peut choisir `,`.
  - **Aucun feedback** à l'utilisateur : le séparateur retenu n'apparaît nulle part.

> **Note de reproduction.** CSV à une seule colonne mais lignes longues contenant des virgules dans le texte (`"Description,longue,avec virgules"\n"Autre"\n`) → certaines lignes sont sniffées comme multi-colonnes.

### 2.2 Virgule décimale

`pd.read_csv` n'a **aucun `decimal=','`** dans `engine.py`. Pour un CSV FR : un nombre `12,5` est lu comme la chaîne `"12,5"`, et la colonne est typée `VARCHAR` côté `_dtype_label` (`engine.py:224`).

Conséquences en cascade :
- **SQL builder** : `SUM("col")` sur du `VARCHAR` retourne `0` ou lève selon DuckDB.
- **Calc** : `[col] + 1` échoue (les opérateurs de `formula.py` attendent du numérique).
- **Pivot agg** `SUM` : retourne `null`/`0`.
- **Profil de colonne** : pas de stats numériques (pas de `min/max/avg`).

Aucun signal n'avertit l'utilisateur. Le résultat de la chaîne est *faux mais silencieux*.

> **Note de reproduction.** Un CSV `Article;Prix\nA;12,5\nB;7,3` exporté d'Excel FR → bloc Pivot avec `value_column = Prix`, `agg = SUM` → résultat `0` (au lieu de `19.8`). Aucune erreur affichée.

### 2.3 Séparateur de milliers

Idem : pas de `thousands=' '` ni `thousands='.'`. Un export Excel FR comme `1 234,56` :
- s'il est sauvé en CSV, devient la chaîne `"1 234,56"` (l'espace insécable ` ` parfois utilisé par Excel FR perturbe encore plus le sniffer).

### 2.4 Dates

`pd.read_csv` par défaut **ne parse pas les dates** (depuis pandas 2.x, `parse_dates=False`). Les colonnes datées restent en `VARCHAR`. `pd.read_excel` parse les dates **uniquement** si Excel les a stockées en *Date* — un Excel stocké en texte reste en texte. Aucune option utilisateur n'existe pour forcer le parsing (`Inspector.jsx` n'a ni `date_format=`, ni `parse_dates=`).

> **Note de reproduction.** Un Excel avec une colonne « Date » stockée en texte au format `JJ/MM/AAAA` est lue en `VARCHAR` ; tri chronologique impossible sans un bloc Calc qui force `STRPTIME(...)`.

---

## 3. Inférence et coercition de types

### 3.1 Comment Roade « voit » les types

- Au niveau **pandas** : `df.dtypes` est l'oracle.
- `_dtype_label(dt)` (`engine.py:214-224`) regroupe en 4 catégories : `BIGINT`, `DOUBLE`, `BOOLEAN`, `TIMESTAMP`, sinon `VARCHAR`.
- Côté UI, ce label apparaît dans les *checklists* typées (Dedup, Pivot, Cols, Analyse) et dans le profil de colonne (`DataPreview.jsx:169, 214`).

### 3.2 L'utilisateur peut-il corriger un type ?

- **Source** : non. Pas d'option « lire cette colonne comme nombre / date / texte ».
- **Nettoyage** : oui — l'opération `to_number`/`to_text`/`to_date` existe dans la liste `_CLEAN_LABELS` (`engine.py:1169-1175`) et chaque conversion remonte les `failed` dans le `clean_report` (cf. `DataPreview.jsx:235-263`). C'est la **seule** voie de remédiation.
- **Calc** : oui, indirectement, via une formule. Pas d'API « cast ».

Le détour par un bloc Nettoyage est lourd pour un cas qui devrait être réglé à la lecture (P12). Et pour un fichier déjà typé en `VARCHAR` à cause d'une virgule décimale (§ 2.2), il faut savoir qu'il faut ajouter ce bloc — connaissance non guidée.

### 3.3 Types côté DuckDB

`_run_sql` enregistre les `DataFrame` dans DuckDB via `con.register(alias, df)` (`engine.py:338`). DuckDB hérite des dtypes pandas. Aucun cast automatique. Les opérations DuckDB sont strictes — `'12,5' + 1` lèvera une erreur explicite.

---

## 4. Valeurs nulles, en-têtes, fusions

### 4.1 Valeurs nulles

- `_is_null(v)` (`engine.py:86-87`) couvre `None`, `float('nan')`, `pd.NaT`.
- **Validation** : les nulls sont *exclus* des comparaisons (`engine.py:540, 1438-1445`). Une ligne avec NaN sur la colonne ciblée est traitée comme « non conforme » selon la règle (à confirmer par bloc).
- **Filtre** : `main_keep_mask &= main[c].notna()` (`engine.py:1438-1445`) — une ligne avec NaN dans une colonne comparée n'a **jamais** de match, donc est **exclue** en mode `keep` (et **gardée** en mode `exclude`). Comportement choisi, mais non documenté à l'écran.
- **Aperçu** : un null s'affiche comme `vide` en italique (`DataPreview.jsx:148`, `BlockEditor.jsx:160`). Cohérent.

### 4.2 Noms de colonnes en double

- **Source** : pandas dé-duplique automatiquement (`col`, `col.1`, …). Pas de warning visuel.
- **Cols** : la vérification explicite `out_names.count(n) > 1` (`engine.py:1477-1479`) lève « noms de colonnes en double après renommage ». ✅ post-runtime, pas pré-validation.
- **SQL builder** : pas vérifié visuellement non plus.
- **Pivot** : `pt.columns = [str(c) for c in pt.columns]` (`engine.py:1165`). Si deux modalités produisent des colonnes de même nom string-cast, **collision silencieuse** — la deuxième écrase la première dans `out.columns`.

> **Note de reproduction.** Pivot sur une colonne numérique contenant `1` et `1.0` (pandas peut les stringifier identiquement après agg) → collision possible.

### 4.3 En-têtes multi-lignes

- L'UI propose `header_row` (1-based dans l'UI, 0-based dans pandas via `skiprows=hr`). Pas de support d'en-têtes **multi-lignes** : si l'en-tête s'étale sur 2 lignes, l'utilisateur doit choisir la 2ᵉ et perdre l'info de la 1ʳᵉ.
- Pas de gestion des **MultiIndex** côté pandas → tout est aplati.

### 4.4 Cellules fusionnées (Excel)

- `pd.read_excel(...)` ne déplie **pas** les cellules fusionnées : la valeur de la cellule fusionnée n'apparaît que dans la première ligne, les autres lignes ont `NaN`. Comportement pandas standard.
- Aucune option Roade pour « propager vers le bas » (`ffill`). L'utilisateur doit ajouter un bloc Nettoyage avec `fill` (à vérifier dans `_CLEAN_LABELS`).

> **Note de reproduction.** Un Excel typique « cellules fusionnées sur la 1ʳᵉ colonne pour grouper » → résultats `NaN` sur les lignes 2..N de chaque groupe.

### 4.5 XLSX corrompu / Excel ancien

- `pd.read_excel` lève une `BadZipFile`/`InvalidFileException` → `engine.py` ne capture pas spécifiquement → `main.py` enveloppe en 400 (`# noqa: BLE001`).
- Aucun message pédagogique (« fichier Excel corrompu ») — l'utilisateur voit l'erreur openpyxl brute.

---

## 5. Gros fichiers

### 5.1 Lecture en mémoire

- `pd.read_excel` et `pd.read_csv` (en mode python sniffer) chargent **tout en mémoire**. Pas de streaming, pas de chunking, pas de Lazy.
- DuckDB charge ensuite la `DataFrame` enregistrée (`con.register(alias, df)`) — DuckDB lit la mémoire pandas zéro-copie via PyArrow, mais le pic mémoire reste le DataFrame.
- Pour un Excel de **plusieurs centaines de Mo**, l'app fige le backend pendant la lecture.

### 5.2 Cap d'aperçu (preview)

- `preview_node(..., limit=200, offset=0)` (`engine.py:2339+`).
- Côté UI, le composant `DataPreview` paginé par 200 (`DataPreview.jsx:5`), `BlockEditor` montre 40 lignes condensées (`BlockEditor.jsx:106`).
- Le profil de colonne cap à **200 valeurs distinctes** (`engine.py:1106-1138`) avec drapeau `truncated:true`.

### 5.3 Mémoire à l'écriture

- `df.to_csv` et `df.to_excel` écrivent en mémoire puis fsync. Pas de streaming.
- Excel a une limite native de **1 048 576 lignes / 16 384 colonnes**. **Aucun garde-fou côté Roade** : `df.to_excel` lèvera une `IllegalCharacterError`/`ValueError` après tout le calcul.

> **Note de reproduction.** Exécuter un workflow qui produit ≥ 1 048 577 lignes et l'exporter en `.xlsx` → erreur après le calcul complet.

---

## 6. Correction du cache : la signature est-elle complète ?

### 6.1 Comment la signature est calculée

**Backend — `_node_signature`** (`engine.py:158-175`) :

```python
_SIG_DROP_KEYS = {"test_samples"}                       # UI-only, dropped at any depth
_SIG_DROP_TOP = {"label", "description", "locked", "cache"}  # cosmetic / handled apart

def _node_signature(pid, node, upstream_sigs) -> str:
    d = {k: v for k, v in (node.get("data") or {}).items() if k not in _SIG_DROP_TOP}
    payload = json.dumps(_clean_for_sig(d), sort_keys=True, ensure_ascii=False, default=str)
    h = hashlib.sha256()
    h.update(node["type"].encode("utf-8"))
    h.update(b"\x00")
    h.update(payload.encode("utf-8"))
    if node["type"] == "source":
        h.update(b"\x00")
        h.update((_source_fingerprint(pid, node) or "").encode("utf-8"))
    for s in sorted(upstream_sigs):
        h.update(b"\x00")
        h.update(s.encode("utf-8"))
    return h.hexdigest()
```

Cela couvre :
- Le **type** du bloc.
- Toute la `data` du bloc (sauf clés `_SIG_DROP_TOP` + `test_samples` à toute profondeur).
- Le **fingerprint** du fichier source : `file|sheet|header_row|size|mtime_ns` (`engine.py:128-140`).
- Toutes les signatures **amont** (Merkle-style).

**Frontend — `nodeDataSig`** (`WorkflowEditor.jsx:31-53`) :

```js
const SIG_IGNORE_TOP = new Set(['label', 'description', 'locked', 'cache', '__dirty'])
function cleanForSig(o) { /* drop test_samples deep */ }
function nodeDataSig(data) { /* stableStringify with sorted keys */ }
```

Aligné sur le backend (les mêmes clés exclues), mais **le hash est un JSON brut, pas un SHA-256**. Côté front, le but est seulement le diff stale/clean ; le `nodeDataSig` n'est jamais comparé entre backend et frontend.

### 6.2 Trous identifiés

| Trou | Code | Impact |
|---|---|---|
| **`workflow_name` non inclus** dans la signature | `engine.py:158-175` (jamais lu) | Si l'utilisateur renomme le workflow, le dossier d'export change (`workflow_export_dir`, `storage.py:101-102`) mais le **bloc Export reste « cache hit »** (pas de handle, donc pas de cache à invalider — mais ses *fichiers de sortie* peuvent traîner dans l'ancien dossier). |
| **`_source_fingerprint` ignore l'encodage / les options de lecture futures** | `engine.py:128-140` | Si on ajoute un jour `encoding=` à la config Source, il faudra le mettre dans la fingerprint — sinon cache hit avec décodage différent. À surveiller. |
| **Signature ignore les changements de version de DuckDB / pandas** | `engine.py` | Un upgrade de DuckDB qui change la précision flottante pourrait servir un parquet « périmé sémantiquement » comme cache. Risque très faible mais non géré. |
| **Signature stocke les outputs du parent par `targetHandle`** (`engine.py:189-190`) | `f"{e.get('targetHandle') or 'in'}<-{src}:{e.get('sourceHandle') or 'out'}#{sigs.get(src, '')}"` | Bonne pratique. Mais : si une `edge` ajoute un `id` (pas de changement de routage), `e.get('id')` n'est *pas* dans la signature — donc un *re-créé* le même routage sera identique. Cohérent. |
| **`prune_orphan_edges` côté `save_workflow`** (`main.py:217`) garantit que la signature ne dépend pas d'arêtes mortes | OK | Sans ce nettoyage, une arête fantôme ferait *muter* la signature à chaque sauvegarde. |
| **Le `cache: false` côté node** désactive le cache mais **n'invalide pas** le parquet existant — `_execute_node` (`engine.py:2148-2152`) regarde `node["data"].get("cache", True) is not False` pour décider du reuse. Si l'utilisateur coche/décoche `cache` rapidement, le parquet reste mais le node se ré-exécute. ✅ |
| **Les `locked` blocks gèlent leur signature** (`engine.py:192-197`) en lisant la signature *écrite* dans la meta. Si le parquet a été altéré hors Roade (édition manuelle), la signature stockée mentira. Tester avec `assertion` d'intégrité du parquet → pas faite. |

### 6.3 Vérification d'intégrité du parquet

- Aucune vérification de checksum sur les parquets entre runs.
- `_meta_from_parquet` (`engine.py:2084-2101`) recalcule `row_count`/`columns`/`sample` à chaque écriture, mais ne stocke pas de digest.
- Si un parquet est manuellement écrasé sur disque (cas pratique : utilisateur copie un parquet d'ailleurs), la signature stockée dans la meta ne s'aligne plus — sera resservi tel quel.

> **Note de reproduction.** Verrouiller un bloc Source ; remplacer manuellement son parquet sur disque (`projects/<pid>/data/<wid>/<nid>.parquet`) → le run suivant servira le mauvais parquet comme cache de la « bonne » signature.

---

## 7. Déterminisme & reproductibilité

### 7.1 Code

- **Aucune utilisation de `random`** dans `engine.py` (vérifié).
- **Aucun appel `datetime.now()`** dans les runners (pour les calculs ; uniquement pour stamps de logs si présents — non vu).
- **Aucun appel `pd.Timestamp.now()`**.
- → un même workflow, sur le même fichier, donne le **même parquet bit-à-bit** (modulo `mtime_ns` du fichier source) — bonne base P13.

### 7.2 Floats

- pandas/DuckDB utilisent IEEE-754 double. Toutes les agrégations sont déterministes **sur la même version**. Une mise à jour de DuckDB peut changer l'ordre de sommation interne pour les `SUM` parallélisés → écart de ULP possible.
- `_run_dedup` (`engine.py:357-396`) avec types mixtes non comparables : *fallback* `TypeError` (`engine.py:388-391`) **change l'ordre** du tri — résultat différent du chemin nominal.
- `_run_pivot` (`pd.pivot_table`) : déterministe si l'index pandas est stable. Quand `sort=True` par défaut, ordre des colonnes alphabétique.

### 7.3 Historique des runs

Pas d'historique persisté. Voir 05 § constat #32 et 07 § 4.

---

## 8. Validation des sorties (à l'écriture)

- **`_sanitize_filename`** (référencé `engine.py:1717`) — à confirmer mais probablement strip des caractères Windows-illégaux.
- **`_sanitize_sheet_name`** (`engine.py:1702-1705`) — strip `[]:*?/\\`, limite à 31 chars, fallback `Feuille`. ✅
- **Désambiguïsation des noms de feuilles** (`_write_workbook`, `engine.py:1745-1772`) en mode multi-sheets : `_2`, `_3`… ajoutés en cas de collision. ✅
- **Aucun garde-fou** sur la taille du fichier final.
- **Aucune garantie** que les caractères Unicode non-BMP (emoji) survivent à `to_excel` → openpyxl ne les écrit pas correctement.

---

## 9. Synthèse — priorisation par exposition utilisateur

| # | Risque | Sévérité | Probabilité (FR) |
|---|---|---|---|
| 1 | CSV FR mal lu (encodage + décimale + milliers) | **B** silencieux | **Élevée** : tout export Excel FR enregistré en CSV |
| 2 | Export CSV illisible dans Excel FR (UTF-8 sans BOM + `,`) | **M** | **Élevée** |
| 3 | Excel multi-lignes / cellules fusionnées non gérées | **M** | Élevée |
| 4 | Inférence de type non corrigible à la source | M | Élevée |
| 5 | Excel > 1 048 576 lignes : échec d'écriture tardif | M | Moyenne (gros workflows) |
| 6 | Parquet remplacé hors Roade servi comme cache | m | Faible (cas exotique) |
| 7 | Sniffer CSV trompé par un CSV à 1 colonne | m | Moyenne |
| 8 | Pivot collision de colonnes (`1` vs `1.0`) | m | Faible |
| 9 | XLSX corrompu → message non pédagogique | m | Faible |

**Le risque #1 est le seul vrai bloquant pour un outil FR**. Il a deux traits :
- **silencieux** : aucune erreur visible, le calcul *semble* fonctionner ;
- **corrupteur** : la mauvaise lecture pollue tout l'aval (somme = 0, SQL en `VARCHAR`, profil sans stats).

C'est l'angle « confiance dans l'outil » mentionné dans le guide ; un seul cas mal lu et l'utilisateur cesse de se fier à Roade pour le quotidien.
