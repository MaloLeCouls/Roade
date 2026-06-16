# 01 — Architecture & inventaire

> Constat factuel de la structure du dépôt à `4eda611` sur `main`. Toutes les références sont en `chemin/fichier:ligne`.

---

## 1. Stack & build

### Backend Python

`backend/requirements.txt` (lignes 1-7) — versions **minimales** (jamais épinglées exactement, pas de `lock`) :

| Paquet | Contrainte | Rôle |
|---|---|---|
| `fastapi` | `>=0.115` | serveur HTTP + auto-doc OpenAPI |
| `uvicorn[standard]` | `>=0.34` | ASGI runtime |
| `duckdb` | `>=1.3.2` | moteur SQL embarqué (filtrage, jointures, agrégats du bloc SQL) |
| `pandas` | `>=2.3.2` | manipulations colonnaires non couvertes par DuckDB |
| `openpyxl` | `>=3.1.5` | lecture/écriture xlsx |
| `pyarrow` | `>=18` | format Parquet (matérialisation par bloc) |
| `python-multipart` | `>=0.0.20` | upload de fichiers FastAPI |

Aucun `Pipfile`, `pyproject.toml`, `poetry.lock`, `uv.lock` ou équivalent dans le dépôt (vérification : seul `requirements.txt` existe sous `backend/`). Aucun outil de format/lint Python configuré.

### Frontend Node

`frontend/package.json` (intégralement, 21 lignes) :

```json
{
  "dependencies": {
    "@xyflow/react": "^12.3.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.5"
  },
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" }
}
```

**Manquent structurellement** au niveau dépendances : pas de routeur (`react-router-dom` / équivalent), pas de lib d'état (`zustand`, `redux`, …), pas de lib de requêtes (`react-query`, `swr`), pas de lib de composants (`radix-ui`, `headless-ui`, …), pas de TypeScript (`typescript`, `@types/*`), pas de tests (`vitest`, `@testing-library/*`), pas de linter/formatter (`eslint`, `prettier`).

### Lancement

| Mécanisme | Fichier | Constat |
|---|---|---|
| Script tout-en-un | `start.ps1` (18 lignes), `start.bat` (15 lignes) | **Windows-only**. Lance uvicorn + Vite. Pas d'équivalent shell Unix. |
| Backend manuel | `README.md:65` | `.\backend\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --port 8000` |
| Frontend manuel | `README.md:67` | `cd frontend ; npm run dev` |
| Install | `README.md:73-75` | `py -m venv backend\.venv && pip install -r backend\requirements.txt && npm install --prefix frontend` — 3 commandes, **Windows** (`py` launcher). |
| Releases | `package.json:4`, dépôt GitHub | « No releases published ». `version: "0.1.0"`. |
| CI | absente | Aucun dossier `.github/workflows/` (vérifié — la commande retourne aucune entrée). |

---

## 2. Carte des modules

### Backend (`backend/`)

| Fichier | LOC | Rôle | Complexité | Dépendances internes |
|---|---:|---|---|---|
| `engine.py` | **2 472** | Exécution du graphe + 13 runners de blocs + preview/profile/route-preview/split-scan + cache. | **élevée** | `storage`, `query_builder`, `formula` |
| `workflow_doc.py` | **1 007** | Export Excel « Documenter » : retracer le lignage par sortie. | élevée | `storage`, `engine` (via import au runtime) |
| `main.py` | 338 | API FastAPI ~30 routes, montée fine sur `engine`/`storage`/`workflow_doc`. | moyenne | `storage`, `engine`, `workflow_doc` |
| `formula.py` | 319 | Compilation des formules style Excel du bloc Calcul. | moyenne | — |
| `storage.py` | 231 | Persistance disque (projets / workflows / parquets / meta), arborescence fixe. | faible | — |
| `query_builder.py` | 224 | Traduction modèle visuel SQL → SQL DuckDB. | moyenne | — |
| `_test_*.py` | 49–137 chacun | **Scripts ad-hoc** (pas un framework de tests). | faible chacun, hétérogènes | `engine` |
| `_selftest.py` | 67 | Test d'amorçage. | faible | — |

