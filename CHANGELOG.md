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

### Changé

- **Extension du langage aux autres blocs** : chaque config mène par une
  **amorce d'intention** (`cfg-intent`, générique). **Filtre** (« Garder /
  Exclure les lignes des données présentes dans la référence », dry-run live) ;
  **Pivot** (« Pivoter / Dépivoter » + relecture en clair « Pour chaque région,
  une colonne par valeur de mois, remplie par SUM(montant) ») ; **Nettoyage**
  (« Nettoyer, opération par opération ») ; **Colonnes** (« Choisir, réordonner
  et renommer » + compteur « N gardées sur M ») ; **Union** (« Empiler N
  entrées, alignées : Par nom / Par position » en segmenté) ; **Calcul**
  (« Ajouter des colonnes calculées (N) ») ; **Analyse** (« Faire l'état des
  lieux des données ») ; **Export** (« Écrire le résultat dans un fichier » +
  relecture de la destination « → files/… ») ; **Source** (« Lire un fichier
  Excel/CSV ») ; **SQL** (« Transformer en SQL : Constructeur visuel / SQL
  brut » en segmenté). Le langage est désormais cohérent sur **tous** les blocs.
- **Bloc Validation — refonte de l'éditeur de condition (même langage)** : la
  condition se lit comme une phrase (« La ligne correspond si : … ») avec une
  **relecture en langage clair** sous les règles (« configuration = Model ET
  commence par CMD- »). Les modes rares **Masque positionnel** et **Contrôle
  par groupe**, qui étaient trois onglets de même poids, passent en
  **divulgation progressive** (« Définir autrement : … ») — on mène par les
  règles, le cas à 80 %. **Testeur toujours visible** (au lieu de replié).
  **Sorties** : chaque sortie se relit aussi en clair (« → les lignes où :
  configuration = Model »). Amorce d'**intention** en tête (contrôle vs routeur).
  Modèle de données et capacités avancées inchangés.
- **Nœuds Validation / Doublons plus compacts** sur le canevas : moins de blanc
  entre la liste des sorties et le pied du bloc.
- **Bloc Doublons — refonte ergonomique (pilote du grand rework UX)** : la
  config se lit désormais comme une phrase (« Deux lignes sont des doublons
  quand elles partagent : [colonnes] »). Colonnes-clés en **chips** ajoutables /
  retirables (au lieu d'une checklist), **compteur live** de doublons (dry-run
  `dedup-preview` : « 142 lignes en double dans 58 groupes · sur 1 200 »), les
  3 **sorties chiffrées** en direct, choix « on garde 1re / dernière » en
  contrôle segmenté, et l'option rare repliée (divulgation progressive).
  Principes : phrase-driven, Hick/Miller, reconnaissance > rappel, visibilité de
  l'état.

### Changé

- **Validation — finitions de l'éditeur de condition** : (1) type de colonne
  affiché entre parenthèses `configuration (texte)` au lieu de `· texte`
  (ambigu si le nom contient un `·`) ; (2) la **colonne par défaut** ne répète
  plus « défaut : … » dans chaque règle (juste le nom) ; (3) bouton **« →
  sortie »** sur une condition (router) qui crée une sortie nommée comme elle ;
  (4) **repli** des conditions (chevron + résumé en clair) ; (5) carte des flux
  (Sankey) du mode Contrôle **réduite** (moins haute).

### Corrigé

- **Bouton « liste » : icône au-dessus du texte** — `.rhs-toggle` passe en
  `inline-flex` (icône + libellé sur une ligne, même serré dans une rangée).
- **Décalage colonne / opérateur dans les règles (ColumnPicker `compact`)** : le
  mode `compact` n'était honoré qu'au cas « aucune colonne » ; dès les colonnes
  chargées, le picker rendait la version étiquetée `.fld` (flex-column +
  marge), désalignant les contrôles voisins d'une rangée (la colonne se
  décalait de « est égal à »). `compact` rend désormais un `<select>` inline —
  corrige toutes les rangées compactes (règles, paires de filtre, contrôles de
  groupe).
- **« Trop de blanc » sous les sorties du nœud Validation/Doublons** : la
  refonte du panneau Doublons réutilisait par erreur les classes `.dedup-outs`/
  `.dedup-out` du **nœud** sur le canevas — son fond/padding déteignait sur le
  nœud. Classes du panneau renommées `dedup-cfg-*` (isolées).
