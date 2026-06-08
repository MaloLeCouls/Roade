# Roade

Du breton "Roadenn", "Donnée" en français :)

Petite application web pour transformer des fichiers **Excel/CSV** en assemblant
des **blocs** sur un canevas — l'idée de ce qu'on ferait en SQL, mais sans écrire
de SQL.

On crée un **projet** (un dossier sur le disque), on importe ses fichiers, puis on
relie des blocs par leurs ancres d'entrée/sortie. Chaque bloc matérialise son
résultat (un fichier Parquet) ; tout se recalcule en cascade à l'exécution.

## Les blocs

- **Source** — lit un Excel/CSV.
- **SQL** — SELECT, filtres, jointures, regroupements, agrégats, tri, via un
  constructeur visuel (jusqu'à 2 entrées).
- **Doublons** — repère/sépare les doublons (gardés / doublons / uniques).
- **Validation** — classe les lignes selon des conditions (règles, masque
  positionnel, contrôle par groupe) vers une ou plusieurs sorties ; sert aussi de
  contrôle de conformité (conforme / non conforme).
- **Pivot** — pivote / dépivote.
- **Nettoyage** — opérations de nettoyage en série, avec rapport.
- **Calcul** — colonnes calculées par formules (style Excel), et fonctions par groupe.
- **Filtre** — ne garde (ou exclut) que les lignes dont une colonne figure dans la
  colonne d'un autre tableau (semi-jointure / anti-jointure ; la référence n'est
  pas fusionnée).
- **Colonnes** — réordonne, supprime et renomme les colonnes.
- **Analyse** — bloc d'information (non exporté, sans sortie) : fait un *état des
  lieux* des données. On ajoute des *analyses* qui ventilent une colonne selon un
  critère inspiré des filtres de la Validation — **valeurs**, **préfixe**,
  **suffixe**, **longueur**, ou le **respect d'une règle / d'un masque** — affichées
  en **camembert**, barres ou tableau. S'affiche au clic et apparaît dans la
  documentation Excel (avec graphiques natifs) — utile pour le reporting.
- **Union** — empile plusieurs entrées.
- **Export** — écrit le résultat en `.xlsx` ou `.csv` (ou comme feuille d'un classeur).
- **Cadre** — un rectangle pour regrouper visuellement des blocs (le déplacer
  déplace son contenu).

## Quelques fonctions utiles

- **Aperçu** d'un bloc : données, colonnes + types, statistiques, profil de colonne.
- **Verrou** : fige le résultat d'un bloc (utile pour une source lente).
- **Exécution** : barre de progression en direct. Le menu du bouton *Exécuter*
  propose *Tout recalculer* (ignore le cache) et *Super run* (génère aussi les
  exports désactivés).
- **Carte des flux** : vue d'ensemble, des sources aux exports.
- **Documenter (Excel)** : génère un classeur explicatif, lisible sans l'application —
  une feuille par fichier de sortie qui retrace, étape par étape, tous les traitements
  qui mènent à ce fichier (idéal pour présenter un workflow). Les conditions de
  Validation en « OU » sont regroupées (« vaut l'une des valeurs : … »).

## Démarrage rapide

```powershell
.\start.ps1          # lance backend + frontend
```

Puis ouvrir http://localhost:5173

### Lancement manuel

```powershell
# Backend
.\backend\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --port 8000
# Frontend (autre terminal)
cd frontend ; npm run dev
```

### Installation

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm install --prefix frontend
```

## Stack

Backend **FastAPI + DuckDB + pandas** · Frontend **React + Vite + React Flow**.

## Structure

```
backend/
  main.py           API FastAPI
  storage.py        projets / workflows / fichiers sur disque
  engine.py         exécution du graphe (DuckDB), aperçu, profil
  query_builder.py  modèle visuel  ->  SQL DuckDB
frontend/
  src/components/   éditeur React Flow, blocs, aperçu
projects/           données runtime (un dossier par projet, hors git)
```
