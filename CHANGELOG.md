# Changelog

Toutes les évolutions notables de Roade sont consignées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et la
versioning [SemVer](https://semver.org/lang/fr/) (tant que Roade reste en
0.x, l'API back/front et le format on-disk peuvent changer entre versions
mineures — la promesse de stabilité commence à 1.0).

## Politique de release (G.5)

1. Pendant le développement, les changements vont dans **[Unreleased]**.
2. Quand un milestone (v0.2, v0.3, …) est prêt à être tagué :
   - Renommer **[Unreleased]** en `[X.Y.Z] — YYYY-MM-DD`.
   - Bumper `version` dans `pyproject.toml`, `frontend/package.json`, et
     `__version__` dans `backend/main.py`.
   - Commit `release: vX.Y.Z`, puis `git tag -a vX.Y.Z -m "..."`.
3. Repartir avec **[Unreleased]** vide pour la version suivante.

Rubriques utilisées : `Ajouté` · `Changé` · `Corrigé` · `Sécurité` · `Retiré`.

---

## [Unreleased]

### Ajouté

- **B.6** — **API versionnée `/api/v1`** (graine cloud 1) : le front parle
  désormais à `/api/v1` ; `/api` (sans version) reste accepté pour la
  rétro-compat. La réécriture est faite par un middleware ASGI pur (pas de
  duplication des ~40 routes, pas de buffering du SSE), qui est aussi le point
  d'injection naturel d'une future authentification (encore inactive).
- **G.5** — `__version__` exposé côté backend (constante module + endpoint
  `GET /api/version`), versions synchronisées entre `pyproject.toml`,
  `frontend/package.json` et `backend/main.py`. Création du CHANGELOG.

### Changé

- **B.6** — **Enveloppe d'erreur typée** : toute erreur de l'API est rendue
  `{code, message}` (+ `details` sur les 422 de validation) au lieu du
  `{detail: …}` par défaut. Le `code` est stable et machine-lisible
  (`project.not_found`, `file.invalid_name`, `run.failed`, `validation_error`…)
  — le front peut réagir au type d'erreur sans parser le message FR. Les 8
  routes en `HTTPException(400, str(e))` fourre-tout sont remplacées par des
  `RoadeError` typées (`backend/errors.py`). Côté front, `api.js` expose le
  `code` sur l'`Error` levée (`err.code`).
- **G.6** — Licence **AGPL-3.0-only** : texte canonique FSF dans `LICENSE`,
  champ `license` ajouté dans `pyproject.toml` et `frontend/package.json`,
  section dédiée au README (avec son implication SaaS). Avant ce commit,
  le repo public était de facto « tous droits réservés ».

### Sécurité

- **B.4** — SQL `raw` exécuté dans une **sandbox DuckDB** (`enable_external_access
  = false`). Bloque `read_csv_auto`, `read_parquet`, `COPY ... TO`, `httpfs`,
  `INSTALL`, `LOAD`, `ATTACH`, et toute tentative de remettre le réglage à
  `true` (one-way DuckDB). Le mode `builder` (SQL généré par nous) reste sur
  la connexion partagée. Avant : un workflow tiers pouvait lire/écrire/
  exfiltrer n'importe quel fichier accessible par le process.

### Changé

- **Validation — règles multi-valeur** : les tests `starts_with`, `ends_with`,
  `contains`, `not_contains`, `equals`, `not_equals`, `regex`, `regex_full`,
  `char_equals`, `substr_equals` acceptent désormais une **liste** de valeurs
  (champ `rule.values` array). Sémantique : ANY-match pour les tests positifs,
  NONE-match pour `not_*`. UI : petit toggle « liste » dans la cellule valeur
  qui transforme l'input en textarea (une valeur par ligne). Évite d'avoir à
  créer N conditions en OR pour tester N préfixes/suffixes — paste de 30
  valeurs en un coup. Rétro-compatible (les règles existantes en single-value
  continuent à marcher).

---