Total backend hors tests : **~4 591 LOC** ; tests ad-hoc : **~582 LOC**.

### Frontend (`frontend/src/`)

| Fichier | LOC | Rôle | Complexité | Dépendances |
|---|---:|---|---|---|
| `components/Inspector.jsx` | **1 479** | 13 composants `*Config` (un par bloc) dans un seul fichier. | **élevée — monolithique** | `validateHelpers`, `api`, `routing`, `Icon` |
| `components/WorkflowEditor.jsx` | **1 156** | Canevas React Flow + run streaming + état complet de l'éditeur. | **élevée — monolithique** | nœuds, `BlockEditor`, `DataPreview`, `WorkflowFlow`, `api` |
| `components/routing.jsx` | 936 | Vue droite spécifique au bloc Validation : flow map, sorties, distribution dry-run. | élevée | `api`, `validateHelpers`, `Icon` |
| `styles.css` | **868** | **Fichier CSS unique** pour toute l'app. | n/a | — |
| `components/BlockEditor.jsx` | 453 | Modale plein écran : à gauche Inspector, à droite preview/OutputsPane. | moyenne | tous les `*Config`, `routing`, `DataPreview` |
| `components/DataPreview.jsx` | 346 | Aperçu paginé + profil colonne + filtres. | moyenne | `api`, `Icon` |
| `components/QueryBuilder.jsx` | 278 | Constructeur visuel du SELECT/WHERE/JOIN du bloc SQL. | moyenne | — |
| `components/validateHelpers.js` | 182 | Constantes + utilitaires du bloc Validation (extracteurs, regex, normalisation). | faible | — |
| `components/WorkflowFlow.jsx` | 165 | Vue d'ensemble « Carte des flux » (modale). | faible | — |
| `components/ProjectView.jsx` | 162 | Liste fichiers + workflows d'un projet. | faible | `api` |
| `api.js` | 124 | Client HTTP unique pour toutes les routes. | faible | — |
| `App.jsx` | 65 | Racine + machine à états `view` + breadcrumb. | faible | les trois vues |
| `Icon.jsx` | 62 | Bibliothèque d'icônes SVG inline. | faible | — |
| `ProjectList.jsx` | 61 | Liste de projets. | faible | `api` |
| `ErrorBoundary.jsx` | 39 | Capture d'exception React. | faible | — |
| `editorContext.js` | 13 | Contexte React (status/onPreview/onRunNode…) consommé par les nœuds. | faible | — |
| `ButtonEdge.jsx` | 27 | Arête personnalisée avec bouton de suppression. | faible | — |
| `nodes/*.jsx` (14) | 25–63 | Un composant React par type de bloc. | faible | `editorContext`, `Icon` |

Total frontend (LOC totales sur les chemins ci-dessus + nodes) : **~6 010 LOC** de JSX/JS + **868 lignes CSS**.

### Signaux monolithiques

- `Inspector.jsx` à 1 479 lignes et `WorkflowEditor.jsx` à 1 156 lignes concentrent **44 %** du code JSX (2 635 / 6 010 LOC). Aucune décomposition par type de bloc côté Inspector — tout est dans un seul fichier sous forme de fonctions `*Config`. Identifié dans `02_BLOCK_CATALOG.md` comme dépendance commune.
- `engine.py` à 2 472 lignes concentre **54 %** du code Python (2 472 / 4 591 LOC). Tous les runners cohabitent.

---

## 3. Modèle de données runtime

### Sur disque

`backend/storage.py:3-14` (docstring) décrit l'arborescence :

```
projects/
  <project_id>/
    project.json
    files/              (sources uploadées)
    workflows/<wid>.json
    data/<wid>/
      <node_id>.parquet
      <node_id>__<handle>.parquet     (handles secondaires)
      <node_id>.meta.json
    exports/<workflow_name>/          (sorties Excel/CSV)
```

