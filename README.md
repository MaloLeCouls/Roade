# Roade

Web app de **workflows visuels** pour travailler des bases de données Excel/CSV
comme on le ferait en SQL — sans écrire une ligne de SQL.

On crée un **projet** (= un répertoire sur le disque), on importe ses fichiers,
puis on assemble des **blocs** reliés par leurs **ancres** d'entrée/sortie :

- **📥 Source** — lit un fichier Excel/CSV en mémoire (relu *frais* à chaque exécution).
- **🧮 SQL** — transforme les données via un **constructeur visuel** (SELECT, filtres,
  jointures, regroupements, agrégats, tri…) ou en SQL brut. Jusqu'à 2 entrées (`in1`, `in2`).
- **📤 Export** — écrit le résultat en `.xlsx` ou `.csv` dans le dossier du projet.

À chaque exécution, chaque bloc régénère sa version (fichier Parquet) en cascade.
Un clic sur 👁 ouvre un **aperçu** : colonnes + types, échantillon de lignes,
statistiques type `describe()`, et le SQL généré.

Moteur : **DuckDB** (SQL en mémoire, très rapide sur gros fichiers) + pandas.

## Démarrage rapide

```powershell
# Tout lancer (deux fenêtres : backend + frontend)
.\start.ps1
```

Puis ouvrir http://localhost:5173

### Lancement manuel

```powershell
# Backend
.\backend\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --port 8000

# Frontend (autre terminal)
cd frontend ; npm run dev
```

## Installation (déjà faite)

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install --prefix frontend
```

## Structure

```
backend/
  main.py           API FastAPI
  storage.py        projets / workflows / fichiers sur disque
  engine.py         exécution du graphe (DuckDB), aperçu, peek
  query_builder.py  modèle visuel  ->  SQL DuckDB
frontend/
  src/components/   éditeur React Flow, constructeur SQL, aperçu
projects/           données runtime (un dossier par projet)
```

## Données d'un projet

```
projects/<projet>/
  files/        fichiers sources importés + exports générés
  workflows/    <id>.json  (graphe : nodes + edges)
  data/<wf>/    <bloc>.parquet + <bloc>.meta.json  (versions matérialisées)
```

## Pistes V2

- Nouveaux blocs : pivot/unpivot, fusion de colonnes, nettoyage, dédoublonnage,
  formules, graphiques.
- Édition de cellules dans l'aperçu, recherche/filtre interactif.
- Plus de 2 entrées sur le bloc SQL ; sous-requêtes (un bloc SQL en alimente un autre — déjà possible en chaînant).
