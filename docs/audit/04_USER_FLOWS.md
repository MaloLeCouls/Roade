# 04 — Parcours utilisateur réels

> Diagnostic terrain de chaque tâche-clé : *combien* de clics pour aller du démarrage à la finition, et où l'utilisateur peut tomber sur une impasse, un état non géré ou deux contrôles qui font la même chose. Tout est reconstitué à partir du code (pas de captures), avec références `fichier:ligne`. Le pas-à-pas suit le **chemin nominal** ; les variantes (raccourcis, menus contextuels, drag-and-drop) sont signalées entre crochets.
>
> Convention : on **compte un clic chaque action mouse-down distincte** (sélection d'un élément, validation, fermeture). Une saisie clavier (frappe + Entrée) compte pour 0 clic + 1 « Entrée ». Le double-clic compte pour 1 clic logique (1 geste). Les *hovers*/tooltips ne comptent pas.

---

## Parcours 1 — Créer un projet, importer un fichier

**Pré-requis** : être à l'accueil (vue `projects`, `App.jsx:9`). C'est l'état initial à chaque lancement.

| # | Geste | Cible (code) | Effet |
|---|---|---|---|
| 1 | Cliquer dans le champ « Nom du nouveau projet… » | `ProjectList.jsx:32-37` | Focus |
| — | Saisir le nom puis Entrée (ou clic « Créer ») | `ProjectList.jsx:36, 38` | `POST /api/projects` puis `onOpen(p.id)` → vue `project` |
| 2 | Clic « Importer » | `ProjectView.jsx:88-90` | Ouvre le sélecteur OS (input file caché, `multiple`, `accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt,.parquet"`) |
| 3 | Choisir un ou plusieurs fichiers + valider dans le dialogue OS | `ProjectView.jsx:19-24` | Boucle `await api.uploadFile(...)` puis recharge la liste |

**Coût** : **3 clics** (création + importation) si l'utilisateur valide le nom à la souris, **2 clics + Entrée** s'il valide au clavier.

### Quatre états par vue

- **Vide (projets)** : « Aucun projet. Créez-en un pour commencer. » (`ProjectList.jsx:45`).
- **Chargement (projets)** : « Chargement… » texte simple (`ProjectList.jsx:43`).
- **Vide (fichiers)** : « Aucun fichier. Importez vos Excel/CSV. » (`ProjectView.jsx:101`).
- **Erreur** : pas géré pour la création/suppression : un `confirm()` JS bloquant (`ProjectList.jsx:22`, `ProjectView.jsx:27,56`) suivi d'un appel API ; si l'API échoue, **rien n'est affiché** (`api.deleteProject(pid)` n'est pas dans un `try/catch`). C'est le cas de toutes les actions de cette vue : pas de toast, pas de bannière, pas d'`ErrorBoundary` locale. P6.

### Points de friction observés

- **`confirm()` natif du navigateur** pour la suppression (`ProjectList.jsx:22`, `ProjectView.jsx:27, 56`) : pas de dialog Roade, pas de focus management, pas de re-démontable. P11, P5 (réversibilité : suppression définitive en 2 clics).
- **Aucun retour visuel** pendant l'upload (`ProjectView.jsx:19-24`) : si le fichier est lourd, l'utilisateur ne sait pas si ça avance. Pas de barre de progression d'upload. P8.
- **Fichiers importés exposés à l'OS** : un clic ouvre le fichier dans l'application par défaut Windows (`ProjectView.jsx:32-35` → route `POST /api/projects/{pid}/files/{name}/open`, `main.py:148`). À auditer en 07 pour la sécurité.

### Ce qui n'est pas atteignable depuis cette vue

- **Renommer un projet** : aucune action.
- **Renommer un fichier** : aucune action.
- **Voir l'aperçu d'un fichier source avant de créer un workflow** : impossible sans créer un workflow + un bloc Source.
- **Voir la liste des workflows liés à un fichier source** : aucun back-lien.

---

## Parcours 2 — Construire un workflow (ajouter & relier des blocs)