`.gitignore` exclut `projects/`, `backend/.venv/`, `frontend/node_modules/`, `frontend/dist/`. Les projets ne quittent jamais la machine.

### Schémas JSON

**Projet** (`storage.py:66-68`) :
```json
{ "id": "string-slug", "name": "string", "created_at": 1734000000.0 }
```

**Workflow** (`storage.py:134`, exemple réel `projects/codif-sermatec/workflows/582acec9.json:1-4`) :
```json
{ "id": "8-hex", "name": "string", "nodes": [...], "edges": [...] }
```

**Nœud** — structure réelle observée (`projects/codif-sermatec/workflows/582acec9.json:5-19`, et `frontend/src/components/WorkflowEditor.jsx:1040-1043` pour `stripNodes`) :
```json
{
  "id": "source-petmp1",
  "type": "source",
  "position": { "x": -753.45, "y": 67.76 },
  "data": { "label": "Source", "file": "...", "sheet": "", "header_row": 0, "cache": true },
  "parentId": "<optional, pour Bouchon collé>"
}
```
- `id` : chaîne `<type>-<6hex>`.
- `type` : un des 14 types (voir `02_BLOCK_CATALOG.md`).
- `data` : forme dépendante du type — référence faisant foi : `DEFAULT_DATA` dans `frontend/src/components/WorkflowEditor.jsx:120-145`.
- `parentId` : présent uniquement pour les Bouchons collés depuis le commit `7449912`.

**Arête** (extrait `projects/codif-sermatec/workflows/582acec9.json` au-delà des edges) :
```json
{
  "id": "xy-edge__validate-tztfcginvalid-validate-syj7tuin",
  "type": "deletable",
  "source": "validate-tztfcg",
  "sourceHandle": "invalid",
  "target": "validate-syj7tu",
  "targetHandle": "in",
  "animated": true
}
```
`sourceHandle` peut référencer une sortie nommée (validate route : `valid`/`invalid`/`else`/`<custom>`, dedup : `kept`/`dups`/`uniques`, …). `targetHandle` vaut `"in"` partout sauf Filtre qui expose deux ancres `in`/`ref` (voir `frontend/src/components/nodes/FilterNode.jsx:11-15`).

### Materialisation par nœud

`backend/storage.py:169-181` :
- `node_parquet(pid, wid, nid, handle)` → `data/<wid>/<nid>__<handle>.parquet` (`out` → suffixe vide pour la rétro-compat).
- `node_meta_path(...)` → `.meta.json` jumelé avec colonnes / `row_count` / sample.
- `prune_node_outputs(...)` (`storage.py:200-231`) supprime les Parquet/Meta dont la `handle` n'est plus exposée — c'est le côté disque du nettoyage des sorties Validate route déplacé dans le commit `3634ebe`.

---

## 4. Surface API

Source faisant foi : `backend/main.py`. **30 routes** + une route santé.

