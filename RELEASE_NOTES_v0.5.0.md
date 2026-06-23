Milestone *Distribuable* : Roade s'installe et se lance partout (Windows /
macOS / Linux / Docker), accueille un primo-utilisateur (projet d'exemple +
onboarding), expose une API versionnée (`/api/v1`) à erreurs typées, et a reçu
une **grosse passe d'ergonomie** — « la config se lit comme une phrase » sur
tous les blocs (intention, relecture en clair, divulgation progressive, feedback
live), avec un sélecteur de colonne à badge de type.

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

- **Sélecteur de colonne — badge de type distinct** : le type n'est plus un
  suffixe `· texte` fondu dans le nom (ambigu si le nom contient un `·`) mais un
  **badge coloré** par catégorie (texte / nombre / date / booléen), dans le
  sélecteur *et* la liste. Le `<select>` natif (qui ne permet pas de styliser
  une option) est remplacé par un **menu déroulant maison** rendu en portal
  (jamais rogné par l'inspecteur scrollable), filtrable au-delà de 7 colonnes,
  navigable au clavier. S'applique à tous les pickers de colonne mono.
- **Validation — finitions de l'éditeur de condition** : (1) la **colonne par
  défaut** ne répète
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

- **G.1 — Lancement multiplateforme** (sans packager lourd) : `start.sh`
  (miroir Unix de `start.ps1` : `uv sync` + `npm install` au besoin, puis
  backend + frontend, ouvre le navigateur) ; **Docker** (`Dockerfile`
  multi-stage build front → image FastAPI servant API + dist sur un port, +
  `docker-compose.yml` avec volume `projects/` persistant). README + guide dev à
  jour. `.gitattributes` force le LF sur les scripts shell (sinon `bash\r` casse
  sur Unix). v0.5 « Distribuable » complet.
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


