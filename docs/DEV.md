# Roade — Guide développeur

Ce document s'adresse à qui veut **faire tourner Roade depuis les sources**,
contribuer ou comprendre l'architecture. Pour l'utilisation, voir le
[README](../README.md).

## Stack

Backend **FastAPI + DuckDB + pandas** (`backend/`) · Frontend **React + Vite +
React Flow / @xyflow** (`frontend/`). Application **locale** : un process
backend sert l'API (et, en prod, le frontend buildé) sur `localhost`. Pas de
SaaS multi-utilisateur (cf. roadmap, Track futur).

## Prérequis

- **Python ≥ 3.11**
- **Node ≥ 18**
- **[uv](https://docs.astral.sh/uv/)** (`py -m pip install uv` si absent)

## Installation

```powershell
uv sync                       # crée .venv\ + deps Python verrouillées (uv.lock)
npm install --prefix frontend # deps Node verrouillées (package-lock.json)
```

## Lancer en développement

```powershell
.\start.ps1                   # Windows : lance backend (:8000) + frontend (:5173)
```

Puis ouvrir <http://localhost:5173>. Le serveur Vite proxifie `/api` vers le
backend.

### Lancement manuel (tout OS)

```bash
# Backend
python -m uvicorn main:app --app-dir backend --port 8000
# Frontend (autre terminal)
cd frontend && npm run dev
```

> Sous Windows, remplacer `python` par `.\.venv\Scripts\python.exe`. Un
> lanceur multiplateforme (`start.sh`, packager) est prévu (roadmap G.1) ;
> en attendant, les deux commandes ci-dessus marchent partout.

## Mode production (un seul process)

```bash
npm run build --prefix frontend                          # produit frontend/dist/
python -m uvicorn main:app --app-dir backend --port 8000 # sert API + dist
```

Ouvrir alors <http://localhost:8000> — plus besoin de Vite. Si `frontend/dist/`
n'existe pas, le backend tourne quand même : seuls les `/api/*` répondent.

## API

L'API est servie sous **`/api/v1`** (versionnée pour pouvoir évoluer sans
casser) ; `/api` reste accepté en rétro-compat. Toute erreur est rendue sous la
forme `{code, message}` (le `code` est stable et machine-lisible — voir
`backend/errors.py`).

## Qualité (le filet)

```bash
# Backend
ruff check backend tests        # lint
ruff format --check backend tests
pytest                          # tests (FastAPI TestClient + engine)

# Frontend
npm --prefix frontend run lint          # ESLint
npm --prefix frontend run format:check  # Prettier
npm --prefix frontend test -- --run     # Vitest
```

La **CI GitHub Actions** rejoue lint + format + tests + build sur chaque push /
PR (`.github/workflows/ci.yml`). Un PR rouge bloque.

## Structure du dépôt

```
backend/
  main.py           API FastAPI (routes, versionnage /api/v1, enveloppe d'erreur)
  errors.py         erreurs typées {code, message}
  demo.py           projet de démonstration embarqué (G.2)
  storage.py        projets / workflows / fichiers sur disque
  engine.py         exécution du graphe (DuckDB), aperçu, profil
  query_builder.py  modèle visuel  ->  SQL DuckDB
  formula.py        formules style Excel  ->  SQL DuckDB
  workflow_doc.py   génération de la documentation Excel
frontend/
  src/components/   éditeur React Flow, blocs, aperçu
  src/components/ui/ primitives (Button, Modal, Field, ColumnPicker…)
  src/theme.ts      source unique des couleurs de type de bloc
tests/              pytest (isolation par tmp_path)
docs/               roadmap, contrat de bloc, audits, ce guide
projects/           données runtime (un dossier par projet, hors git)
```

## Données sur disque

Un **projet** = un dossier sous `projects/<id>/` : `files/` (sources
importées), `workflows/<wid>.json` (le graphe), `data/<wid>/` (un Parquet +
`.meta.json` par bloc matérialisé), `exports/` (fichiers de sortie). Tout se
recalcule en cascade, avec un cache incrémental par bloc (fingerprint des
entrées + config).

## Versions & releases

SemVer, `CHANGELOG.md` (rubrique `[Unreleased]` pendant le dev), `__version__`
exposé côté backend (`GET /api/v1/version`). Voir l'en-tête du CHANGELOG pour la
procédure de bump + tag.

## Roadmap

Le chantier « de l'amateur au pro » est décrit dans
[`docs/ROADE_ROADMAP_ETAPE3.md`](ROADE_ROADMAP_ETAPE3.md). Le **contrat de
bloc** (socle commun à tout bloc exécutable) est dans
[`docs/CONTRAT_BLOC.md`](CONTRAT_BLOC.md).