| Méthode | Chemin | Rôle | Paramètres | Réponse |
|---|---|---|---|---|
| GET | `/api/health` | sonde | — | `{ok:true}` |
| GET | `/api/projects` | liste des projets | — | `[{id,name,created_at}]` |
| POST | `/api/projects` | crée un projet | body `{name}` | `{id,name,created_at}` |
| GET | `/api/projects/{pid}` | détail projet | path `pid` | `{id,name,created_at,dir}` |
| DELETE | `/api/projects/{pid}` | supprime projet (recursif) | path `pid` | `{ok:true}` |
| GET | `/api/projects/{pid}/files` | liste sources + exports (un seul appel) | path `pid` | `[{name,size,origin,subdir?}]` |
| POST | `/api/projects/{pid}/files` | upload (`multipart/form-data`) | body `file` | `{name,size}` |
| GET | `/api/projects/{pid}/files/{name}` | téléchargement | query `subdir?` | flux fichier |
| DELETE | `/api/projects/{pid}/files/{name}` | suppression | query `subdir?` | `{ok:true}` |
| POST | `/api/projects/{pid}/files/{name}/open` | ouvre dans l'OS (Excel, etc.) | query `subdir?` | `{ok:true}` |
| POST | `/api/projects/{pid}/files/open-folder` | ouvre le dossier dans l'explorateur OS | query `subdir?` | `{ok:true}` |
| GET | `/api/projects/{pid}/peek` | en-tête d'un fichier (sheets/columns) | query `file, sheet?, header_row?` | `{sheets,columns}` |
| GET | `/api/projects/{pid}/workflows` | liste workflows | path `pid` | `[{id,name}]` |
| POST | `/api/projects/{pid}/workflows` | crée workflow | body `{name?}` | `{id,name,nodes:[],edges:[]}` |
| GET | `/api/projects/{pid}/workflows/{wid}` | charge workflow | path | `{id,name,nodes,edges}` |
| PUT | `/api/projects/{pid}/workflows/{wid}` | sauve workflow (avec `prune_orphan_edges`) | body workflow complet | workflow sauvé |
| DELETE | `/api/projects/{pid}/workflows/{wid}` | supprime workflow + dossier `data/<wid>` | path | `{ok:true}` |
| POST | `/api/projects/{pid}/workflows/{wid}/run` | exécute (legacy, synchrone) | query `only_node?` | `{ran,results}` |
| GET | `/api/projects/{pid}/workflows/{wid}/document` | « Documenter » → xlsx | path | flux xlsx |
| GET | `/api/projects/{pid}/workflows/{wid}/run-stream` | **SSE** : événements `start/node_start/node_done/done/error` | query `only_node?, force?, all_exports?` | `text/event-stream` |
| GET | `/api/projects/{pid}/workflows/{wid}/nodes/{nid}/preview` | aperçu paginé (lignes, colonnes, tri, filtres) | query `handle?, limit?, offset?, sort?, dir?, q?, filters?` | `{available, columns, rows, row_count, total_count, ...}` |
| GET | `/api/projects/{pid}/workflows/{wid}/nodes/{nid}/profile` | profil d'une colonne | query `column, handle?` | profil détaillé |
| GET | `/api/projects/{pid}/workflows/{wid}/nodes/{nid}/group` | drill-down « Clés multiples » | query `key, q?, handle?, limit?` | `{rows}` |
| POST | `/api/projects/{pid}/workflows/{wid}/nodes/{nid}/route-preview` | dry-run distribution Validate (sans matérialisation) | body config Validate | `{total, counts:{handle:count}}` |
| POST | `/api/projects/{pid}/workflows/{wid}/nodes/{nid}/split-scan` | scan des valeurs distinctes (mode Éclater) | body config Validate | `{values, samples, distinct, truncated, total}` |
| POST | `/api/validate/test` | testeur autonome (lignes en clair → verdict) | body `{config, samples}` | `{ok, results|error}` |

### Constats sur l'API

- **CORS très large** : `main.py:27-32` autorise `allow_origins=["*"]`, `allow_methods=["*"]`, `allow_headers=["*"]`. Pour une app *locale* c'est sans conséquence pratique ; pour le futur Web/SaaS c'est un défaut par défaut explicite à corriger.
- **Pas de versioning d'API** (`/api/...` direct, sans `/api/v1`).
- **Pas d'authentification**. Cohérent avec « local-only », à rendre explicite quand on parlera d'évolutions.
- **Ouverture OS**. Les routes `open` et `open-folder` invoquent `os.startfile` / `xdg-open` / `open` (`main.py:137-145`). La protection contre l'évasion de chemin existe (`_resolve_file`, `main.py:75-89`) mais elle est par dossier (sources vs exports), pas une signature solide.
- **`run-stream`** est la version utilisée en pratique (`api.js:106` côté front), la route POST `/run` synchrone reste dans le code (`main.py:230`).
- Les erreurs métier sont systématiquement reconverties en `HTTPException(400, str(e))` (`main.py:185, 234, 248, 295, 303, 321, 329`) — pratique pour le front (un message texte), perte d'information typée (pas de codes d'erreur).

---

## 5. Navigation actuelle