## [0.4.0] — 2026-06-19 — UX d'éditeur

Milestone *UX d'éditeur* (Chantier E + F + reste de D) : la machine à un coup
des versions précédentes devient un éditeur — undo/redo, raccourcis, validation
avant exécution, modes de connexion alternatifs, et toute la batterie de
mécanismes qui font la différence entre « démo » et « outil que je peux
utiliser sérieusement ».

### Ajouté

- **E.1** — Undo / Redo (Ctrl+Z, Ctrl+Y, Ctrl+Maj+Z) : 50 niveaux d'historique
  par sens, snapshot complet du graphe, coalescence des rafales (frappe
  Inspector, batch de liens via Connecter à…). Couvre ajout, suppression,
  déplacement, connexion, édition de config, attach/detach de Bouchon.
- **E.2** — Bouton « Stop » pendant un run (annulation SSE + signal serveur).
- **E.3** — Validation pré-run statique sur le canevas (entrée requise non
  branchée, cycle, colonnes manquantes, paires de filtre vides, SQL brut
  vide…) avec pastille rouge sur le nœud (`lib/preflight.js`).
- **E.4 / E.5** — Dialogues Roade à la place des `window.confirm` natifs.
- **E.6** — Raccourcis clavier : Ctrl+S / D / L / K / Z / Y / Suppr / Échap /
  `?` + palette de commandes Ctrl+K + aide « ? ».
- **E.7** — Passe a11y complète : focus visible, aria-label sur boutons
  icône, rôles menu/tab, live regions, alternative clavier au drag (Ctrl+L
  + ConnectDialog), `prefers-reduced-motion`.
- **E.8 / E.9 / E.10** — Indices visuels pour les gestes avancés (drop sur
  arête, drill-down, Bouchon collé), légende des pastilles, opérateur de
  filtre cohérent.
- **F.0** — Contrat de bloc formalisé (`docs/CONTRAT_BLOC.md`), audit
  bloc par bloc.
- **F.1** — Union au socle : info-bulle riche + aperçu d'alignement des
  schémas (par nom vs par position, orphelines par entrée).
- **F.2** — Pivot : `<InfoBubble>` détaillée + pickers typés.
- **F.3** — Filtre : pickers `mainCols`/`refCols` typés (via D.7) +
  *dry-run* live (encadré « Aperçu » avec barre gardées/exclues, compteur
  de clés nulles, debounce 350 ms).
- **F.4** — Préréglages cliquables pour SQL brut (5 snippets DuckDB) et
  Nettoyage (4 recettes courtes). Calcul avait déjà ses `CALC_EXAMPLES`.
- **F.5** — Pastille « volume élevé » sur les blocs lourds (seuils
  calibrés par type dans `lib/loadEstimate.js`), niveau `critical` au-delà
  de 2 M lignes (ou 1 048 576 pour un export XLSX).
- **D.7** — `<ColumnPicker>` partout : disparition de `ColSelect`,
  `ColChecklist`, `CalcColSelect`. Le type s'affiche à côté du nom dans
  tous les sélecteurs de colonne.
- **D.8 (partiel)** — Reste des primitives (Dropdown / Tabs / Tooltip /
  Notice / Card / EmptyState / StatusBadge / SegmentedControl / DataTable)
  étalées dans le temps.
- **A.8** — Excel malformé : avertissement explicite sur cellules fusionnées
  ou fichier corrompu plutôt que résultat trompeur.
- **Inventaire de blocs** (style App Inventor — *backpack* par projet) :
  sauvegarde de sous-ensembles d'un workflow et collage dans un autre.
- **Connecter à…** — Mode click-to-connect sur le canevas (fan-out 1→N et
  fan-in N→1 via clic droit sur sélection multiple). Échap annule, Entrée
  valide.

### Corrigé

- Source : colonnes Excel à types mixtes (texte + nombres) coercées en
  texte au lieu de planter pyarrow (`_normalize_mixed_object_columns`).
