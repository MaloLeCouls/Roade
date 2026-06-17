# Roade — Roadmap « de l'amateur au pro »
### Étape 3/3 — axes principaux + todolist d'exécution

> **Statut des décisions (commanditaire).**
> - **Q1 — cap final : produit publiable, pour des tiers.** ✅ → sécurité, a11y, distribution, licence deviennent des prérequis de publication, pas du bonus.
> - **Q2 — multi-utilisateur / cloud : envisagé, mais « à voir pour la suite ».** ✅ → on livre d'abord un **mono-utilisateur local distribuable**, et on *plante les graines* architecturales pour ne pas se condamner (cf. Track futur).
> - **Critère transverse ajouté : ne ressembler EN RIEN à de l'AI slop, en apparence ET en contenu.** → c'est le **fil rouge** de toute la roadmap (§ 1).
> - **Hypothèses prises faute de réponse** (à confirmer, § 6) : FR-first (donc intégrité CSV FR prioritaire) ; volumétrie dizaines de Mo / ≤ ~100 blocs ; ouverture future aux contributeurs (donc CI/lint/types tôt) ; forme du livrable = **milestones × chantiers × todos** (mix des options B+C de Claude Code).

---

## 0. Comment lire ce document

- **Chantiers** (A–H + 0) = les *workstreams* durables, par nature de travail.
- **Milestones** (v0.2 → v1.0) = les *tranches de livraison*, qui piochent des todos dans plusieurs chantiers (§ 5). Rien ne se publie avant **v0.2**.
- Chaque todo : `ID` · tâche · **Pourquoi** (constat d'audit / principe) · **Définition de terminé** (le critère vérifiable) · **Dép.** · **Taille**.
- **Tailles** (solo + assistance IA) : **XS** < ½ j · **S** ~1 j · **M** 2–4 j · **L** 1–2 sem · **XL** > 2 sem.
- Renvois : `fichier:ligne` et numéros de constats viennent des audits `01`–`09`.

---

## 1. La doctrine anti-slop (le fil rouge)

La pulsion naturelle quand on veut « rendre pro », c'est d'attraper un UI-kit, de coller des dégradés violets, une *hero section* avec un slogan vague et des emojis. **C'est précisément ça, le slop** : ça rend tout identique à tout. Or Roade a déjà l'inverse — une identité **sobre, dense, francophone, experte du domaine**. Le piège, c'est qu'en « professionnalisant » (surtout avec un assistant qui génère du code), on *rabote* cette âme. La règle pour tout ce chantier :

> **Pro ≠ générique. Pro = intentionnel + cohérent + digne de confiance + fini jusqu'aux bords.** On ne *remplace* pas le caractère de Roade, on le rend *systématique*.

Quatre principes opérationnels en découlent, et ils orientent les arbitrages partout :

**1. Le slop est une couche de peinture ; le pro est une structure.**
On ne sauve pas Roade du slop avec un thème : on le sauve en transformant sa cohérence *par discipline* (un seul auteur attentif) en cohérence *par construction* (tokens + primitives). Garder la palette sobre, la densité, le vocabulaire métier, les couleurs d'identité de blocs, l'export « Documenter » — et les **systématiser**. Concrètement, ça interdit : d'introduire une lib de composants au look reconnaissable « tel framework » (Chantier D § build, pas § theme) ; d'ajouter du dégradé/ombre/emoji décoratif ; de réécrire les écrans existants « pour faire moderne ».

**2. Le slop est générique ; l'expertise est spécifique.**
Le signal anti-slop le plus fort, c'est le détail que *seul quelqu'un qui connaît le métier* mettrait. Roade en a déjà (dry-run de répartition, lignage Excel). On en **ajoute** — et le n°1 d'entre eux, c'est que **les chiffres soient justes**. Un outil de données qui renvoie silencieusement `SUM = 0` sur un CSV FR (audit 08, risque #1) est la définition même du « plausible mais faux » — exactement la sensation que donne le slop. **L'intégrité des données n'est donc pas une correction de bug parmi d'autres : c'est l'investissement anti-slop central** d'un produit data. → Chantier A.

**3. Le slop saute les bords ; l'artisanat y vit.**
États vides, états d'erreur, clavier, accessibilité, installation, « que se passe-t-il au F5 », confirmations de suppression : le slop ne s'en occupe jamais. C'est invisible sur une démo *happy path* mais c'est la première chose qu'un évaluateur exigeant — et un vrai utilisateur un mauvais jour — rencontre. Finir les bords, c'est ce qui fait passer « bricolé en un week-end » à « vrai produit ». → Chantiers C, E, G.

**4. Retenue plutôt que décoration.**
Pas d'emoji-spam, pas de dégradés gratuits, pas d'animation pour l'animation, pas de *hero* creux. Roade est déjà retenu — on garde ce cap. Les seules animations présentes (glow du nœud, barre de progrès) **informent** ; c'est la barre : du mouvement qui renseigne, jamais qui décore (atouts F1–F2 de l'audit 05). Toute UI ajoutée passe ce test.

> **Le test « slop ou pas » à s'appliquer à chaque écran livré :** *est-ce qu'un évaluateur dirait « ça pourrait être n'importe quel SaaS » — ou « ça, c'est fait par quelqu'un qui connaît le traitement de données » ?* Si c'est le premier, on a échoué, même si « c'est propre ».

---

## 2. Le principe de séquencement

L'ordre n'est pas arbitraire ; il suit la **valeur de risque décroissante** et les **dépendances** :

1. **Le filet d'abord (Chantier 0).** On va générer beaucoup de code (souvent via Claude Code). Sans garde-fous automatiques (lint, format, types, tests, CI), ce code *accumule du slop silencieux*. Le filet vient donc **avant** ou **en parallèle immédiat** de tout le reste, pour que chaque ligne ajoutée soit tenue.
2. **La confiance ensuite (A + B).** Un outil data publiable ne peut pas (a) corrompre silencieusement des chiffres, ni (b) exposer un vecteur d'exécution de code. Ces deux-là sont **bloquants de publication** — ils définissent v0.2.
3. **L'ossature (C + D).** Adressabilité (routing) et design system : ce sont les fondations qui font *tenir l'échelle* et que tout le reste réutilise. v0.3.
4. **L'expérience d'éditeur (E + F).** Undo, stop, validation pré-run, clavier, a11y, parité de profondeur : ce qui transforme « machine à un coup » en « éditeur ». v0.4.
5. **L'existence pour autrui (G).** Packaging, démo, docs, versioning, licence : sans ça, un nouvel utilisateur ne *peut pas* commencer. v0.5.
6. **Le polish publiable (H).** La passe finale + le positionnement non-slop. v1.0.
7. **Le futur (Track cloud/multi-user)** est **explicitement différé**, mais on plante 3 graines dès maintenant pour ne pas avoir à tout casser (§ Track futur).

---

## 3. Carte des chantiers (vue d'ensemble)

| Chantier | Objectif | Principes | Milestone(s) |
|---|---|---|---|
| **0 — Filet de sécurité** | Qualité automatisée : lint, format, types, tests, CI, build de prod | P3 | v0.2 (puis continu) |
| **A — Confiance & intégrité des données** | Les chiffres sont justes ; rien n'est perdu en silence | P12, P13 · **anti-slop #2** | v0.2 |
| **B — Sécurité** | Fermer la chaîne d'exécution exploitable et durcir l'API | P4 | v0.2 |
| **C — Adressabilité & session** | URL = état ; survie au F5 ; pas de perte à la fermeture | P1, P5 · **anti-slop #3** | v0.3 |
| **D — Design system + i18n** | Cohérence *par construction* : tokens → primitives ; chaînes centralisées | P2 · **anti-slop #1** | v0.3 → v0.4 |
| **E — UX d'éditeur pro** | Undo/redo, stop, validation pré-run, clavier, a11y, doublons | P5, P7, P9, P11 · **anti-slop #3** | v0.4 |
| **F — Parité de profondeur des blocs** | Le « contrat de bloc » : tous au même socle | P10 | v0.4 |
| **G — Distribution & 5 premières minutes** | Installer, démarrer, comprendre ; versionner ; licence | P9 · **anti-slop #3** | v0.5 |
| **H — Polish publiable** | Passe finale + positionnement non-slop | tous · **anti-slop #1,4** | v1.0 |
| **Track futur** | Multi-utilisateur / cloud (différé, graines plantées) | P1, P4 | post-v1.0 |

---

## 4. Les chantiers en détail (todolist)

### Chantier 0 — Filet de sécurité (qualité automatisée) · P3

> *Pourquoi en premier :* tout le code à venir doit naître tenu. C'est aussi un prérequis « contributeurs » (Q11) et un anti-slop structurel : du code généré sans gate = dette invisible.

- **0.1** Mettre en place **ESLint + Prettier** (front) avec une config explicite ; brancher les `eslint-disable` déjà présents (`routing.jsx:35`, `BlockEditor.jsx:109,176`, `DataPreview.jsx:32,41`) sur une config réelle. **Pourquoi :** audit 07 § 3 (des disable sans config). **Terminé :** `npm run lint` et `npm run format:check` passent sur tout `frontend/src`. **Dép. :** — **Taille :** S
- **0.2** Mettre en place **Ruff + Black (ou Ruff-format) + un `pyproject.toml`** (back). **Terminé :** `ruff check backend` et le formateur passent. **Dép. :** — **Taille :** S
- **0.3** Industrialiser les tests backend : migrer les **10 scripts `_test_*.py`** vers **pytest** (fixtures `tmp_path` au lieu d'écrire dans `projects/`, `try/finally` supprimé au profit de fixtures, noms non collidants). **Pourquoi :** 07 § 2.2 (effets de bord réels, projets de test laissés sur disque). **Terminé :** `pytest` vert, aucun dossier de test résiduel, isolation par fixture. **Dép. :** — **Taille :** M
- **0.4** Ajouter des **tests d'API HTTP** (FastAPI `TestClient`) sur les routes critiques (création projet, save/load workflow, run-stream nominal, preview). **Pourquoi :** 07 § 2.2 (aucun test ne touche une route ni la sérialisation JSON). **Terminé :** ≥ 1 test par route critique. **Dép. :** 0.3 **Taille :** M
- **0.5** Amorcer un **harnais de tests front** (Vitest + Testing Library) ; 3–5 tests de fumée (rendu d'`App`, ouverture d'un `BlockEditor`, `dirtyMap`). **Pourquoi :** 0 test front (07 § 2.3). **Terminé :** `npm test` vert en CI. **Dép. :** — **Taille :** M
- **0.6** **CI GitHub Actions** : lint + format-check + pytest + vitest + build, sur push et PR. **Pourquoi :** `.github/workflows` inexistant (01 § 1, 07 § 2.4). **Terminé :** badge CI vert ; un PR rouge bloque. **Dép. :** 0.1–0.5 **Taille :** S
- **0.7** **Lockfiles** versionnés : `package-lock.json` (vérifier qu'il est commité) et un lock Python (`uv.lock` ou `pip-tools`/`requirements.lock`). **Pourquoi :** repro d'install non garantie (07 § 7.4). **Terminé :** install reproductible documentée. **Dép. :** — **Taille :** XS
- **0.8** **Build de prod servi par FastAPI** : `vite build` + montage des assets statiques par FastAPI, pour ne plus dépendre de `vite dev` permanent. **Pourquoi :** 07 § 7.1 (pas de mode prod). **Terminé :** un seul process sert l'app buildée sur un port. **Dép. :** — **Taille :** M *(aussi prérequis du Chantier G)*
- **0.9** **Typage progressif** : commencer par **PropTypes ou JSDoc-types** sur les *shapes* à risque (la `data` de Validation, `Inspector.jsx:127-134`), ou décider une migration **TypeScript** incrémentale (`allowJs`, fichier par fichier). **Pourquoi :** aucune garantie de shape (07 § 3). **Terminé :** la shape `validate.data` est typée et vérifiée en CI. **Dép. :** 0.6 **Taille :** L *(décision § 6)*

---

### Chantier A — Confiance & intégrité des données · P12, P13 · anti-slop #2

> *Le cœur.* Si Roade peut renvoyer un faux chiffre sans le dire, rien d'autre ne compte. **Bloquant de publication.**

- **A.1** **Détection + override d'encodage à la lecture** : sniffer (chardet/charset-normalizer) avec repli, et un champ UI `encoding` (auto / UTF-8 / CP1252-Latin-1) sur le bloc Source. **Pourquoi :** 08 § 1.1, constat 05 #4 — `pd.read_csv` sans `encoding=` (`engine.py:210-211`). **Terminé :** un CSV CP1252 avec accents s'importe sans mojibake ; l'encodage retenu est affiché dans l'aperçu Source. **Dép. :** — **Taille :** M
- **A.2** **Virgule décimale + séparateur de milliers** : option Source `format des nombres` (auto / FR `1 234,56` / EN `1,234.56`), passée en `decimal=`/`thousands=` ; détection automatique par défaut. **Pourquoi :** 08 § 2.2-2.3, constat 05 #5 — un `12,5` reste une chaîne, `SUM` casse en silence. **Terminé :** le scénario `Article;Prix\nA;12,5\nB;7,3` → `SUM = 19.8`, pas `0` ; profil numérique disponible. **Dép. :** A.1 **Taille :** M
- **A.3** **Aperçu du résultat de sniffing** (séparateur + encodage + nb colonnes détectées) **dans l'éditeur Source**, modifiable. **Pourquoi :** 08 § 2.1 — aucun feedback sur le séparateur retenu. **Terminé :** l'utilisateur voit « séparateur `;`, encodage CP1252, 4 colonnes » et peut corriger avant matérialisation. **Dép. :** A.1, A.2 **Taille :** S
- **A.4** **Export CSV paramétrable** : séparateur, décimale, **BOM UTF-8** (pour qu'Excel FR autodétecte), fin de ligne. Par défaut : un preset « Excel FR » (`;` + `,` + BOM). **Pourquoi :** 08 § 1.2, constats 05 #16, 04 P5 — `df.to_csv(index=False)` figé, accents cassés à l'ouverture Excel FR. **Terminé :** un export rouvert dans Excel FR affiche accents + colonnes corrects. **Dép. :** — **Taille :** S
- **A.5** **Correction de type à la source** (cast explicite par colonne : nombre / date / texte / booléen), au lieu d'imposer un détour par un bloc Nettoyage. **Pourquoi :** 08 § 3.2 — seule remédiation = bloc Clean, connaissance non guidée. **Terminé :** sur l'aperçu Source, un menu par colonne permet de forcer le type ; les échecs de cast sont comptés et visibles. **Dép. :** A.1-A.2 **Taille :** M
- **A.6** **Parsing de dates** (format explicite ou détection) à la lecture. **Pourquoi :** 08 § 2.4 — dates en `VARCHAR`, tri chronologique impossible. **Terminé :** une colonne `JJ/MM/AAAA` est typée date et triable. **Dép. :** A.5 **Taille :** S
- **A.7** **Garde-fou limite Excel** (1 048 576 lignes / 16 384 colonnes) **avant** d'écrire, avec message + suggestion (CSV, ou découpage en feuilles). **Pourquoi :** 08 § 5.3 — échec d'écriture *après* tout le calcul. **Terminé :** un export > limite est intercepté *avant* l'écriture avec un message d'action clair. **Dép. :** — **Taille :** S
- **A.8** **Gestion des entrées Excel malformées** : message pédagogique sur xlsx corrompu, cellules fusionnées, en-têtes multi-lignes (au minimum : détection + avertissement + lien d'aide). **Pourquoi :** 08 § 9 risques #3/#9, 02 (Source) — non gérés. **Terminé :** un xlsx à cellules fusionnées produit un avertissement explicite, pas un résultat trompeur. **Dép. :** A.1 **Taille :** M
- **A.9** **Inclure les options de lecture dans la *fingerprint* Source** (encodage, decimal, thousands, casts, date_format). **Pourquoi :** 08 § 6.2 — sinon « cache hit » avec décodage différent. **Terminé :** changer l'encodage invalide le cache du bloc. **Dép. :** A.1-A.6 **Taille :** S
- **A.10** **Journal de runs persistant** (par workflow) : horodatage, blocs recalculés vs réutilisés, durées, erreurs. **Pourquoi :** P13, constats 05 #32 / 08 § 7.3 — la progression n'est que *live*. **Terminé :** un panneau « Historique » liste les N derniers runs avec leur détail. **Dép. :** — **Taille :** M
- **A.11** *(garde-fou)* **Test de non-régression « intégrité FR »** : un jeu de CSV FR pathologiques (CP1252, `;`, `1 234,56`, dates, 1 colonne piégeuse) en fixtures pytest. **Pourquoi :** zones grises Z1/Z5/Z7 de l'audit 09. **Terminé :** la suite échoue si une régression réintroduit le bug #1. **Dép. :** 0.3, A.1-A.6 **Taille :** S

---

### Chantier B — Sécurité · P4

> *Pourquoi bloquant même « en local » :* l'audit 07 § 8 démontre une **chaîne exploitable** — CORS `*` + aucune auth + upload non assaini + `os.startfile` ⇒ un site malveillant ouvert dans le navigateur pendant que Roade tourne sur `localhost` peut **uploader un fichier arbitraire et le faire exécuter**, sans interaction. Publier un outil avec ce vecteur, c'est intenable.

- **B.1** **Restreindre CORS** à l'origine locale réelle (pas `*`) + n'accepter les requêtes mutatives que `same-origin` ; envisager un token local par session. **Pourquoi :** 07 § 5.1, 01 § 4 — `allow_origins=["*"]` (`main.py:27-32`). **Terminé :** une page tierce ne peut plus appeler l'API. **Dép. :** — **Taille :** S
- **B.2** **Assainir `file.filename` à l'upload** (basename only, rejet des `..` et séparateurs, normalisation). **Pourquoi :** 07 § 5.3 — path-traversal (`../etc.txt` sort de `files/`). **Terminé :** un nom de fichier malicieux est rejeté/neutralisé ; test pytest dédié. **Dép. :** 0.3 **Taille :** S
- **B.3** **Durcir `_resolve_file` + ouverture OS** : refuser l'ouverture d'extensions exécutables (`.lnk/.bat/.scr/.exe/...`) ; valider que le chemin reste sous la racine projet par *realpath*. **Pourquoi :** 07 § 5.2 & 5.5 — `os.startfile` exécute l'app associée. **Terminé :** seules les extensions data autorisées peuvent être « ouvertes dans l'OS ». **Dép. :** B.2 **Taille :** S
- **B.4** **Sandboxer le mode SQL `raw`** : interdire/filtrer les fonctions filesystem DuckDB (`read_csv_auto`, `read_parquet` arbitraires, `COPY ... TO`, `httpfs`), ou exécuter en *read-only* sur les seules tables enregistrées. **Pourquoi :** 07 § 5.4 — un workflow tiers peut lire/écrire/exfiltrer (devient critique dès qu'on partage des workflows, Q9). **Terminé :** une requête `raw` ne peut pas toucher au disque hors tables fournies ; test dédié. **Dép. :** — **Taille :** M
- **B.5** **Valider les bodies JSON avec Pydantic** (`save_workflow`, `route_preview`, `split_scan`, `validate_test`, `create_project`). **Pourquoi :** 07 § 5.7 — `payload: dict = Body(...)` non validé. **Terminé :** un body malformé renvoie 422 propre, n'atteint jamais l'engine. **Dép. :** — **Taille :** M
- **B.6** **Codes d'erreur typés** plutôt que `HTTPException(400, str(e))` partout. **Pourquoi :** 01 § 4, 07 § 4.1 — info typée perdue (8 routes en catch-all). **Terminé :** l'API renvoie un `{code, message}` ; le front peut réagir au code. **Dép. :** B.5 **Taille :** S

---

### Chantier C — Adressabilité & robustesse de session · P1, P5 · anti-slop #3

> *Le signal pro/amateur le plus binaire qu'un évaluateur teste en 5 secondes : F5.*

- **C.1** **Introduire un routeur** (URL = état) : `/`, `/p/:pid`, `/p/:pid/w/:wid`, avec `?node=:id` (et un état « bloc en édition » distinct, cf. 04 § 6.d). **Pourquoi :** 01 § 5, 04 § 6.b, constats 05 #1/#2 — `useState({name:'projects'})` (`App.jsx:9`). **Terminé :** F5 restaure l'emplacement exact ; un lien « ce workflow, ce bloc » s'ouvre directement ; « précédent » navigateur fonctionne. **Dép. :** — **Taille :** M
- **C.2** **Fil d'Ariane réel** : afficher le **nom** du workflow, pas la chaîne `workflow`. **Pourquoi :** constats 05 #23, 04 — `App.jsx:60`. **Terminé :** breadcrumb « Projets / Mon-projet / Reporting Q3 ». **Dép. :** C.1 **Taille :** XS
- **C.3** **Garde `beforeunload`** quand l'autosave debounce (600 ms) n'a pas encore *flush*. **Pourquoi :** constats 05 #9, 04 § 6.c — perte silencieuse possible. **Terminé :** fermer/rafraîchir avec une modif en attente déclenche l'avertissement natif et/ou un flush synchrone. **Dép. :** — **Taille :** S
- **C.4** **Remontée des échecs API silencieux** (suppressions, upload) via une couche de feedback unifiée (toast/bannière). **Pourquoi :** constats 05 #10, 04 § P4 état d'erreur — `deleteProject/deleteFile/deleteWorkflow/uploadFile` sans `.catch`. **Terminé :** backend coupé → toute action ratée affiche une erreur. **Dép. :** D.? (composant `Notice`/Toast — peut être livré minimal d'abord) **Taille :** S
- **C.5** **Retour visuel d'upload** (progress + état). **Pourquoi :** constats 05 #11, 04 § 1 — un Excel de 80 Mo fige l'app sans indicateur. **Terminé :** une barre/indicateur d'upload visible pendant le transfert. **Dép. :** C.4 **Taille :** S
- **C.6** **Quatre états sur la page d'accueil & le projet** : skeleton de chargement, vide pédagogique, erreur récupérable. Enrichir `ProjectList` (date de dernière ouverture, taille, nb de workflows). **Pourquoi :** constats 05 #33, 04 § 1 — accueil pauvre, chargement « Chargement… » nu. **Terminé :** chaque vue a ses 4 états ; l'accueil est triable/lisible. **Dép. :** D.tokens **Taille :** M

---

### Chantier D — Design system (tokens → primitives) + i18n · P2 · anti-slop #1

> *La transition pro/amateur **au niveau du code**.* On **ne change pas le rendu** (déjà sobre et bon) : on rend la cohérence *structurelle*. **Préserver l'identité existante** (palette, densité, couleurs de bloc) est une consigne, pas une option.

**Phase 1 — tokens (cheap, haute leverage) :**
- **D.1** Compléter `:root` avec les tokens manquants : **espaces** (`--s-1..8`), **typo** (`--fs-*`, `--fw-*`), **rayons** (`--radius-sm/md/lg/pill`), **surfaces** (`--surface-1..5` pour les fonds de notice), **z-index** (`--z-*`), **durées/easings**. **Pourquoi :** audit 06 § 1, 3, 5 — 40+ paddings, 13 tailles de police, 17 rayons, 8 z-index littéraux, fonds de notice inventés. **Terminé :** les nouveaux tokens existent et sont documentés ; l'échelle 4/8/12/16/24 est posée. **Dép. :** — **Taille :** S
- **D.2** **Source unique des couleurs de type de bloc** : éliminer la duplication CSS `--t-*` ↔ JS `TYPE_COLOR`/`HANDLE_COLOR`/`FRAME_COLORS`/`PIE_COLORS`/`OUTPUT_COLORS`. **Pourquoi :** audit 06 § 1, 07 § 1.3 — 5 palettes JS + tokens CSS désynchronisables. **Terminé :** une seule table, importée des deux côtés (ou générée). **Dép. :** D.1 **Taille :** S
- **D.3** **Migrer les valeurs en dur vers les tokens** (fonds `#fff` → `--panel`, fonds hover/notice → `--surface-*`, point dirty `#e0a73a` → token). **Pourquoi :** constats 05 #29, audit 06 § 3.4. **Terminé :** plus de couleur de fond/hover en dur ; `grep #` réduit aux seuls boutons accent. **Dép. :** D.1 **Taille :** M

**Phase 2 — primitives (extraites *au fur et à mesure* qu'un chantier en a besoin) :**
- **D.4** `<Button variant size icon loading>` + `<IconButton aria-label>`. **Pourquoi :** audit 06 § 2.1 — 25+ combinaisons de classes, boutons « Exécuter » réécrits à la main (`routing.jsx:716`). **Terminé :** tous les boutons passent par la primitive ; plus de `style={{marginLeft:'auto'}}`. **Dép. :** D.1 **Taille :** M
- **D.5** `<Modal title size onClose>` avec **focus trap, Échap, `role="dialog"`/`aria-modal`, z-index tokenisé**. **Pourquoi :** audit 06 § 2.3, constats 05 #6/#15 — 4 modales divergentes, focus non piégé. **Terminé :** les 4 modales (`BlockEditor`, `DataPreview`, `WorkflowFlow`, `FlowMapModal`) partagent la primitive ; focus piégé ; annoncée par lecteur d'écran. **Dép. :** D.1 **Taille :** M
- **D.6** `<Input>/<Select>/<TextArea>` avec état `invalid` + message + largeur par prop. **Pourquoi :** audit 06 § 2.2 — 54+21+7 champs bruts, largeurs en `style={{width:80}}`. **Terminé :** les champs de l'Inspector passent par les primitives ; validation visuelle possible. **Dép. :** D.1 **Taille :** L
- **D.7** **`<ColumnPicker>` (mono & multi, TYPÉ)**, unifiant `ColSelect` + `ColChecklist` + les 5 selects de colonne nus. **Pourquoi :** audit 06 § 4, 03 col. 2 — typage inégal (le mono-colonne `ColSelect` n'affiche jamais le type ; Filtre compare sans type). **Terminé :** *partout* où on choisit une colonne, le type s'affiche à côté du nom. **Dép. :** D.6 **Taille :** M *(débloque F.x)*
- **D.8** `<DropdownMenu>/<MenuItem>` (close-on-outside, fléchage clavier, `role="menu"`), `<Tabs>`, `<Tooltip>` (fusion `InfoBubble`/`MenuInfo`), `<Notice level>`, `<Card>`, `<EmptyState>`, `<StatusBadge>`, `<SegmentedControl>`, `<DataTable>`. **Pourquoi :** audit 06 § 4 — chaque motif est ré-implémenté (2 `InfoBubble` jumelles, 6 visuels de switch, tables en cul-de-sac). **Terminé :** chaque primitive remplace ses occurrences ; une seule API par motif. **Dép. :** D.1 **Taille :** XL *(étaler sur v0.4)*

**Phase 3 — modularité & contenu :**
- **D.9** **Découper `Inspector.jsx` (1 479 LOC)** en un fichier par `*Config`, et **`engine.py` (2 472 LOC)** en modules de runners. **Pourquoi :** 01 § 2, 07 § 1.1 — monolithes (44 % / 54 % du code). **Terminé :** plus aucun fichier > ~600 LOC sans raison ; un bloc = un module des deux côtés. **Dép. :** primitives D.4-D.8 **Taille :** L
- **D.10** **Centraliser les chaînes (i18n)** : un catalogue `clé → libellé FR` (même si une seule langue d'abord), remplaçant les libellés en dur. **Pourquoi :** audit 03 col. 10, 06 § 30, 01 § 6 — chaînes FR éparpillées, vocabulaire incohérent (« Colonne par défaut » vs « colonne à valider », constat #30). **Terminé :** zéro libellé d'UI en dur dans les composants ; vocabulaire passé en revue pour cohérence. **Dép. :** — **Taille :** L *(prépare une éventuelle version EN pour la publication large)*

---

### Chantier E — UX d'éditeur pro · P5, P7, P9, P11 · anti-slop #3

> *Ce qui fait passer de « machine à un coup » à « éditeur ».* L'audit 05 § synthèse en fait l'une des trois familles d'écart.

- **E.1** **Undo / Redo** (Ctrl+Z / Ctrl+Y) couvrant ajout/suppression/déplacement/édition de config/connexion. **Décision d'archi à trancher (§ 6) :** modèle de commandes maison vs historique d'état (ex. via une lib d'état type *zustand* + *temporal*). **Pourquoi :** P5, constat 05 #3 — **zéro** undo (`WorkflowEditor.jsx:517-539`), supprimer une Validation très configurée = irréversible. **Terminé :** au moins 50 niveaux d'annulation ; supprimer puis Ctrl+Z restaure le bloc *et* ses arêtes. **Dép. :** P4 (couche d'état, voir Track futur graine 2) **Taille :** L
- **E.2** **Bouton « Stop » pendant un run** : fermer proprement le SSE + signal d'annulation côté serveur ; garantir qu'aucun état mi-fini n'est servi comme cache. **Pourquoi :** constats 05 #8, 04 § synthèse, 07 § 5.6 — `EventSource` non annulable, seul recours = fermer l'onglet. **Terminé :** « Stop » interrompt le run, l'UI revient à un état cohérent, le cache n'est pas corrompu. **Dép. :** B.? (annulation serveur) **Taille :** M
- **E.3** **Validation pré-run sur le canevas** : détecter *statiquement* (entrée requise non branchée, cycle, colonne absente, doublon de nom après renommage, SQL brut vide, paires de filtre vides) et **afficher l'erreur sur le nœud** avant d'exécuter. **Pourquoi :** P7, constats 05 #12, 02 (transversal), 03 col. 5 — toutes ces erreurs ne sortent qu'au runtime (`engine.py:323,335,364,1147,1404,1449,1675`). **Terminé :** un workflow invalide affiche des badges d'erreur sur les nœuds concernés *avant* clic « Exécuter » ; survol = explication. **Dép. :** D.8 (`StatusBadge`, `Tooltip`) **Taille :** L
- **E.4** **Remplacer les `confirm()` natifs** (projet/fichier/workflow) par un `<ConfirmDialog>` Roade (focus, charte, annulable). **Pourquoi :** constats 05 #7, 04 § 1 — look hors charte, un Entrée par mégarde supprime. **Terminé :** plus aucun `window.confirm` ; dialog cohérent et accessible. **Dép. :** D.5 (`Modal`) **Taille :** S
- **E.5** **Confirmation sur la suppression d'arête** (ou undo immédiat) pour cohérence interne. **Pourquoi :** constat 05 #35 — la croix d'arête supprime sans filet (`ButtonEdge.jsx:19`), alors que les blocs ont un confirm. **Terminé :** supprimer une arête est annulable (Ctrl+Z via E.1 suffit, sinon mini-confirm). **Dép. :** E.1 **Taille :** XS
- **E.6** **Raccourcis clavier** : Ctrl+S (flush save), Ctrl+Z/Y, Ctrl+D (dupliquer), Suppr (déjà), Échap (déjà), + une **palette de commandes Ctrl+K**. **Pourquoi :** P9, constats 05 #13, 04 § synthèse — seulement Échap/Suppr/Entrée. **Terminé :** les raccourcis fonctionnent et sont documentés (aide « ? » / palette). **Dép. :** E.1 **Taille :** M
- **E.7** **Accessibilité — passe complète** : focus visible partout, `aria-label` sur tous les boutons icône-only, `role`/labels sur menus et onglets, alternative clavier au drag de connexion, `prefers-reduced-motion`, contrastes vérifiés (Axe). **Pourquoi :** P11, constats 05 #6/#15/#28/#34, 01 § 6 — **17 occurrences** aria/role dans tout le front. **Terminé :** audit Axe sans erreur bloquante ; navigation clavier complète d'un workflow ; mode mouvement réduit. **Dép. :** D.4-D.8 (primitives portent l'a11y) **Taille :** L
- **E.8** **Révéler les gestes avancés** : indice visuel « sera inséré sur ce lien » à l'insertion sur arête ; mention du drilldown depuis le profil ; affordance du Bouchon collé. **Pourquoi :** P9, constats 05 #20/#21/#22, 04 D8 — comportements-surprise non découvrables. **Terminé :** chaque geste avancé a un indice à l'écran (pas seulement dans le code). **Dép. :** D.tokens **Taille :** S
- **E.9** **Légende « périmé vs jamais exécuté »** (point `node-dirty` vs badge `non exécuté`) explicitée dans l'UI. **Pourquoi :** constats 05 #31, 04 D13 — deux signaux indistincts au survol. **Terminé :** une légende/onboarding explique les deux états. **Dép. :** — **Taille :** XS
- **E.10** **Unifier les entrées « Exécuter »** (D1) en une convention claire (scope nœud / vue / flow-map) ; **uniformiser l'opérateur de filtre** de l'aperçu (D12 : `equals` depuis le profil vs `contains` depuis le header). **Pourquoi :** crainte explicite « boutons qui font la même chose » ; constats 05 #17/#19, 04 D1/D12. **Terminé :** un seul motif « Exécuter » cohérent ; opérateur de filtre cohérent et indiqué. **Dép. :** D.4 **Taille :** S

---

### Chantier F — Parité de profondeur des blocs · P10

> *Réponse directe à la crainte n°1 du commanditaire : « pas de feature hyper pointue d'un côté et rien de l'autre ».* On définit un **contrat de bloc** (socle commun) et on **comble les manques** révélés par la matrice 03.

- **F.0** **Formaliser le « contrat de bloc »** : tout bloc exécutable doit offrir le socle — UI config dédiée, **sélecteur de colonnes typé**, aperçu, profilage, **validation pré-run** (via E.3), état d'erreur sur le nœud, **info-bulle qui dépaquette le concept**, et (quand pertinent) **exemples/préréglages**. **Pourquoi :** P10, audit 03 (dissymétries). **Terminé :** une checklist « contrat » documentée, appliquée bloc par bloc ci-dessous. **Dép. :** D.7, E.3 **Taille :** S
- **F.1** **Hisser Union** au socle : aperçu des schémas qui *vont* s'aligner, mise en garde « par nom ≠ par position », signal de colonnes absentes d'un côté, info-bulle réelle. **Pourquoi :** audit 03 dissymétrie #1 — 22 LOC d'Inspector vs ~1 297 pour Validation, alors que l'union est piégeuse. **Terminé :** avant exécution, l'utilisateur voit comment les schémas s'alignent et les colonnes orphelines. **Dép. :** F.0 **Taille :** M
- **F.2** **Pivot** : ajouter une `<InfoBubble>` qui explique pivot/unpivot, typer ses sélecteurs (`pivot_column`/`value_column` via `<ColumnPicker>`), ajouter des exemples. **Pourquoi :** audit 03 dissymétrie #2 — seul bloc « concept-lourd » sans aucune bulle. **Terminé :** Pivot atteint le socle d'aide + typage. **Dép. :** D.7 **Taille :** S
- **F.3** **Filtre** : sélecteurs `mainCols`/`refCols` **typés** (la sémantique repose sur la concordance de type) ; idéalement un aperçu des lignes qui *seraient* exclues. **Pourquoi :** audit 03 dissymétrie #4 — non typé alors qu'il compare (`Inspector.jsx:991-1004`). **Terminé :** types affichés ; (option) compteur de lignes exclues en dry-run. **Dép. :** D.7 **Taille :** S
- **F.4** **Exemples/préréglages** pour SQL, Clean, Filter (à l'image des `CALC_EXAMPLES` de Calc, seul bloc à en avoir). **Pourquoi :** audit 03 dissymétrie #3 — la promesse du bouton « éditer » varie d'un bloc à l'autre. **Terminé :** au moins 2-3 préréglages cliquables par bloc concerné. **Dép. :** F.0 **Taille :** M
- **F.5** **Dry-run générique sur gros volumes** : signal « ce bloc est lourd » / estimation avant un Pivot ou une jointure sur N×100k lignes, en s'inspirant du `route_preview` de Validation. **Pourquoi :** audit 03 col. 9 — aucune affordance générique de volume. **Terminé :** un bloc coûteux affiche un avertissement de volume avant exécution. **Dép. :** A.10 (instrumentation) **Taille :** M

---

### Chantier G — Distribution & 5 premières minutes · P9 · anti-slop #3

> *Sans ça, un nouvel utilisateur ne peut pas commencer — le produit « ne sait pas se distribuer » (audit 07 § 8).* C'est ce qui fait la différence entre « repo GitHub » et « produit ».

- **G.1** **Installation/lancement multiplateforme en une commande** : `start.sh` (Unix) en miroir de `start.ps1`, et/ou **docker-compose**, et/ou un **packager** (Tauri de préférence pour un binaire léger ; Electron sinon) servant le build de prod (0.8). **Pourquoi :** 07 § 7.1, 01 § 1 — Windows-only, dépend d'un venv manuel. **Terminé :** un utilisateur macOS/Linux/Windows démarre Roade sans connaître Python/Node. **Dép. :** 0.8 **Taille :** L *(choix packager § 6)*
- **G.2** **Projet de démonstration embarqué** + bouton « Ouvrir l'exemple » : un workflow réaliste avec fichiers FR de test. **Pourquoi :** P9, constats 05 #14, 04 § 1 — premier lancement sur « Aucun projet. », zéro chemin guidé. **Terminé :** au premier lancement, un clic charge un workflow complet qu'on peut exécuter. **Dép. :** A.1-A.2 (les CSV FR doivent bien se lire) **Taille :** M
- **G.3** **Onboarding léger** : une visite guidée non intrusive des 3 concepts (projet → blocs → run), et l'aide « ? » par bloc reliée au catalogue. **Pourquoi :** « un nouvel utilisateur comprend la logique » (demande initiale). **Terminé :** un primo-utilisateur atteint un premier export sans aide extérieure. **Dép. :** G.2, D.8 **Taille :** M
- **G.4** **README utilisateur + captures + courte démo** (et garder le README dev séparé). **Pourquoi :** 07 § 7.3 — README orienté dev, sans install/premier projet/captures. **Terminé :** la page d'accueil du dépôt explique *quoi/pourquoi/comment démarrer* avec visuels. **Dép. :** G.1 **Taille :** S
- **G.5** **Versioning & CHANGELOG** : tags git (SemVer), `CHANGELOG.md`, bump de version, `__version__` backend. **Pourquoi :** 07 § 7.2 — 0 tag, 0 release, version figée `0.1.0`. **Terminé :** chaque milestone produit une release taguée avec notes. **Dép. :** 0.6 **Taille :** S
- **G.6** **Choix et pose d'une licence** (le repo public est aujourd'hui « tous droits réservés » → interdit légalement à un tiers de l'utiliser). **Pourquoi :** audit 09 H6/Q1. **Terminé :** un fichier `LICENSE` clair (ex. AGPL-3.0 si on veut protéger un futur cloud, MIT/Apache-2.0 si adoption maximale — § 6). **Dép. :** — **Taille :** XS

---

### Chantier H — Polish publiable · tous · anti-slop #1, #4

> *La passe finale qui fait « sans rougir ».* On applique ici le **test slop** (§ 1) écran par écran.

- **H.1** **Durcissement perf à l'échelle cible** : `React.memo` sur les nœuds, mémoïsation de `decoratedNodes`/`dirtyMap`, éventuel `React.lazy` (BlockEditor/DataPreview/WorkflowFlow), CSS splitté si modularisé. **Pourquoi :** 07 § 6 — `memo()` absent, recopies O(N+E) à chaque rendu, tout charge d'un coup. **Terminé :** un workflow de ~100 blocs reste fluide (frappe dans `wfName` ne lague pas). **Dép. :** D.9 **Taille :** M *(taille réelle selon Q4/Q5)*
- **H.2** **Passe « 4 états » exhaustive** : vérifier *chaque* vue (vide/chargement/erreur/idéal), supprimer les écrans blancs (ex. canevas pendant l'hydratation ~300 ms, `getWorkflow` sans `.catch`, constats 04 § 2). **Terminé :** aucune vue ne peut tomber sur un écran blanc ou un état non géré. **Dép. :** D.8 (`EmptyState`) **Taille :** M
- **H.3** **Cohérence visuelle finale** : audit de densité/typographie/espacement après tokenisation ; mode sombre (`prefers-color-scheme`) optionnel et *sobre* (pas de néon). **Pourquoi :** constats 05 #28, anti-slop #1/#4. **Terminé :** rendu cohérent, dense, intentionnel ; (option) sombre sobre. **Dép. :** D.1-D.3 **Taille :** M
- **H.4** **Positionnement / page produit non-slop** : si une landing est créée, **pas** de hero générique ni de dégradé violet ni d'emoji-spam — montrer le produit *en action* (un vrai workflow, un vrai « Documenter »), un discours spécifique au métier (data-prep visuelle, lignage Excel, dry-run). **Pourquoi :** anti-slop #1/#2 ; différenciateurs rares à mettre en avant (audit 09 Q12 : « Documenter » + dry-run de Validation). **Terminé :** la page passe le test slop (« fait par quelqu'un qui connaît le domaine »). **Dép. :** G.4 **Taille :** M
- **H.5** **QA finale + audit a11y de sortie + check d'intégrité FR** : rejouer A.11, l'audit Axe (E.7), et un parcours complet sur 3 OS. **Terminé :** checklist de release verte. **Dép. :** tout v0.4/v0.5 **Taille :** S

---

### Track futur — Multi-utilisateur / cloud (différé, mais graines plantées)

> *Différé volontairement (Q2 « à voir pour la suite »).* On **ne le construit pas**, mais on évite trois pièges qui coûteraient une refonte plus tard :

- **Graine 1 — API versionnée + auth-ready.** Préfixer les routes `/api/v1` (XS, à faire avec B.6) pour pouvoir évoluer sans casser. Garder un point d'injection d'authentification (middleware) même inactif.
- **Graine 2 — Frontière d'état claire.** Quand on introduit la couche d'état pour l'undo (E.1) et/ou une couche de requêtes (P4), choisir une abstraction qui pourra demain parler à une API distante (et pas seulement au disque local). Ne pas câbler `127.0.0.1` en dur dans la logique métier front.
- **Graine 3 — Modèle de données « propriétaire-able ».** Le modèle disque actuel (projets/parquets locaux) est très bien pour le local ; documenter clairement la frontière storage (déjà nette : `storage.py` 231 LOC) pour qu'une future implémentation « DB partagée + object storage » soit un remplacement, pas une réécriture.

*Ce qui viendra vraiment plus tard (hors scope v1.0) :* authentification/comptes, partage de projets, collaboration temps réel, exécution serveur des gros volumes (streaming/chunking, audit 07 § 6.2), import de workflows tiers **sandboxés** (dépend de B.4).

---

## 5. Milestones (le plan de release)

> Chaque milestone est une **release taguée** (G.5). Rien ne se publie avant v0.2. v1.0 = « publiable sans rougir ».

### v0.2 — « Fondations fiables » *(non négociable avant toute publication)*
Le socle de confiance + le filet.
- **Chantier 0** : 0.1, 0.2, 0.3, 0.6, 0.7, 0.8 (lint/format/tests/CI/locks/build prod).
- **Chantier A** (cœur intégrité FR) : A.1, A.2, A.3, A.4, A.7, A.9, A.11.
- **Chantier B** (chaîne de sécurité) : B.1, B.2, B.3, B.5.
- **Confiance UX minimale** : C.3 (beforeunload), C.4 (échecs API visibles).
> *Sortie de v0.2 = Roade ne corrompt plus silencieusement un CSV FR, ne peut plus être détourné pour exécuter du code, et ne perd plus de modif en silence. C'est le minimum pour montrer le produit à quelqu'un.*

### v0.3 — « Ossature qui tient l'échelle »
- **Chantier C** : C.1 (routing), C.2, C.5, C.6.
- **Chantier D phase 1+2 (début)** : D.1, D.2, D.3 (tokens), puis D.4 (Button), D.5 (Modal), D.6/D.7 (champs + ColumnPicker typé).
- **Chantier 0** : 0.4, 0.5 (tests API + front), 0.9 (typage de la shape Validation).
- **Chantier A** : A.5, A.6 (cast/dates), A.10 (historique de runs).

### v0.4 — « UX d'éditeur »
- **Chantier E** : E.1 (undo/redo), E.2 (stop), E.3 (validation pré-run), E.4/E.5 (dialogs), E.6 (raccourcis + Ctrl+K), E.7 (a11y), E.8/E.9/E.10 (découvrabilité, légendes, doublons).
- **Chantier F** : F.0 (contrat), F.1 (Union), F.2 (Pivot), F.3 (Filtre), F.4 (exemples), F.5 (volumes).
- **Chantier D** : D.8 (reste des primitives), D.9 (modularisation Inspector/engine), D.10 (i18n des chaînes).
- **Chantier A** : A.8 (Excel malformé).

### v0.5 — « Distribuable »
- **Chantier G** : G.1 (multiplateforme/packager), G.2 (démo), G.3 (onboarding), G.4 (README+captures), G.5 (versioning), G.6 (licence).
- **Chantier B** : B.4 (sandbox SQL raw), B.6 (codes d'erreur + `/api/v1`).

### v1.0 — « Publiable sans rougir »
- **Chantier H** : H.1 (perf), H.2 (4 états exhaustif), H.3 (cohérence visuelle + sombre sobre), H.4 (positionnement non-slop), H.5 (QA + a11y + intégrité FR).
- Les **graines** du Track futur (1, 2, 3) sont en place pour le cloud.

### post-v1.0 — Track cloud/multi-utilisateur
Auth, partage, collaboration, exécution serveur des gros volumes, import sandboxé.

---

## 6. Décisions qui restent à trancher (et leur impact)

> Ces forks changent *comment* on exécute, pas *quoi*. À trancher avant d'attaquer le chantier concerné.

1. **Typage : TypeScript incrémental vs PropTypes/JSDoc ?** (0.9) — TS est plus robuste et « pro » (et attendu par des contributeurs), mais c'est un investissement L. PropTypes est S mais plus faible. *Reco :* TS incrémental (`allowJs`), fichier par fichier, en commençant par le modèle de données. **Impact :** taille de 0.9 et de toute la suite.
2. **Modèle d'undo/redo : commandes maison vs lib d'état (zustand+temporal) ?** (E.1) — une lib d'état clarifie aussi P4 (couche d'état) et sert la *graine 2* du cloud. *Reco :* introduire *zustand* pour l'état d'éditeur et bâtir l'undo dessus. **Impact :** archi front, graine cloud.
3. **Packager de distribution : Tauri vs Electron vs Docker-only ?** (G.1) — Tauri = binaire léger, sobre, anti-slop ; Electron = plus lourd mais familier ; Docker = pour les techniques seulement. *Reco :* Tauri pour le grand public + Docker pour les techniques. **Impact :** G.1.
4. **Licence : AGPL-3.0 vs MIT/Apache-2.0 ?** (G.6) — AGPL protège un futur cloud (un tiers ne peut pas en faire un SaaS fermé) ; MIT/Apache maximise l'adoption. *Reco :* dépend de l'ambition commerciale du futur cloud (Q11/Q2). **Impact :** stratégie produit.
5. **i18n : FR-only d'abord, ou FR+EN dès v1.0 ?** (D.10) — « publiable pour des tiers » peut vouloir dire au-delà du public FR. *Reco :* centraliser les chaînes maintenant (D.10), traduire EN seulement si la cible le justifie. **Impact :** portée de D.10 et de H.4.
6. **Confirmer les hypothèses de volumétrie (Q4/Q5).** Si des fichiers > 500 Mo ou des workflows > 200 blocs sont réalistes, H.1 grossit et l'exécution serveur (Track futur) remonte en priorité.

---

## 7. Comment passer ce plan à Claude Code

On découpe **par chantier**, et au sein d'un chantier **par todo**, dans l'ordre des milestones. Convention de brief recommandée pour chaque lot confié à Claude Code :

1. **Contexte** : le ou les `ID` de todos visés + les `fichier:ligne` cités ici.
2. **Définition de terminé** : reprendre le critère vérifiable du todo (c'est le test d'acceptation).
3. **Garde-fous** : « ne pas modifier le rendu existant », « passer par les primitives D.x », « respecter la doctrine anti-slop § 1 », « tout nouveau code typé + testé + linté (Chantier 0) ».
4. **Livrable** : code + tests + une note de ce qui a changé, à me rapporter ici pour revue avant le lot suivant.

**Premier lot recommandé (démarrer v0.2) :** Chantier 0 (0.1 → 0.8) *puis* A.1+A.2+A.3 (intégrité FR) en parallèle de B.1+B.2+B.3 (chaîne de sécurité). C'est le lot qui retire le plus de risque, et c'est exactement ce qui sépare « démo bricolée » de « produit qu'on ose montrer ».

> **Rappel du fil rouge.** À chaque écran, à chaque PR : *« est-ce que ça ressemble à n'importe quel SaaS, ou à un outil fait par quelqu'un qui connaît le traitement de données ? »* Si c'est le premier, on recommence.