`frontend/src/App.jsx` (intégral) :
- État de vue : `useState({ name: 'projects' })` (`App.jsx:9`).
- Trois vues mutuellement exclusives : `{name:'projects'}` (liste), `{name:'project',pid}` (un projet), `{name:'workflow',pid,wid}` (éditeur d'un workflow).
- Le breadcrumb (`App.jsx:41-65`) affiche `Projets / <nom-projet> / workflow`. **Le dernier segment est littéralement la chaîne `"workflow"`**, jamais le nom du workflow (constat ligne 60).

**Pas de routeur, pas d'URL.** Constats :
- Un `Ctrl+F5` ramène l'utilisateur sur la liste de projets quel que soit l'endroit où il était. (Pas de désérialisation depuis `location.pathname` / `?` / `#`.)
- Aucun moyen de partager un lien vers « ce projet, ce workflow, ce bloc ».
- Le bouton « ← Précédent » du navigateur ne fait rien d'utile : il sortirait de l'app sans changer la vue interne.

Cette absence est un signal P1 (« État adressable ») majeur et caractéristique.

---

## 6. Dépendances : ce qui manque structurellement

Récapitulatif inspiré du référentiel :

| Manque | Dépendances absentes | Effet observable | Principe |
|---|---|---|---|
| Routeur web | `react-router-dom`, `wouter`, … | `App.jsx:9` machine à états, pas de deep-link, F5 perd l'emplacement, breadcrumb statique. | P1 |
| Lib d'état côté front | `zustand`, `redux`, `jotai`, … | État central recopié dans `WorkflowEditor.jsx` avec 49 occurrences de hooks (`useState/useEffect/useMemo/useCallback/useRef`). | P4 |
| Couche de requêtes | `react-query`, `swr` | Tous les appels passent par `api.js` + `fetch` + `useState/useEffect` (`api.js:7-20`). Pas de cache HTTP, pas de déduplication, pas d'invalidation déclarative. | P4 |
| Lib de primitives UI | `radix-ui`, `headless-ui`, … | Aucune primitive React (Button/Input/Modal/Menu/Tabs/Tooltip). Tout est codé en `<div>`/`<button>` + classes CSS dans `styles.css`. | P2 |
| Typage | `typescript`, `@types/*`, ou `propTypes` | 0 fichier `.ts/.tsx`, 0 PropTypes (vérifié). | P3 |
| Tests front | `vitest`, `@testing-library/*` | 0 test côté front. | P3 |
| Tests back structurés | `pytest`, `pytest-cov` | 8 scripts `_test_*.py` exécutés manuellement, pas un framework. | P3 |
| Lint/Format | `eslint`, `prettier`, `ruff`, `black` | 0 config (aucun `.eslintrc*`, `.prettierrc*`, `pyproject.toml`, `.ruff.toml`). | P3 |
| CI | `.github/workflows/` | dossier inexistant. | P3 |
| Accessibilité tooling | `axe-core`, `@axe-core/react` | absent ; **17 occurrences** au total de `aria/role/tabIndex` dans tout le front. | P11 |
| i18n | `react-i18next`, … | chaînes en dur partout (sans tableau). Cohérent avec usage francophone unique pour l'instant. | hors P direct |

---

## 7. Ce qui est solide (rappel — à ne pas casser)

- Le contrat back/front est centralisé dans **un seul `api.js`** (124 lignes) — facile à refactorer en couche de requêtes.
- `engine.py` expose une API publique stable et documentée (`engine.py:8-14` docstring) : `iter_run_workflow` / `run_workflow` / `preview_node` / `column_profile` / `peek_source` / `validate_test`.
- `storage.py` reste petit (231 LOC) et son contrat disque est explicite via docstring de tête (`storage.py:3-14`).
- Migration de modèle déjà gérée : `prune_orphan_edges` côté backend (`engine.py:53-71`), renommage `group` → `frame` côté front (`WorkflowEditor.jsx:270`).
- Le streaming SSE est implémenté côté serveur sans abstraction lourde (`main.py:263-274`) et consommé proprement côté client via `EventSource` (`api.js:106-123`).