- Preflight : validation route en mode `route` ne réclame plus
  `target_column` (qui n'est qu'un fallback).
- Pastilles d'état n'altèrent plus la taille du bloc (règle UX *taille
  fixe*).
- Validation route : élagage des sorties supprimées (edges et Parquet
  fantômes) au moment du changement de config.

### Changé

- Documentation : aide « ? » et raccourcis exposent désormais le mode
  « Connecter à… » et son sous-mode fan-in.

---

## [0.3.0] — 2026-06-17 — Ossature qui tient l'échelle

Milestone *Ossature* : URL = état, début du design system, typage côté
front, casts/dates à la source. Le workflow survit au F5 et la cohérence
visuelle passe de *par discipline* à *par construction*.

### Ajouté

- **Chantier C complet** — URL = état (routing `/p/:pid/w/:wid?node=:id`,
  C.1), fil d'Ariane réel (C.2), garde `beforeunload` (C.3), remontée
  unifiée des échecs API (C.4), retour visuel d'upload (C.5), 4 états
  sur les vues d'accueil et de projet (C.6).
- **D.1** — Tokens systémiques (`--s-*`, `--fs-*`, `--fw-*`, `--radius-*`,
  `--surface-*`, `--z-*`, durées, easings).
- **D.2** — Source unique des couleurs de type de bloc (`theme.ts`),
  élimination des 5 palettes JS dupliquées.
- **D.4 / D.5 / D.6 / D.7** — Primitives UI : `<Button>`, `<Modal>`
  (focus trap, role=dialog), `<Field>`, `<ColumnPicker>`.
- **A.5 / A.6** — Cast explicite par colonne au niveau Source (number /
  date / text / boolean), parsing de dates (format détecté ou explicite).
- **A.10** — Journal de runs persistant par workflow (horodatage, blocs
  recalculés vs réutilisés, durées, erreurs).
- **0.9** — TypeScript incrémental (`allowJs`), shape `validate.data`
  typée + vérifiée en CI.

---

## [0.2.0] — 2026-06-17 — Fondations fiables

Milestone *Fondations fiables* : le filet de qualité + le cœur d'intégrité
des données FR + la fermeture de la chaîne exploitable. **Première version
publiable** au sens de la roadmap : Roade ne corrompt plus silencieusement
un CSV FR, ne peut plus être détourné pour exécuter du code arbitraire, et
ne perd plus de modif en silence.

### Ajouté

- **Chantier 0** — ESLint + Prettier + Vitest (front), Ruff +
  pytest (back), CI GitHub Actions (lint + format + tests + build), build
  de prod servi par FastAPI (un seul process).
- **Chantier A** (intégrité FR) — Détection d'encodage (chardet) +
  override (auto / UTF-8 / CP1252-Latin-1), virgule décimale + séparateur
  de milliers, export CSV paramétrable (séparateur, décimale, BOM UTF-8),
  garde-fou limite Excel avant écriture, fingerprint Source qui inclut
  les options de lecture, fixtures de non-régression « intégrité FR ».

### Sécurité

- **Chantier B** — CORS restreint à `localhost:5173/127.0.0.1:5173`
  (avant : `*`), assainissement de `file.filename` à l'upload
  (rejet `..` et séparateurs), durcissement de `_resolve_file` + ouverture
  OS (refus des extensions exécutables), validation Pydantic des bodies
  JSON sur les routes critiques.

### Corrigé

- Garde `beforeunload` quand l'autosave debounce (600 ms) n'a pas encore
  flush — plus de perte silencieuse à la fermeture.
- Échecs API silencieux (suppressions, upload) remontés via toast/bannière.

---

## [0.1.0] — pre-audit

Version « amateur » initiale : web app FastAPI + DuckDB + React Flow,
workflows visuels sur fichiers Excel/CSV, blocs Source / SQL / Doublons /
Validation / Pivot / Nettoyage / Calcul / Filtre / Cols / Union / Export.
Aucun tag git associé à cet état.
