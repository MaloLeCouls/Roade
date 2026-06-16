# Roade — Guide d'audit pour Claude Code
### Étape 1/3 du chantier « de l'amateur au pro »

> **À lire en premier.** Ce document a deux rôles. (1) Il fixe le **référentiel** : ce qui sépare réellement un logiciel *pro* d'un logiciel *amateur*, appliqué précisément à Roade. (2) Il te demande, à toi Claude Code, de produire une **série de fichiers `.md` de diagnostic** du dépôt réel. Ces `.md` seront ensuite relus pour bâtir une roadmap détaillée. **Cette phase est un diagnostic, pas une réécriture : ne modifie pas le code applicatif.**

---

## Partie 0 — Contexte & mission

**Le produit.** Roade est un **éditeur visuel de workflows de traitement de données** (Excel/CSV) : on crée un *projet* (un dossier sur le disque), on importe des fichiers, et on assemble des *blocs* reliés sur un canevas (Source, SQL, Doublons, Validation, Pivot, Nettoyage, Calcul, Filtre, Colonnes, Analyse, Union, Export, Cadre, Bouchon). Chaque bloc matérialise son résultat en Parquet ; tout se recalcule en cascade à l'exécution, avec un cache incrémental.

**La stack.** Backend **FastAPI + DuckDB + pandas** (`backend/`). Frontend **React 18 + Vite + React Flow / @xyflow** (`frontend/`). Application **locale** (lancée par `start.ps1`, ouvre fichiers et dossiers via l'OS, sert sur `localhost`). Pas (encore) de SaaS multi-utilisateur.

**La catégorie.** Roade est dans la famille des **outils de data-prep / ETL visuels no-code**. Ses cousins directs : **KNIME** (gratuit, desktop, à base de nœuds — le plus proche), **Easy Data Transform** (wrangling visuel focalisé), avec **Alteryx** comme référence haut de gamme (réputé pour ses blocs prêts à l'emploi, sa gestion *sans douleur* des types de données, et ses aperçus riches par nœud), ainsi que **Tableau Prep**, **Power Query** et **Mammoth**. C'est l'étalon « inspiré des plus grands ».

**L'objectif final (étape 3).** Passer d'« une webapp solide faite par un étudiant, taillée pile pour son besoin » à un produit **pro** : cohérent, prévisible, robuste aux cas limites, à profondeur fonctionnelle homogène, et dont un nouvel utilisateur expérimenté comprend la logique en quelques minutes.

**Ta mission ici (étape 2).** Documenter **le réel** — pas l'idéal, pas le souhaité — avec rigueur, honnêteté et références précises au code (`fichier:ligne`). Le but est de me donner une vérité-terrain exhaustive pour que je puisse, ensuite, transformer ce diagnostic + ce référentiel en une todolist d'exécution.

---

## Partie 1 — Le référentiel : ce qui distingue un produit pro d'un produit amateur

> Sers-toi de cette partie comme **grille d'audit**. Chaque principe a : *l'idée*, *pourquoi ça compte*, *le signe « amateur »*, *le standard « pro »*, et *l'application à Roade*. Quand tu rédigeras `05_UX_HEURISTIC_AUDIT.md`, tu rattacheras chaque constat à l'un de ces principes (P1…P13).

### La thèse en une phrase

> **L'amateur construit vers l'extérieur, à partir des fonctionnalités dont l'auteur a besoin, et valide sur les chemins que l'auteur emprunte. Le pro construit vers l'intérieur, à partir d'invariants, de contrats et d'états définis une seule fois — de sorte que la qualité est *structurelle*, pas maintenue à la vigilance.**

L'écart se voit presque entièrement **aux bords** : les chemins malheureux, les états vides / en chargement / en erreur, le *deuxième* utilisateur qui ne partage pas le modèle mental de l'auteur, et l'instant où quelque chose tourne mal. La leçon transversale de toute la data-prep : **~80 % du temps d'analyse est du temps de préparation** ; donc la facilité d'usage et la *confiance* dans le résultat ne sont pas du vernis, elles *sont* le produit.

> **Cas particulier de Roade — à garder en tête en permanence.** Le chemin heureux et même la finition visuelle de Roade sont **déjà proches du pro** (voir Partie 2). L'écart n'est donc *pas* « il faut faire propre ». Il est concentré sur trois axes : **(A) une structure qui fait passer la qualité à l'échelle** (routage, couche d'état, design system, types/tests/CI) ; **(B) les bords** (annulation, accessibilité, prévention d'erreur, intégrité des données aux frontières) ; **(C) l'homogénéité de la profondeur** entre fonctionnalités. Ne propose jamais de jeter du bon travail existant.

---

### Famille A — Structure : la qualité qui passe à l'échelle

**P1 — État adressable (routing).**
*Idée :* chaque état significatif de l'app a une URL ; l'app survit à un rafraîchissement et au bouton « précédent ».
*Pourquoi :* l'adressabilité, c'est partageable, *bookmarkable*, *deep-linkable*, restaurable, et testable. C'est l'un des signaux pro/amateur les plus nets sur le web.
*Signe amateur :* la navigation vit dans un `useState` ; un F5 renvoie à l'accueil ; impossible de partager un lien vers « ce workflow, ce bloc ».
*Standard pro :* routeur, URL = source de vérité de l'état de navigation, historique navigateur fonctionnel, liens profonds (`/projet/:pid/workflow/:wid?node=:id`).
*Roade :* la navigation est un objet `view` dans `App.jsx` (`{name:'projects'} | {name:'project',pid} | {name:'workflow',pid,wid}`) ; le fil d'Ariane affiche littéralement `workflow` au lieu du nom. Pas de routeur, pas de deep-link, F5 perd l'emplacement.

**P2 — Cohérence par construction (design system + primitives).**
*Idée :* la cohérence ne se maintient pas à la main ; elle découle de *primitives* réutilisables (Button, Input, Select, Modal, Menu, Tooltip, Tabs, Banner…) et de *tokens* documentés.
*Pourquoi :* sans système, chaque nouvelle fonctionnalité re-décide des marges, des rayons, des couleurs — la cohérence dérive dès que le produit grossit ou qu'une autre main y touche.
*Signe amateur :* un gros fichier CSS unique ; des styles de boutons/champs ré-écrits au cas par cas ; rayons et espacements « à peu près » alignés.
*Standard pro :* tokens (couleur/espace/rayon/typo/ombre) → primitives → composants. La cohérence devient *automatique*.
*Roade :* le CSS est **soigné** (variables `--t-*` par type, attention au détail) mais c'est **un seul `styles.css` de ~870 lignes**, sans primitives React. La cohérence tient aujourd'hui à la *discipline* d'un seul auteur — ce qui ne passe pas à l'échelle. C'est la ligne pro/amateur *au niveau du code*, pas du rendu.

**P3 — La qualité est automatisée (types, tests, lint, CI).**
*Idée :* le pro ne *space* pas la qualité, il l'*outille* : barrières automatiques qui empêchent une régression d'arriver.
*Pourquoi :* la qualité « à la main » s'érode à chaque modification ; l'automatisation la rend permanente et permet de refactorer sans peur.
*Signe amateur :* aucun typage, scripts de test ad-hoc lancés à la main, pas de lint, pas de CI, « ça marche sur ma machine ».
*Standard pro :* typage (TypeScript / au moins PropTypes ou validation runtime), suite de tests structurée (pytest + tests front), lint + format (ESLint/Prettier), CI qui bloque sur échec, versions et changelog.
*Roade :* **aucun TypeScript ni PropTypes** ; les tests backend sont des **scripts ad-hoc `_test_*.py`** (bon réflexe, mais hors framework/CI) ; **aucun ESLint/Prettier, aucun `.github/workflows`** ; dépôt « No releases published ». L'instinct qualité existe ; l'outillage manque.

**P4 — Une vraie couche d'état & d'asynchrone.**
*Idée :* les accès réseau, le cache, le chargement et les erreurs suivent *un* modèle prévisible, pas du `fetch` + `useState` recopié partout.
*Pourquoi :* le copier-coller d'effets crée des conditions de course, des états de chargement incohérents, des requêtes en double, des fuites.
*Signe amateur :* chaque composant gère seul `loading/error`, des `useEffect` qui se contredisent, des gardes `alive` manuelles disséminées.
*Standard pro :* une couche de données (React Query/SWR ou équivalent maison rigoureux) : déduplication, cache, invalidation, états dérivés, annulation propre ; mises à jour optimistes maîtrisées.
*Roade :* beaucoup de `useState` + effets + hydratation manuelle du statut/des schémas ; gardes `alive` présentes (bon point), mais le motif est répété et fragile. L'auto-save *debounced* est bien fait, mais il n'y a **pas de garde « modifications non enregistrées »** à la fermeture, ni d'historique de versions.

---

### Famille B — Le contrat avec l'utilisateur : prévisibilité & confiance

**P5 — Réversibilité.**
*Idée :* toute action est annulable ; rien de destructif n'est irréversible en un clic.
*Pourquoi :* la réversibilité, c'est ce qui autorise l'exploration sans peur — le cœur de l'expérience d'un éditeur.
*Signe amateur :* pas d'annuler/refaire ; une suppression efface définitivement.
*Standard pro :* **Undo/Redo** (Ctrl+Z / Ctrl+Y) couvrant ajout/suppression/déplacement/édition de config, modèle de commandes, confirmations sur l'irréversible, corbeille/restauration.
*Roade :* **aucun undo/redo** (vérifié : zéro occurrence). Sur un éditeur de canevas, c'est un manque pro majeur. La suppression de bloc/projet/workflow est immédiate.

**P6 — La règle des quatre états.**
*Idée :* chaque vue gère explicitement **vide, en chargement, en erreur, idéal** — et non seulement le cas « tout va bien et il y a des données ».
*Pourquoi :* les amateurs livrent le 4ᵉ état ; les pros livrent les quatre. Les trois autres sont là où l'expérience casse.
*Signe amateur :* écran blanc pendant un chargement, page cassée si l'API échoue, vide sans explication ni action.
*Standard pro :* squelettes de chargement, états vides *pédagogiques* avec action (« Importez un fichier pour commencer »), états d'erreur *récupérables* (réessayer), états idéaux soignés.
*Roade :* quelques *hints* de canevas et une `ErrorBoundary` (bon point), mais à auditer vue par vue : la liste de projets, la liste de fichiers, l'aperçu, le profil, l'éditeur de bloc ont-ils *chacun* leurs 4 états ?

**P7 — Prévention d'erreur plutôt que message d'erreur (Nielsen #5).**
*Idée :* rendre les états invalides *impossibles* ou *signalés en amont* vaut mieux qu'un message après l'échec.
*Pourquoi :* un bon outil empêche de se tromper ; un outil moyen explique pourquoi on s'est trompé.
*Signe amateur :* on peut lancer un graphe invalide et on découvre l'erreur au runtime ; aucune indication visuelle avant exécution.
*Standard pro :* **validation statique du pipeline** (entrée requise non branchée, cycle, type de colonne incompatible, doublon de nom de colonne) affichée **en ligne, sur les nœuds**, *avant* le run ; champs contraints ; désactivation des actions impossibles avec explication.
*Roade :* la validation existe surtout **côté backend, au runtime** (`engine.py` lève « entrée principale "données" non connectée », gère les cycles en append, `prune_orphan_edges`). Mais il manque la **validation proactive visuelle sur le canevas** : un nœud mal configuré n'affiche pas d'état d'erreur *avant* de lancer.

**P8 — Visibilité de l'état du système & retour (Nielsen #1).**
*Idée :* l'app dit toujours ce qu'elle fait et dans quel état sont les choses.
*Pourquoi :* la confiance naît de la lisibilité de l'état.
*Standard pro :* progression en direct, états par élément, horodatage, « à jour / périmé ».
*Roade :* **point fort déjà pro.** Run en streaming (SSE) avec barre de progression sans *layout shift*, glow du nœud en cours, sous-progression animée, détection de blocs *périmés* (`__dirty`) propagée en ordre topologique, calibrage du débit de lecture. **À conserver et étendre, pas à refaire.**

**P9 — Découvrabilité & divulgation progressive.**
*Idée :* un utilisateur expérimenté *prédit* où sont les choses ; la complexité se dévoile par couches.
*Pourquoi :* « un gros utilisateur de systèmes comprend vite un nouveau » parce que le produit respecte les conventions et hiérarchise.
*Signe amateur :* tout au même niveau, conventions ignorées, raccourcis absents, pas de recherche/commandes.
*Standard pro :* IA prévisible, conventions respectées (Ctrl+S, Ctrl+Z, Suppr, double-clic = ouvrir/éditer), **raccourcis clavier** complets, **palette de commandes** (Ctrl+K), aide contextuelle, onboarding et **modèles/exemples** prêts à l'emploi.
*Roade :* clavier minimal (seulement *Échap* pour fermer, *Entrée* pour valider — vérifié) ; pas de palette de commandes ; pas de modèles/projet d'exemple. La barre d'outils et l'éditeur de bloc unifié sont de bonnes décisions d'IA (l'auteur a déjà neutralisé la duplication de boutons « Exécuter »).

**P10 — Parité de profondeur (le contrat des blocs).**
*Idée :* des fonctionnalités comparables ont une **profondeur comparable**. (C'est exactement la crainte exprimée : « pas de feature hyper pointue sur un point et rien sur l'autre ».)
*Pourquoi :* l'irrégularité de profondeur trahit le produit « taillé pour mon besoin » : l'auteur a creusé ce qui le servait.
*Signe amateur :* un bloc surpuissant (10 options, testeur, aperçu), un autre famélique (2 options, pas d'aperçu, pas d'aide).
*Standard pro :* un **contrat de capacités** que *chaque* bloc honore (socle commun), au-delà duquel chacun ajoute sa spécificité.
*Roade :* dissymétrie probable. La **Validation** est très profonde (mode route, conditions, masques, contrôle par groupe, sorties multiples, testeur, *split-scan*, intention) ; d'autres blocs sont minces (Union ≈ 26 lignes, Pivot/Calc plus simples). À cartographier rigoureusement — voir `03_BLOCK_CAPABILITY_MATRIX.md`.

**P11 — Accessibilité (a11y).**
*Idée :* le produit est utilisable au clavier, par les lecteurs d'écran, avec un contraste suffisant et le respect des préférences (mouvement réduit).
*Pourquoi :* c'est un marqueur pro/amateur quasi infaillible — les amateurs l'omettent presque toujours ; c'est aussi de la qualité d'usage pour *tous*.
*Signe amateur :* navigation souris-only, menus non focalisables, aucun `aria-*`/`role`, pas de gestion du focus, pas de `prefers-reduced-motion`.
*Standard pro :* cible WCAG AA : focus visible et piégé dans les modales, menus navigables au clavier, rôles/labels ARIA, contrastes vérifiés, alternatives au *drag*.
*Roade :* **quasi inexistante** — *5 occurrences* `aria/role/tabIndex` dans tout le front. Gros gisement d'amélioration.

---

### Famille C — Vérité du domaine : spécifique à un outil de données

**P12 — Intégrité des données aux frontières.**
*Idée :* un outil de données se juge à la *lecture* et à l'*écriture* — là où les fichiers réels, sales et localisés, entrent et sortent.
*Pourquoi :* c'est *la* source de confiance. Un seul chiffre faux à cause d'un point/virgule mal lu, et l'utilisateur ne fait plus jamais confiance à l'outil. Les comparatifs de la catégorie pointent tous la gestion des **types** comme le facteur décisif d'usage.
*Signe amateur :* lecture en UTF-8 only, séparateur figé, pas de gestion de la virgule décimale, types devinés silencieusement, plantage sur fichier « bizarre ».
*Standard pro :* détection/*override* d'encodage (UTF-8 **et** Latin-1 / Windows-1252), du séparateur, de la **virgule décimale** et du séparateur de milliers (FR !), des dates ; types affichés et *corrigeables* par l'utilisateur (cf. Alteryx) ; comportements explicites sur fichiers malformés ; retours clairs sur les très gros fichiers.
*Roade :* la lecture CSV **sniffe le séparateur** (`pd.read_csv(sep=None, engine="python")`, `engine.py`) — bien. Mais **aucune gestion explicite de l'encodage** (pandas part en UTF-8 → casse/mojibake sur les exports Excel FR en Latin-1/CP1252, très fréquents) et **aucune gestion de la virgule décimale / séparateur de milliers**. Pour un outil **francophone**, c'est un défaut d'intégrité concret et prioritaire à documenter.

**P13 — Reproductibilité & lignage.**
*Idée :* un même workflow sur les mêmes entrées donne le même résultat ; on peut *retracer* comment un fichier de sortie a été produit, et *quand*.
*Pourquoi :* sans reproductibilité ni traçabilité, un outil de données n'est pas « pro » au sens métier (audit, conformité, confiance).
*Signe amateur :* résultats non déterministes, aucun journal de run, cache dont on ne sait pas s'il peut servir une donnée périmée.
*Standard pro :* exécution déterministe, **historique des runs** (quand, quoi recalculé, durées, erreurs), **lignage** (de la source à l'export), cache dont la *signature* est prouvée complète.
*Roade :* **« Documenter (Excel) »** est un vrai différenciateur de lignage (une feuille par sortie, étape par étape, lisible sans l'app) — excellent socle. À étendre : pas d'**historique de runs** in-app ; la **complétude de la signature de cache** (`_node_signature` / `cleanForSig`) doit être auditée (un changement non capté = parquet périmé servi silencieusement).

---

### Le cas particulier transversal : « les cinq premières minutes »

L'impression « pro » se joue aussi à l'**installation** et au **premier contact**. Aujourd'hui : install manuelle (venv, npm), **scripts Windows-only** (`start.ps1`/`.bat`), pas d'exécutable empaqueté ni de Docker, README orienté développeur, pas de projet de démonstration. Le pro : une commande unique multiplateforme (ou un installeur), un projet d'exemple pré-rempli, un guide utilisateur, des versions datées avec changelog.

---

## Partie 2 — Ce que Roade fait DÉJÀ bien (à ne pas casser)

Calibre tout le diagnostic là-dessus : Roade n'est pas un brouillon, c'est un produit soigné avec des manques *ciblés*.

- **Finition visuelle** : tokens CSS, identité couleur par type de bloc, soin du détail (progression sans *layout shift*, micro-animations, info-bulles, menus contextuels).
- **Moteur incrémental** : cache + détection de péremption en cascade (ordre topologique) — réellement avancé.
- **Exécution en streaming (SSE)** : progression en direct, glow du nœud actif, timer.
- **Cas limites maîtrisés** : edges fantômes après suppression de sorties de route, remesure des *handles* React Flow, ordre parent-enfant, migration de modèles de données *legacy*.
- **Auto-lignage** : l'export Excel « Documenter » est un atout rare dans cette catégorie.
- **IA déjà réfléchie** : éditeur de bloc unique (Inspector = réglages à gauche, vue live à droite) ; duplication de boutons « Exécuter » déjà neutralisée par l'auteur.
- **Réflexe qualité** : présence de scripts de test backend (à industrialiser, pas à inventer).

---

## Partie 3 — Les livrables : les fichiers `.md` à produire

Crée un dossier **`docs/audit/`** et produis-y les fichiers ci-dessous. **Contraintes communes à tous :**
- **Vérité-terrain uniquement.** Tout constat factuel cite `chemin/fichier.ext:ligne`.
- **Quantifie** (LOC, nb d'options, nb d'occurrences, nb de clics…).
- **Honnêteté > flatterie.** Le commanditaire veut un diagnostic franc, pas des compliments. Mais relie chaque faiblesse au principe P1–P13 concerné.
- **Diagnostic, pas solution.** Ne propose pas (encore) de correctifs ni de refonte : décris l'existant. Les solutions seront décidées à l'étape 3.
- **Signale la pertinence FR** (encodage, virgule décimale, vocabulaire) partout où elle s'applique.
- Utilise des **tableaux** là où c'est demandé, pour que les sorties soient fusionnables.

### `00_README.md` — index & auto-évaluation
- Table des matières des `.md` produits, en une ligne chacun.
- **Couverture & confiance** : pour chaque fichier, ton niveau de confiance (élevé/moyen/faible) et ce que tu n'as pas pu vérifier.
- Méthode : comment tu as exploré le dépôt (commandes, fichiers lus intégralement vs survolés).

### `01_ARCHITECTURE_AND_INVENTORY.md` — carte du système
- **Stack & build** : versions exactes (lis `package.json`, `requirements.txt`), comment ça se lance, ce qui est Windows-only.
- **Carte des modules** : *tableau* `fichier | rôle | LOC | complexité (faible/moyenne/élevée) | dépendances internes`. Marque les fichiers monolithiques (ex. `Inspector.jsx`, `WorkflowEditor.jsx`).
- **Modèle de données runtime** : le schéma JSON **exact** d'un projet, d'un workflow, d'un nœud et d'une *edge* (champs, types), avec **un exemple réel** tiré d'un fichier de `projects/` si disponible.
- **Surface API** : *tableau* `méthode | chemin | rôle | params | forme de la réponse` pour les ~30 routes de `backend/main.py`.
- **Navigation actuelle** : décris la machine à états `view` (`App.jsx`), ce qui est atteignable depuis où, et constate l'absence de routeur/URL (P1).
- **Dépendances** : ce qui est utilisé, et surtout **ce qui manque** structurellement (routeur, lib d'état, lib de requêtes, lib de composants, typage, tests front).

### `02_BLOCK_CATALOG.md` — catalogue fonctionnel exhaustif
Pour **chaque** bloc (les 14), une fiche : *but* · *entrées/sorties (handles, nb max d'entrées)* · *schéma de config complet* (chaque champ : nom, type, défaut — lis `DEFAULT_DATA` dans `WorkflowEditor.jsx` et les `*Config` de `Inspector.jsx`) · *fonction backend qui l'exécute* (`engine.py`) · *aperçu/profil supportés ?* · *comportement en erreur/validation* · *cas limites gérés* · *limites connues*.

### `03_BLOCK_CAPABILITY_MATRIX.md` — matrice de profondeur (cœur de P10)
**Un seul grand tableau.** Lignes = les blocs. Colonnes (✅/⚠️/❌ + note brève) :
`UI de config dédiée` · `sélecteur de colonnes typé` · `aperçu live` · `profilage de colonne` · `validation pré-run en ligne` · `état d'erreur affiché sur le nœud` · `aide/info-bulles par option` · `exemples/modèles` · `retour sur gros volumes` · `chaînes i18n centralisées`.
Termine par un **paragraphe « dissymétries les plus criantes »** : les 3–5 écarts de profondeur les plus visibles.

### `04_USER_FLOWS.md` — parcours réels
Pour chaque tâche clé, le **pas-à-pas cliquable** *réel*, avec **nombre de clics**, points de blocage, impasses, et ce qui n'est **pas** atteignable :
1. Créer un projet → importer un fichier.
2. Construire un workflow (ajouter/relier des blocs).
3. Configurer un bloc, prévisualiser, profiler une colonne.
4. Exécuter (et options « Tout recalculer » / « Super run »).
5. Exporter, puis « Documenter ».
6. Retrouver/rouvrir un travail (que se passe-t-il après un F5 ? — P1).
Note tout endroit où **deux contrôles font la même chose** (crainte explicite du commanditaire).

### `05_UX_HEURISTIC_AUDIT.md` — audit heuristique
*Tableau* `# | constat | fichier:ligne | principe (P1–P13) + Nielsen | sévérité (bloquant/majeur/mineur/cosmétique) | preuve`.
Couvre les 10 heuristiques de Nielsen **et** les principes P1–P13. Sois concret : pas « améliorer l'UX » mais « le bouton X et le menu Y déclenchent la même action Z (`fichier:ligne`) ».

### `06_DESIGN_SYSTEM_AUDIT.md` — audit du design system (P2)
- **Tokens** : déclarés (`:root` de `styles.css`) vs **réellement utilisés** ; valeurs en dur qui contournent les tokens.
- **Motifs UI récurrents** : boutons (variantes), champs, modales, menus, info-bulles, onglets, bannières, cartes — *où chacun est ré-implémenté en ligne* plutôt que factorisé.
- **Incohérences** : rayons, espacements, tailles de police, couleurs effectivement employés (relève les divergences).
- **Liste des primitives manquantes** : les composants qu'il *faudrait* extraire pour rendre la cohérence automatique.
- Constate le **fichier CSS unique** et sa structure.

### `07_TECH_HEALTH_AND_RISKS.md` — santé technique & risques (P3, P4)
- **Points chauds de rendu** / gros composants (impact perf), couplage, code mort.
- **Tests** : recense les `_test_*.py`, ce qu'ils couvrent, leur nature ad-hoc ; **absence de CI/lint/format/typage**.
- **Gestion d'erreurs** : motifs actuels (banners, `ErrorBoundary`, gardes `alive`), incohérences.
- **Sécurité / vie privée** (même en local) : l'app ouvre fichiers et **dossiers via l'OS** (`open`, `open-folder` dans `main.py`) — surface d'injection ? chemins non assainis ? CORS ? le `run-stream` ?
- **Perf** : comportement avec **beaucoup de nœuds** et **gros fichiers** ; *splitting*/lazy-load.
- **Distribution** : friction d'installation, scripts Windows-only, absence de release/changelog.

### `08_DATA_INTEGRITY_AND_CORRECTNESS.md` — audit métier des données (P12, P13)
Le plus important pour un outil de données. Documente **précisément**, code à l'appui :
- **Encodage** : UTF-8 only ? gestion Latin-1/CP1252 ? (cherche tout `encoding=` dans `engine.py`).
- **Séparateur** CSV, **virgule décimale**, **séparateur de milliers**, **dates** : que se passe-t-il sur un CSV FR (`1 234,56` / `;`) ?
- **Inférence & coercition de types** : comment DuckDB/pandas devine ; l'utilisateur peut-il corriger ?
- **Valeurs nulles/vides**, **noms de colonnes en double**, **en-têtes multi-lignes**, **cellules fusionnées**, **xlsx corrompu**.
- **Gros fichiers** : mémoire, *streaming*, plafond d'aperçu (`limit`).
- **Correction du cache** : la signature (`_node_signature`, `cleanForSig`, `nodeDataSig`) est-elle **complète** ? Un changement de config peut-il échapper à la signature et servir un Parquet périmé ?
- **Déterminisme / reproductibilité** d'un run ; comportement flottant/précision.
Pour chaque risque, donne une **note de reproduction** (le fichier/scénario qui le déclencherait).

### `09_OPEN_QUESTIONS_AND_ASSUMPTIONS.md` — questions & hypothèses
- Tes **hypothèses** (ex. « je suppose que `projects/` n'est pas versionné »).
- Ce que tu n'as **pas pu trancher** dans le code seul.
- **Questions** au commanditaire qui changeraient la roadmap (ex. « cible-t-on un jour le multi-utilisateur / le cloud ? », « public = soi-même ou des tiers ? », « Windows uniquement ou multiplateforme ? », « volumétrie typique des fichiers ? »).

---

## Partie 4 — Règles de travail pour Claude Code (cette phase)

1. **Lecture seule du code applicatif.** Tu ne crées que les `.md` dans `docs/audit/`. Aucune modification de `backend/` ou `frontend/`.
2. **Cite tes preuves** en `fichier:ligne` pour tout constat factuel.
3. **Quantifie** systématiquement.
4. **Sois franc et précis**, jamais vague ; relie chaque faiblesse à un principe P1–P13.
5. **Ne propose pas de solutions** ici — décris l'existant. (Les correctifs seront décidés ensemble à l'étape 3.)
6. **Respecte le bon existant** (Partie 2) : signale-le aussi, pour qu'on ne le casse pas.
7. **Garde la pertinence francophone** présente à l'esprit (encodage, virgule décimale, vocabulaire cohérent).
8. Quand tu as fini, mets à jour `00_README.md` avec ton **auto-évaluation de couverture**.

> **Rappel du flux global.** Étape 1 (fait) : ce guide + le référentiel. **Étape 2 (toi) : produire les 10 `.md` ci-dessus.** Étape 3 : ces `.md` seront relus pour définir les axes principaux et une todolist d'exécution ultra-détaillée vers un Roade *pro*.