- **Cases à cocher étirées dans les panneaux de config** : une règle globale
  `.fld input { width: 100% }` étirait les `<input type=checkbox>` imbriquées
  (ColumnPicker multi…) à 100 %, cassant la mise en page (bloc Doublons et
  autres). Restreinte aux champs texte/select.
- **Validation, mode « Groupe » — insensibilité à la casse cassée** : sur
  pandas 3.0, les colonnes texte sont du dtype `str` (et non plus `object`), y
  compris à la lecture Parquet. Le repli en minuscules des contrôles par groupe
  était gardé par un test `dtype == object`, donc **entièrement sauté** : tout
  contrôle insensible à la casse (`contient la valeur X`, `constant`,
  `rows_satisfy`…) échouait dès qu'une casse différait. Symptôme observé :
  « trier les groupes où la colonne contient X » ne semblait marcher que si X
  tombait, à la bonne casse, sur la 1re ligne du groupe. Corrigé via
  `is_string_dtype` (couvre `str` et `object`) ; régression ajoutée.

### Ajouté

- **Bloc Validation — préréglage « Contrôler / Router »** : un choix d'intention
  en tête (« Je veux : Contrôler la conformité · Router vers plusieurs
  sorties »). En **Contrôle**, l'UI est simplifiée — une seule condition de
  conformité, deux sorties **Conformes / Non conformes** câblées
  automatiquement. En **Router**, gestion multi-sorties complète. La bascule **ne
  perd jamais de sortie** : les sorties d'un routeur sont planquées
  (`router_stash`) et restaurées au retour (garanti par
  `intentPatch`, testé). `intent`/`router_stash` exclus de la signature de cache
  (état d'UI pur). Le mode est inféré pour les blocs existants (`inferIntent`).
- **G.3** — **Onboarding léger** : au tout premier lancement (accueil vide,
  jamais onboardé), une orientation sobre des 3 concepts (projet → blocs →
  exécuter) qui funnel vers le projet d'exemple (G.2). **Montrée une seule
  fois** — le flag est posé dès l'affichage (`localStorage`), donc elle ne
  réapparaît plus jamais toute seule, quel que soit le nombre de relances. Un
  utilisateur qui a déjà des projets ne la voit pas. Ré-ouvrable à la demande
  via « Découvrir Roade » sur l'accueil.
- **Recalcul forcé ciblé (sélection)** : clic droit sur un bloc (ou sur une
  multi-sélection) → « Recalculer (et l'aval) ». Ignore le cache des blocs
  visés **et de tout leur aval**, tout en réutilisant l'amont depuis le cache
  (pas de relecture d'une source lente). Nécessaire car la signature de cache
  d'un bloc aval ne dépend que de la config + des signatures amont (Merkle), pas
  du contenu recalculé : forcer un bloc seul ne propageait pas la nouvelle
  sortie jusqu'aux aperçus et exports. Param `force_nodes` sur `run-stream`.
- **G.4** — **README utilisateur** orienté quoi / pourquoi / comment démarrer,
  avec un visuel fidèle du workflow d'exemple (`docs/img/demo-workflow.svg`) et
  le chemin guidé « Ouvrir l'exemple ». Le contenu développeur (install depuis
  les sources, architecture, tests, CI) est sorti dans un
  [`docs/DEV.md`](docs/DEV.md) dédié.
- **G.2** — **Projet de démonstration embarqué** : bouton « Ouvrir l'exemple »
  sur l'écran d'accueil (état vide). Un clic crée un vrai projet « Commandes
  2024 » avec un CSV FR de test (séparateur `;`, décimale `,`, accents) et un
  workflow complet **et exécutable** (Source → Nettoyage → Calcul → Validation
  → 2 Exports conformes / à corriger), puis ouvre directement le workflow. Fait
  passer un primo-utilisateur de « Aucun projet » à un premier export en un
  clic. Endpoint `POST /api/demo` (`backend/demo.py`). Un test de bout en bout
  garantit que la démo s'exécute (et que la décimale FR est bien parsée :
  Montant numérique, pas de SUM = 0 silencieuse).
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