**Pré-requis** : être dans la vue `workflow` (l'éditeur). On y entre depuis `ProjectView` par : clic sur le champ « Nom… » → Entrée ou clic « Nouveau » (`ProjectView.jsx:131-138`).

### 2.a — Ajouter un premier bloc Source

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic « + Ajouter un bloc » (toolbar) | `WorkflowEditor.jsx:868-870` | Ouvre la palette de blocs (14 entrées) |
| 2 | Clic sur « Source » (ou tout autre type) | `WorkflowEditor.jsx:873-881`, palette dans `BLOCK_PALETTE` (`WorkflowEditor.jsx:148-163`) | `addNode('source')` (`WorkflowEditor.jsx:428-473`) ; le bloc atterrit au centre de la zone visible avec un léger jitter (`WorkflowEditor.jsx:466-470`) |
| 3 | Clic sur le nœud | `WorkflowEditor.jsx:951-957` | Ouvre `BlockEditor` plein écran (modale) sauf si Maj/Ctrl/Cmd ou mode Sélection actif |
| 4 | Clic dans le sélecteur de fichier (Inspector) | `Inspector.jsx:1302+` | Liste les fichiers du projet |
| 5 | Choisir un fichier dans la liste | idem | `set({ file: ... })` — autosave en 600 ms (`WorkflowEditor.jsx:343-347`) |
| 6 | Clic « Fermer » (ou Échap) | `BlockEditor.jsx:42, 31-35` | Ferme la modale, revient au canevas |

**Coût** : **6 clics** (4 si on saisit Source d'un coup et qu'aucun fichier de feuille n'est requis).

### 2.b — Ajouter un bloc connecté à un autre (chemin nominal)

Deux chemins coexistent :

- **A. « Glisser une arête »** : depuis le rond de sortie d'un bloc, *drag* jusqu'au rond d'entrée d'un autre bloc déjà placé. `onConnect` accepte (`WorkflowEditor.jsx:413-425`). 1 geste de drag = 1 clic logique.
- **B. « Insérer sur lien »** : sélectionner une arête existante (clic dessus), ouvrir la palette « + Ajouter un bloc », choisir un bloc *insertable* (`WorkflowEditor.jsx:168` → `sql, dedup, validate, pivot, clean, calc, filter, cols, union`). Le bloc atterrit au milieu de l'arête, l'arête est coupée en deux (`WorkflowEditor.jsx:437-454`). 3 clics au lieu de 4–5.

**Coût** : 1 clic (drag pour relier) ou 3 clics (insertion sur lien) — vrai geste avancé peu découvrable (aucune mention dans la canvas-hint).

### 2.c — Mode Sélection multiple

Activer « Sélection » (toolbar, `WorkflowEditor.jsx:885-891`) → permet de dessiner un cadre pour sélectionner plusieurs blocs (`selectionOnDrag`, `WorkflowEditor.jsx:975-977`). Une *canvas-hint* explique le mode (`WorkflowEditor.jsx:990-995`). C'est un **mode persistant** : tant qu'il n'est pas redésactivé, le clic gauche dessine au lieu de panner.

### Quatre états par vue

- **Vide (canevas)** : *canvas-hint* « Ajoutez un bloc 📥 Source pour commencer, puis reliez-le à un bloc 🧮 SQL. » (`WorkflowEditor.jsx:986-988`).
- **Chargement initial** : le `useEffect` de chargement (`WorkflowEditor.jsx:262-336`) n'affiche **aucun spinner** sur le canevas pendant l'hydratation des `status`. L'utilisateur voit un canevas vide pendant ~300 ms (`loaded.current = true` à `+300ms`). P6 non strictement honoré.
- **Erreur** : si `getWorkflow` échoue → écran blanc (pas de `.catch`). Le « `ErrorBoundary` » (`BlockEditor.jsx:50`) ne couvre que l'éditeur de bloc, pas le canevas.

### Friction & impasses

- **Pas de palette par drag-and-drop** : on ne peut pas faire glisser « Source » depuis la palette directement sur le canevas — il faut cliquer, le bloc apparaît au centre. P9.
- **Pas de palette latérale persistante** : le menu « Ajouter un bloc » est un *dropdown* qui se referme à chaque clic en dehors (`WorkflowEditor.jsx:607-614`). Ajouter 5 blocs = 5 ouvertures de palette.
- **Aucun ALIGN/snap automatique** : les blocs s'empilent en cascade quand on en ajoute plusieurs au même endroit (`WorkflowEditor.jsx:466-470`). Pas de grille magnétique, pas de bouton « auto-layout ».
- **Aucun raccourci clavier** : pas de `Ctrl+A`, pas de `Ctrl+D` (dupliquer), pas de `Ctrl+Z`. Suppr/Backspace fonctionnent (`deleteKeyCode`, `WorkflowEditor.jsx:973`). P5, P9.
- **Édition du nom de workflow inline dans la toolbar** (`WorkflowEditor.jsx:866`) — visible mais sans label « Nom ». L'utilisateur peut le modifier sans s'en rendre compte.

---

## Parcours 3 — Configurer un bloc, prévisualiser, profiler une colonne

**Pré-requis** : au moins un bloc placé et — pour la prévisualisation — exécuté au moins une fois.

### 3.a — Ouvrir l'éditeur de bloc

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic sur le nœud | `WorkflowEditor.jsx:951-957` | Ouvre `BlockEditor` plein écran (modale) |

**Coût** : 1 clic. L'éditeur est *unique* (Inspector à gauche + vue live à droite) — décision d'IA déjà neutralisée par l'auteur (ne pas casser, voir `ROADE_GUIDE_CLAUDE_CODE.md`).

### 3.b — Configurer

Très variable selon le bloc. Quelques exemples mesurables :

- **Source** : 2 clics pour choisir un fichier + une feuille Excel (`Inspector.jsx:1302+`).
- **SQL builder** : ouvrir une jointure = 5–6 clics minimum (`QueryBuilder.jsx`).
- **Validation route** : ajouter une condition = 4 clics (cliquer « + Condition », nommer, choisir la colonne, choisir le test) ; chaque sortie = 3 clics supplémentaires. La doublure d'éditeurs (Conditions à gauche / Sorties à droite, `routing.jsx:39-43, 583-815`) ajoute du va-et-vient mais reste cohérente.

### 3.c — Prévisualiser

Deux entrées équivalentes :
- **Bouton « œil » sur le nœud** (`SourceNode.jsx:52`, idem sur 10 autres nœuds) → ouvre `DataPreview` plein écran (`WorkflowEditor.jsx:1000-1010`).
- **Bouton « Plein écran »** dans `BlockEditor.BlockView` (`BlockEditor.jsx:121`) → même `DataPreview`.
- À l'**intérieur** du `BlockEditor`, la partie droite affiche **déjà** un aperçu condensé (40 lignes, `BlockEditor.jsx:106`) sans cliquer sur quoi que ce soit. C'est le bon comportement « divulgation progressive » (P9).

**Coût** : 0 ou 1 clic (l'aperçu condensé est gratuit dès qu'on ouvre l'éditeur).

### 3.d — Profiler une colonne

À l'intérieur de `DataPreview` (modale plein écran après clic « œil ») :

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic sur le bouton « profil » d'une colonne (icône liste) | `DataPreview.jsx:167` | Met `activeColumn` ; le `ProfilePanel` à droite charge le profil (`DataPreview.jsx:266-310`) |

**Variante** : cliquer sur le nom de colonne *trie* (`DataPreview.jsx:163`) — il faut bien viser le petit bouton à droite pour profiler. **Deux contrôles physiquement contigus, deux actions différentes**. Risque d'erreur P7.

**Coût** : 1 clic pour profiler. **6 clics totaux** depuis l'ajout d'un bloc Source jusqu'à voir un profil : Ajouter → choisir Source → choisir fichier → fermer → Exécuter → cliquer œil → cliquer profil = 7.

### Friction & impasses

- **Aucun raccourci pour fermer** : seul Échap fonctionne (`DataPreview.jsx:44-48`, `BlockEditor.jsx:31-35`). Pas de « Ctrl+W » ou autre.
- **Pas de pin de profil** : pour comparer deux colonnes, il faut refaire le geste.
- **Pas de drilldown depuis le profil** : cliquer une valeur fréquente la filtre dans la table (`DataPreview.jsx:56-59`) — *bonne* affordance mais pas découverte (le titre est « Valeurs fréquentes », rien n'indique qu'elles sont cliquables — seul le tooltip le dit).

---

## Parcours 4 — Exécuter (et options « Tout recalculer » / « Super run »)

### 4.a — Run global

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic « Exécuter le workflow » (toolbar) | `WorkflowEditor.jsx:906-908` | `doRun(null)` : SSE en streaming (`WorkflowEditor.jsx:713-761`), barre de progrès live (`ProgressBar`, l. 1099-1128) |

### 4.b — Run d'un seul bloc

Trois points d'entrée pour la *même* action « exécuter ce bloc » :

1. Bouton **« play »** dans le nœud (icône, `SourceNode.jsx:48` et équivalents — 10 nœuds).
2. Bouton **« Exécuter »** dans la vue droite de `BlockEditor` (`BlockEditor.jsx:119`) — affiché *seulement* quand il y a déjà des données ; sinon le **gros CTA central** (`BlockEditor.jsx:136`).
3. Bouton **« Exécuter »** dans la barre du flow-map de Validation (`routing.jsx:716-718`) — uniquement pour ce bloc.

**Tous trois appellent `onRun(id)` → `doRun(id, ...)`** (`WorkflowEditor.jsx:798`). C'est **trois entrées différentes pour la même action** — explicitement *re-conçu* par l'auteur (commentaire `BlockEditor.jsx:117`: « one Exécuter at a time »), mais l'auteur a *réduit* à un dans la vue droite ; le bouton du nœud reste toujours présent en parallèle. Voir « Doublons » en bas.

**Variante « forcer »** : sur le nœud Source, le bouton ⟳ « Recharger » (`SourceNode.jsx:50`) appelle `onRunNode(id, true)` — ignorer le cache pour ce seul bloc.

### 4.c — Tout recalculer / Super run

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic sur la **flèche bas** à droite du gros bouton « Exécuter » | `WorkflowEditor.jsx:909-912` | Ouvre la *split-menu* `run-menu` (`WorkflowEditor.jsx:914-929`) |
| 2 | Clic « Tout recalculer » **OU** « Super run » | `WorkflowEditor.jsx:916, 923` | `doRun(null, true)` ou `doRun(null, true, true)` |

Chaque entrée du menu a une `MenuInfo` (`WorkflowEditor.jsx:919, 926, 1085-1092`) qui *explique* la différence — geste pédagogique fort, à conserver.

### Visibilité de l'exécution (P8 — point fort déjà pro)

- Barre de progrès en haut, sans *layout shift* (`WorkflowEditor.jsx:1099-1128`).
- Nom du bloc en cours d'exécution **cliquable** : `run-goto` (`WorkflowEditor.jsx:1115-1116`) fait `rf.fitView` sur ce nœud (`WorkflowEditor.jsx:764-768`).
- Sous-progrès animé par bloc (`WorkflowEditor.jsx:686-710`), calibré sur les vrais runs Source via `localStorage`.
- Chrono visible après 1,5 s (`WorkflowEditor.jsx:1120`).
- Glow autour du nœud actif (classe `rf-active`, `WorkflowEditor.jsx:842`).
- Différé de 150 ms (`WorkflowEditor.jsx:729-733`) pour éviter qu'un bloc *caché* (réutilisé) ne flashe comme s'il avait été recalculé.

### Friction & impasses

- **Pas de bouton « Stop »** : un run lancé ne peut pas être annulé. Le `runStream` SSE ne renvoie pas d'event d'annulation, et `WorkflowEditor.jsx:712-761` ne ferme pas l'EventSource via une action utilisateur (seulement à `done`/`error`). P5.
- **Run d'un sous-graphe ciblé** (ex. « tout en aval de ce bloc ») : pas disponible. On a `doRun(onlyNode=null)` ou `doRun(id)` — soit tout, soit un seul.
- **Pas de mode aperçu** : impossible de lancer un run en mode *sec* (dry-run global). Le dry-run de Validation reste local au bloc.
- **Banner d'erreur non persistant** : un message d'erreur peut être fermé d'un clic (`WorkflowEditor.jsx:938`), aucune trace dans un journal. P13 (lignage des runs incomplet).

---

## Parcours 5 — Exporter, puis « Documenter »

### 5.a — Exporter

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Ajouter un bloc Export (voir parcours 2) | — | bloc placé |
| 2 | Relier la sortie d'un bloc précédent à l'ancre `in` de l'Export | — | edge créée |
| 3 | Cliquer sur le bloc Export (ouvre le BlockEditor) | — | Inspector visible |
| 4 | Renseigner le nom de fichier ou cocher « feuille d'un classeur » | `Inspector.jsx:1421+` | autosave |
| 5 | Fermer (Échap) | — | retour canevas |
| 6 | Clic « Exécuter le workflow » | `WorkflowEditor.jsx:906` | `_run_export` écrit le fichier (`engine.py:1708-1742`) |

**Coût** : 6 clics minimum si l'utilisateur garde les valeurs par défaut (le `filename` se pré-remplit avec `<wfName> - Export`, `WorkflowEditor.jsx:431`).

**Variante « Super run »** : si l'export est désactivé (`enabled:false`), seul le Super run (parcours 4.c) force l'écriture.

### 5.b — Documenter

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic « Documenter » (toolbar) | `WorkflowEditor.jsx:902-904` | `documentWorkflow()` (l. 639-651) : flush save → `GET /api/projects/{pid}/workflows/{wid}/document` (main.py:238) → fichier `.xlsx` téléchargé en clic invisible (`<a download>`) |

**Coût** : 1 clic — geste atomique remarquable (rare dans la catégorie ; P13 lignage).

### 5.c — Ouvrir le dossier des exports

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic icône dossier dans la toolbar (à droite) | `WorkflowEditor.jsx:896-898` | `openExportsFolder` → `POST /api/projects/{pid}/files/open-folder` (`main.py:160`) → ouvre l'explorateur Windows |

**Variante** : depuis `ProjectView`, les exports sont déjà listés et téléchargeables individuellement (`ProjectView.jsx:110-122`).

### Friction & impasses

- **Pas de prévisualisation du nom final** : le BlockEditor montre `{shown || 'resultat'}.{xlsx|csv}` mais pas le **chemin complet** ; en mode `to_workbook`, l'utilisateur ne voit pas le nom de la feuille (`Inspector.jsx:1444+`).
- **Pas d'avertissement quand un fichier va être écrasé** : un export du même nom écrase sans `confirm()` (à vérifier en 07/08).
- **Pas de download direct depuis le BlockEditor de l'Export** : il faut aller dans `ProjectView` ou cliquer « Ouvrir le dossier » et naviguer.
- **Excel sortie** : `df.to_csv(out_path, index=False)` (`engine.py:1736`) — encodage UTF-8 figé, virgule comme séparateur, point comme décimal. Sortie incohérente avec les CSV FR (souvent attendus en `;` + `,` décimal). P12 (à creuser en 08).

---

## Parcours 6 — Retrouver / rouvrir un travail (et F5)

### 6.a — Rouvrir un projet/workflow depuis le démarrage

| # | Geste | Cible | Effet |
|---|---|---|---|
| 1 | Clic sur la carte du projet | `ProjectList.jsx:49` | `onOpen(p.id)` → vue `project` |
| 2 | Clic sur le nom du workflow | `ProjectView.jsx:144-148` | `onOpenWorkflow(wf.id)` → vue `workflow` |

**Coût** : 2 clics depuis l'accueil.

### 6.b — Comportement après F5 (rafraîchissement navigateur)

L'état de navigation vit dans `useState({ name: 'projects' })` (`App.jsx:9`). **Aucun routeur, aucune URL** — voir 01.
- **F5 depuis n'importe quelle vue** ⇒ retour à l'accueil `projects`.
- **Bookmarker un workflow** ⇒ impossible.
- **Partager un lien vers « ce workflow, ce bloc »** ⇒ impossible.
- **Bouton « précédent » du navigateur** ⇒ revient à l'extérieur du SPA.

C'est l'**incarnation pure de P1 amateur → pro** signalée dans le guide d'audit.

### 6.c — Comportement à la fermeture / changement d'onglet

L'autosave (`WorkflowEditor.jsx:339-349`) est *débounced* à 600 ms. Avant le déclenchement :
- **Pas de garde « modifications non enregistrées »** au `beforeunload`. Un F5 dans les 600 ms qui suivent une édition peut perdre la modification.
- L'indicateur `save` (`WorkflowEditor.jsx:893-895`) montre `enregistrement…` / `enregistré` / `erreur de sauvegarde` — visibilité OK (P8), mais sans confirmation à la fermeture.

### 6.d — Lien fragile « vue ↔ état » du `BlockEditor`

Si l'utilisateur ouvre le `BlockEditor` puis fait F5, il revient sur `projects`. L'état `editorNode` (`WorkflowEditor.jsx:243`) est local — non persisté. Donc même un *deep-link* dans le futur devra distinguer « workflow ouvert » de « bloc en édition ».

### Friction & impasses

- **Aucune protection** des modifications non enregistrées au `beforeunload` (P5).
- **Aucun historique de versions** d'un workflow.
- **Aucun fil d'Ariane** signifiant : `App.jsx:60` affiche littéralement le mot `workflow` au lieu du nom (`wfName`). Déjà signalé en 01.

---

## Inventaire des contrôles dupliqués ou redondants

> Crainte explicite du commanditaire : « deux contrôles font la même chose ». Le tableau liste ce que j'ai pu identifier en lecture statique du front. Certains *paraissent* dupliqués mais portent une nuance utile — c'est noté.

| # | Action ciblée | Contrôle A | Contrôle B (et plus) | Statut | Commentaire |
|---|---|---|---|---|---|
| D1 | **Exécuter un bloc** | Bouton ▶ sur le nœud (`SourceNode.jsx:48`, idem ×10 nœuds) | Bouton ▶ « Exécuter » dans `BlockEditor.BlockView` (`BlockEditor.jsx:119`) + gros CTA central (`BlockEditor.jsx:136`) | **Partiellement neutralisé** : le commentaire `BlockEditor.jsx:117` mentionne « one Exécuter at a time » ; mais le bouton ▶ du nœud reste toujours présent en arrière-plan derrière la modale. Sur Validation, un **3ᵉ** bouton « Exécuter » apparaît dans la barre du flow-map (`routing.jsx:716-718`). | Trois entrées valides logiquement (scopes nœud / vue / flow-map), mais l'expérience confond. À unifier dans une convention claire. |
| D2 | **Aperçu d'une sortie** | Bouton 👁 sur le nœud (`SourceNode.jsx:52`, idem ×10) | Bouton 👁 « Plein écran » dans `BlockEditor.BlockView` (`BlockEditor.jsx:121`) | **Duplication acceptée** : les deux ouvrent la même modale `DataPreview`. L'utilisateur dans la modale a besoin d'un raccourci vers le plein écran, donc le doublon a une justification. | OK — au prix d'une convention non écrite. |
| D3 | **Aperçu de la sortie d'une Validation** | Bouton 👁 sur chaque sortie de `OutputRow` (`routing.jsx:826`) | Onglet « Visualisation » dans `BlockEditor.ValidateView` (`BlockEditor.jsx:85-87`) | **Choix UX** : le clic 👁 fait *aussi* basculer sur l'onglet « Visualisation » (`BlockEditor.jsx:91`). Les deux contrôles **collaborent** plus qu'ils ne dupliquent. | OK explicite. |
| D4 | **Naviguer au projet** | Breadcrumb « Projets / *nom-projet* » (`App.jsx:48-55`) | Bouton « ← Projet » dans la toolbar du workflow (`WorkflowEditor.jsx:865`) | **Duplication assumée** : la breadcrumb sert toute l'app, le bouton ← est local à la toolbar. | OK. |
| D5 | **Ouvrir un fichier sur le disque** | Bouton ↗ par fichier dans `ProjectView` (`ProjectView.jsx:41`) | Pas d'autre point d'entrée | Une seule action. | RAS. |
| D6 | **Ouvrir le dossier des fichiers** | Bouton dossier dans la toolbar du workflow (`WorkflowEditor.jsx:896-898`) | Pas d'autre point d'entrée | Une seule action. | RAS. |
| D7 | **Supprimer un bloc** | Touche `Suppr`/`Backspace` (React Flow, `WorkflowEditor.jsx:973`) | Clic droit → « Supprimer » (`WorkflowEditor.jsx:1072`) + bouton « Supprimer » dans l'Inspector (`Inspector.jsx:26`) | **Triple entrée**. Bonne couverture des habitudes utilisateur, mais : la suppression dans l'Inspector ferme la modale (`updateNodeData → onDelete → setEditorNode(null)`) ; via clic droit, le canevas garde le contexte. Les *blast radius* sont identiques. | Pas un défaut — c'est un standard d'éditeur ; à uniformiser pour l'a11y. |
| D8 | **Ajouter un bloc** | Clic « + Ajouter un bloc » (palette) (`WorkflowEditor.jsx:868`) | Glisser un bloc sur une arête sélectionnée → « Insérer sur lien » via la palette (`WorkflowEditor.jsx:437-454`) | **Une seule UI**, deux comportements : avec/sans arête sélectionnée. C'est un *modal trick* — à découvrir tout seul. | OK code, mais P9 (découvrabilité). |
| D9 | **Détacher un Bouchon** | Clic droit → « Détacher » (`WorkflowEditor.jsx:1065-1067`) | Pas d'autre voie | Une seule action. | RAS. |
| D10 | **Trier l'aperçu sur une colonne** | Clic sur le **nom** de la colonne (`DataPreview.jsx:163`) | Pas d'autre voie | Une seule action — mais voisine d'un autre bouton (profil) sur le même `<th>`. Risque de clic erroné. | À auditer P7. |
| D11 | **Profiler une colonne dans l'aperçu** | Bouton « liste » (icône) dans le `<th>` (`DataPreview.jsx:167`) | Clic sur l'élément de `ColumnsTab` (`DataPreview.jsx:211`) | Deux entrées équivalentes pour la même action. Pas dupliquées en *contiguïté*, donc faible risque de confusion. | OK. |
| D12 | **Filtrer l'aperçu** | Champ de filtre par colonne (`DataPreview.jsx:174-180`) | Clic sur une valeur fréquente du `ProfilePanel` (`DataPreview.jsx:56-59, 305`) | Le profil pose `op:'equals'`, le filtre par colonne pose `op:'contains'`. Deux contrôles, deux opérateurs — légèrement asymétrique. | À unifier (cf. P10 : pourquoi `equals` depuis le profil et `contains` depuis le header ?). |
| D13 | **Indication de bloc périmé** | Petit point `node-dirty` (`WorkflowEditor.jsx:88-90`) | Badge `non exécuté` (`StatusBadge`, `SourceNode.jsx:40`) | Deux signaux distincts (dirty = config modifiée ; idle = pas encore exécuté). Pas une duplication, mais difficiles à différencier en survol. | À documenter dans l'UI elle-même. |
| D14 | **Reset de la palette / des menus** | Échap (`WorkflowEditor.jsx:610`) | Clic en dehors (`WorkflowEditor.jsx:611`) | Deux gestes redondants — c'est la norme. | RAS. |

---

## Synthèse — où l'expérience décroche dans le réel

1. **Coûts de clic raisonnables** pour les chemins nominaux : 3 clics création projet, 1 clic run global, 1 clic documenter, 1 clic ouvrir éditeur de bloc. **L'IA centrale est bonne.**
2. **Trois ruptures structurelles** :
   - **F5 = retour à l'accueil** (P1) — sensation de fragilité.
   - **Aucun raccourci clavier** au-delà d'Échap/Suppr/Entrée — P9.
   - **Aucun bouton « Stop »** sur un run en cours — P5 non honoré pour l'opération la plus coûteuse.
3. **Quatre frictions « 4 états » non couvertes** :
   - Upload sans retour de progression (P8).
   - Chargement du workflow ~300 ms invisible (P6).
   - Échecs d'API silencieux dans `ProjectList` / `ProjectView` (P6).
   - Banner d'erreur sans journal de runs (P13).
4. **Contrôles dupliqués** : la majorité sont **assumés et utiles** (clic droit + clavier + bouton). Le seul vrai *risque* identifié est l'asymétrie *filtre `contains`* vs *profil `equals`* (D12).
5. **Découvrabilité faible des gestes avancés** : insertion sur lien (D8), drilldown depuis le profil (P9), `Bouchon` collé au parent (P9). Tout ça est documenté dans le code mais non révélé à l'utilisateur.
