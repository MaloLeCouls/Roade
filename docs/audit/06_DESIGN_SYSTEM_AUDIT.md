# 06 — Audit du design system (P2)

> Diagnostic du *système de mise en cohérence* visuelle. Pas de jugement sur le **rendu** (la finition est déjà pro — partie 2 du guide) : ici on regarde **comment** la cohérence est obtenue, et donc si elle *passera à l'échelle* quand le produit grossira ou qu'une autre main y touchera. Toute la matière vit dans **un seul** fichier : `frontend/src/styles.css` (868 lignes, 608 sélecteurs `.*`, ~30 sections en commentaires `/* --- */`).

## TL;DR

- **23 tokens** déclarés dans `:root` (`styles.css:1-33`) — base saine, couvre couleur/espace/rayon/ombre/typo + 12 couleurs d'identité par type de bloc (`--t-source`…`--t-export`).
- **Usage très inégal** : `--radius` (61), `--muted` (82), `--line` (64) → bien adoptés. `--bg` (1), `--radius-lg` (1), `--accent-d` (3), `--shadow` (8) → quasi inutilisés. **9 tokens d'identité de bloc** utilisés ≤ 2 fois — la palette `--t-*` est presque morte côté CSS.
- **Aucune primitive React** factorisée : 6 fichiers `.jsx` instancient ensemble **54 `<input>` bruts**, **26 `<select>` bruts**, **4 modales** *redéfinies* (`modal-backdrop` + `modal` + variantes), **2 menus contextuels** (`ctx-menu`/`run-menu`), **2 `InfoBubble`** identiques (Inspector + WorkflowEditor).
- **63 occurrences de `style={{ … }}`** *inline* dans les composants — preuve que le CSS ne suffit pas pour exprimer toutes les variantes nécessaires.
- **40+ valeurs de padding distinctes**, **13 tailles de police** (de 9 à 22 px), **17 rayons différents** dont 61 fois `var(--radius)` *plus* 12 valeurs en dur (`6px`, `3px`, `10px`, `999px`, `2px`, `9px`, `8px`, `7px`, `4px`, `5px`, `1px`, `14px`). C'est l'illustration directe du « cohérence par discipline ».

---

## 1. Tokens : déclarés vs réellement utilisés

Source : `styles.css:1-33`. Tous les tokens vivent dans une seule règle `:root`.

| Token | Déclaration | Rôle | Usage `var(--…)` | Diagnostic |
|---|---|---|---|---|
| `--bg` | `#eef0f3` | fond global | **1** | sous-utilisé (référencé une fois sur `body`) ; le reste utilise `#fff`, `#f1f3f7`, etc. en dur |
| `--panel` | `#ffffff` | fond des cartes/panneaux | 8 | OK |
| `--ink` | `#1f2430` | texte principal | 22 | OK |
| `--ink-soft` | `#4a5160` | texte secondaire | 27 | OK |
| `--muted` | `#858b98` | texte tertiaire | **82** | très adopté |
| `--line` | `#d9dde4` | bordures | **64** | très adopté |
| `--line-soft` | `#e7e9ee` | séparateurs internes | 24 | OK |
| `--accent` | `#3556a8` | bleu primaire | 33 | OK |
| `--accent-d` | `#28427f` | hover du primaire | **3** | quasi mort — `:hover` ne contraste presque jamais via le token |
| `--danger` | `#c0392f` | rouge / actions destructrices | 16 | OK |
| `--ok` | `#3f7a4f` | succès | 7 | OK |
| `--warn` | `#9a6b16` | avertissement | 5 | OK |
| `--radius` | `4px` | rayon par défaut | **61** | très adopté |
| `--radius-lg` | `6px` | rayon large | **1** | mort — 12 autres valeurs de rayon en dur (cf. §3) |
| `--shadow` | `0 1px 3px rgba(20,30,60,0.10)` | ombre par défaut | 8 | OK |
| `--t-source`…`--t-export` | 12 couleurs d'identité | ports/liens par type de bloc | 1 à 5 chacun | **palette quasi morte côté CSS** : le mapping vit côté JS dans `WorkflowEditor.jsx:106-111` (objet `TYPE_COLOR`), redéclaré à l'identique. CSS et JS dupliquent la table des couleurs. |

**Constats clés :**
- **Aucun token d'espace** (`--space-1`…`--space-8`) : tous les paddings/margins/gaps sont en valeurs numériques en dur. Conséquence : 40+ valeurs de padding distinctes (§3).
- **Aucun token de typographie** : font-size, line-height, letter-spacing, font-weight tous en dur.
- **Aucun token d'animation** (durée, easing) ; trois `@keyframes` les figent en pratique.
- **Aucun token `z-index`** ; les couches sont saisies à la main : `z-index: 5` (topbar), `10` (toolbar), `30` (palette), `20` (info-bubble), `60` (DataPreview), `70` (FlowMap modal), `4` (canvas-hint), `6` (overlays). Aucune table d'empilement.
- **Doublon JS/CSS** : `TYPE_COLOR` (`WorkflowEditor.jsx:106-111`), `HANDLE_COLOR` (`:113-116`), `FRAME_COLORS` (`:118`), `PIE_COLORS` (`BlockEditor.jsx:211-212`), `OUTPUT_COLORS` (`validateHelpers.js`) — **5 palettes distinctes** côté JS, dont au moins une (`TYPE_COLOR`) doit rester synchronisée avec `--t-*`. La cohérence dépend d'un copier-coller fiable.

---

## 2. Motifs UI récurrents et leurs ré-implémentations

### 2.1 Boutons

Les classes utilitaires sont définies dans `styles.css:67-76`. Variantes recensées :

- `button.primary` (l. 67-69) — bleu, plein, hover via `--accent-d`.
- `button.ghost` (l. 70-71) — blanc, bord `--line`.
- `button.ghost.danger` (l. 72) — texte rouge, bord `#e6c3c0` *en dur*.
- `button.ghost.on` (l. 73) — état actif, fond accent.
- `button.small` (l. 74) — petit padding.
- `button.ghost.icon-only` (l. 75) — padding compact.
- `.iconbtn` (l. 76) — flex helper.
- `button.mini` (utilisée dans `node-foot`, `validateNode`, etc. — *pas définie* dans `styles.css` au niveau global ; définie *localement* aux nœuds, à chercher).

**Combinaisons utilisées dans le JSX** : `primary`, `primary small`, `primary run-caret`, `ghost`, `ghost small`, `ghost danger small`, `ghost on small`, `ghost small on`, `ghost icon-only`, `mini`, `add-btn`, `sel-toggle`, `flow-sort`, `route-add`, `keys-toggle button`, `cond-addgroup`, `cond-and`, `neg`, `rrow-del`, `vw-tag`, `oseg`, `tab`, `mode-toggle button`, `prune-row button`, … — **plus de 25 combinaisons** distinctes pour ce qui devrait être un trio Primary/Secondary/Ghost + tailles.

**Aucune primitive React `<Button variant="primary" size="sm" icon=…>`** n'existe. Chaque appelant assemble la chaîne lui-même → impossible de garantir la cohérence (ex. `routing.jsx:716` réécrit le bouton « Exécuter » à la main au lieu d'utiliser celui de `BlockEditor.jsx:119`).

### 2.2 Champs (inputs / selects / textareas)

`styles.css:64-65` pose la baseline : `border: 1px solid var(--line); border-radius: var(--radius); padding: 7px 9px; font-size: 13px;`.

- **54 `<input>` bruts** dans `Inspector.jsx`, **21 dans `routing.jsx`**, **7 dans `QueryBuilder.jsx`** — aucun composant `Input`/`Select`/`TextArea` partagé.
- Les variantes de classes (`qb-input narrow`, `qb-input wide`, `qb-input`, `insp-title`, `ocard-name`, `col-filter`, `wf-name`, `keys-search input`, `search-wrap input`, `groups-titlebar input`, etc.) sont **toutes définies en CSS** ; le JSX en pointe juste le nom.
- **Largeur** ajustée par `style={{ width: 80 }}` / `90` / `110` directement dans le JSX (`Inspector.jsx:144, 151, 157, 159`). Six valeurs en dur trouvées.
- **Aucune validation visuelle** des inputs (border rouge si invalide, `aria-invalid`, message d'erreur). Le motif n'existe pas dans le CSS.

### 2.3 Modales

`styles.css` définit `.modal-backdrop` et `.modal` une fois. Le JSX **redéfinit 4 modales** distinctes en composition :

| Modale | Fichier | Comportement de fermeture |
|---|---|---|
| `BlockEditor` (édition de bloc) | `BlockEditor.jsx:37-43` | Backdrop click + Échap (`:31-35`) |
| `DataPreview` (aperçu de données) | `DataPreview.jsx:62-64` | Backdrop click + Échap (`:44-48`) ; `zIndex: 60` codé en dur |
| `WorkflowFlow` (carte des flux) | `WorkflowFlow.jsx:126-127` | Backdrop click ; pas d'Échap dédié visible |
| `FlowMapModal` (zoom du flow-map de Validation) | `routing.jsx:923+` | Backdrop click ; `zIndex: 70` codé en dur |

**Aucune primitive `<Modal title="…" onClose={…} size="lg">`**. Quatre redéclarations légèrement divergentes du même motif :
- Trois écoutent `Escape` ; une non.
- Deux fixent un `zIndex` *inline* ; deux héritent.
- Toutes posent leur croix de fermeture *à la main*, avec `marginLeft: 'auto'` inline (`BlockEditor.jsx:42`, `DataPreview.jsx:74`).
- Aucune n'a `role="dialog"`/`aria-modal` (cf. 05, constat #6).

### 2.4 Menus

- `ctx-menu` : 2 instances (clic droit `WorkflowEditor.jsx:1042`, dropdown run `:914`).
- `add-palette` : 1 instance (palette de blocs, `:872`).
- `info-pop` : ~ 5 instances (tooltips d'info bubble).
- Aucune primitive `Menu`/`MenuItem`/`Dropdown`. Chaque menu gère **lui-même** la fermeture au clic en dehors (effect dédié à `WorkflowEditor.jsx:607-614`).

### 2.5 Info-bulles / aide

Deux composants `InfoBubble` distincts mais identiques :
- `Inspector.jsx:1351-1357` — utilisé 11 fois (Validate, Split, Filter ×2, Cols, Report, Clean/Groupe, Calc, Union, SQL, Dedup).
- `WorkflowEditor.jsx:1085-1092` (renommé `MenuInfo` pour les items du run-menu) — strictement le même HTML/CSS, juste une autre classe.

**Une primitive partagée résoudrait deux composants quasi jumeaux à factoriser**.

Par ailleurs, **~58 attributs `title=`** sont employés comme tooltips natifs (Inspector 15, routing 17, WorkflowEditor 9, QueryBuilder 8, ProjectView 5, Source/Export/CleanNode 4+3+3, DataPreview 3, BlockEditor 3). Deux systèmes de tooltip coexistent — l'`InfoBubble` (riche, HTML imbriqué) et `title=` natif (basique, sans style).

### 2.6 Onglets

Une seule occurrence du motif générique `.tabs > button.tab.on/.tab` (`DataPreview.jsx:84-89`).  
La modale `BlockEditor` redéfinit un *autre* système d'onglets dans `ValidateView` (`BlockEditor.jsx:84-87`), avec ses propres classes `be-tabbar` / `be-tabwrap`. Mêmes besoins, deux implémentations.

### 2.7 Bannières / notices

Trois motifs « notice » distincts cohabitent :

| Motif | Style | Où | Comportement |
|---|---|---|---|
| `banner` (`error`/`info`) | CSS dédié | `WorkflowEditor.jsx:938` | bouton ✕ qui ferme, **aucune persistance** |
| `qb-warn` | jaune/orange, encadré | Inspector × 5 (`:77, 338, 865, 1064, 1257`), routing `:360` | informatif, pas dismissable |
| `qb-hint` | gris muted, conseil | ~30+ sites dans Inspector + routing | informatif, pas dismissable |

**Pas de variante « erreur de validation par champ »** ni de « succès toast ». Une primitive `<Notice level="error|warn|info|hint">` couvrirait les quatre.

### 2.8 Cartes

- `.card` (`styles.css:83-88`) : 1 site (`ProjectList.jsx:49`).
- `.panel` (`styles.css:92-93`) : 2 sites (`ProjectView.jsx:85, 127`).
- `.clean-op` (`Inspector.jsx:391+`, etc.) : ~6 sites pour les sous-cartes d'opération.
- `.rc-card`, `.cr-card`, `.keys-tile`, `.keys-card`, `.report-card`, `.metric` (`BlockEditor.jsx` / `DataPreview.jsx`) : ~8 styles de carte distincts pour le reporting.

Aucun motif unifié — chaque cas a sa carte ad hoc.

### 2.9 Checkboxes / toggles / radios

- `qb-check` est la classe standard, ~30 sites.
- Switches/toggles « mode » : `mode-toggle button` (Pivot, Validate `routing.jsx:80-82`), `toggle button` (run-menu), `sel-toggle` (toolbar), `oseg` (sélecteur de sortie), `route-toolbar` `qb-check`, `keys-toggle button`. **6 motifs visuels** différents pour le même geste (« choisir parmi 2-3 options »).

### 2.10 Styles inline

`grep "style={{` → **63 occurrences** dans le JSX. Les plus parlantes :
- `style={{ marginLeft: 'auto' }}` × 4 : aligne un bouton à droite — devrait être un prop du composant.
- `style={{ zIndex: 60 }}` / `70` × 2 : empilement de modales — devrait être une table.
- `style={{ width: 80 }}` × 6 dans `Inspector.jsx` : largeur d'input — devrait être une variante de `<Input size="sm|md|lg">`.
- `style={{ background: PIE_COLORS[i % …] }}` : couleurs dynamiques de graphique — légitime.
- `style={{ flex: 1 }}` × 4 : layout local.

> Conclusion 2 : la **cohérence visuelle existe** parce qu'un seul auteur a écrit tout le CSS. Mais le contrat « primitive → variant → usage » n'existe pas. Une PR qui ajoute un bloc devra **toujours** recopier `className="..."`, sans typage ni guide, et la dérive commencera dès qu'une seconde personne touche au code.

---

## 3. Incohérences mesurables

### 3.1 Rayons (`border-radius`)

- `var(--radius)` → 61 occurrences. ✅
- `var(--radius-lg)` → 1 occurrence (mort).
- En dur : `50%` (10), `6px` (7), `3px` (6), `10px` (6), `999px` (5), `2px` (4 + 1 `!important`), `9px` (2), `8px` (2), `7px` (2), `4px` (2), `5px`, `1px`, `14px`, formes composites (`7px 7px 0 0`, `0 var(--radius) var(--radius) 0`, `0 8px 8px 0`, `8px 0 0 8px`).

→ **12 valeurs distinctes** au-delà du token. Aucun token « pill », « circle », « sharp » alors qu'ils sont visiblement réutilisés.

### 3.2 Espacements (`padding`, `gap`)

- **40+ valeurs de padding distinctes** : `0 16px`, `0 7px`, `10px 12px`, `10px 16px`, `11px 14px`, `12px 14px`, `12px 15px`, `12px 16px`, `13px 14px`, `13px 15px`, `14px 16px`, `15px`, `16px`, `22px`, `24px 14px`, `26px 34px`, `36px`, …
- **Gaps** : 14 valeurs distinctes (`6px` 40 fois, `8px` 24, `4px` 17, `7px` 16, `10px` 13, `5px` 11, `12px` 9, `3px` 8, `9px` 4, `14px` 4, `2px` 2, `18px` 2, `1px`, `16px`).

→ Sans token d'espace (`--s-1`…), chaque valeur est un choix isolé. La hiérarchie « 4 / 8 / 12 / 16 / 24 » n'est pas tenue.

### 3.3 Tailles de police

13 tailles : `9px`, `10px`, `10.5px`, `11px`, `11.5px`, `12px`, `12.5px`, `13px`, `13.5px`, `14px`, `15px`, `16px`, `22px`. Les tailles « demi » (`11.5`, `12.5`, `13.5`) trahissent l'optimisation au pixel près, classique d'un dev solo — mais aussi l'absence d'une échelle figée.

### 3.4 Couleurs en dur

`grep #` dans `styles.css` :
- `color: #fff` → 30 occurrences (acceptable pour les boutons primary/accent).
- `background: #fff` → 29 occurrences (devrait être `var(--panel)`).
- Couleurs de hover/notice en dur : `#f1f3f7` (×5), `#f3f5f9` (×5), `#fafbfc` (×9), `#eef1f6` (×11), `#f6efe0` (×4), `#fbe9e7` (×3), `#e7f0ea` (×3), `#fff8d6`, `#fff7ec`, `#fffdf4`, `#9aa3b2` (×2), `#cc7b25` (×2 — accent orange).
- Le **point dirty** sur les blocs : `#e0a73a` codé en dur dans `styles.css:432`.
- Couleurs de famille de blocs en dur : `#cc7b25` (orange action), `#9aa3b2` (gris stop/else), réutilisées en JS aussi (`WorkflowEditor.jsx:117`).

→ Pas de tokens secondaires (`--surface-1`, `--surface-2`, `--accent-soft`, `--warn-bg`, `--ok-bg`, `--danger-bg`) ; chaque fond de notice est inventé.

### 3.5 Z-index

- 8 valeurs littérales saupoudrées dans `styles.css` + 2 dans JSX (`60`, `70`). Échelle implicite. Ajouter une modale nouvelle force un audit des autres.

---

## 4. Primitives manquantes (composants à extraire)

Pour transformer la cohérence de *discipline* en cohérence *structurelle*, voici les primitives qui devraient *exister* en React et qui n'existent pas :

| Primitive | Sites concernés | Bénéfice attendu |
|---|---|---|
| `<Button variant size icon>` | 25+ combinaisons de classes éparpillées | Variantes typées (primary / secondary / ghost / danger / link), tailles (sm/md/lg), prop `loading`, slot `iconLeft/iconRight`. Suppression de la majorité des `style={{ marginLeft: 'auto' }}`. |
| `<IconButton aria-label title>` | ~30 boutons `mini`/`icon-only` | Force le `aria-label`, taille uniforme, état `disabled` cohérent. |
| `<Input>`, `<Select>`, `<TextArea>` | 54+21+7+autres | État `invalid`, message d'erreur sous le champ, gestion de la largeur par prop `size` au lieu de `style={{ width: 80 }}`. |
| `<ColumnPicker>` (single & multi, **typé**) | `ColSelect` + `ColChecklist` + 5 selects de colonne directs (`routing.jsx:62`, `Inspector.jsx:991-1004`, `Inspector.jsx:1134`) | Cible directe du constat 03 (typage inégal). Le composant porte le type à côté du nom — partout. |
| `<Modal title size onClose>` | 4 modales | Centralise focus trap, Échap, `role="dialog"`/`aria-modal`, z-index, animation d'ouverture. |
| `<DropdownMenu>` + `<MenuItem>` | `ctx-menu` (×2) + `add-palette` | Centralise close-on-outside-click, fléchage clavier, `role="menu"`. |
| `<Tooltip>` (riche, comme l'actuel `InfoBubble`) | `InfoBubble`/`MenuInfo` (jumeaux) + `node-help` + ~58 `title=` | Une seule API, choix entre tooltip natif (court) et popover (riche). |
| `<Notice level title onDismiss?>` | `banner`, `qb-warn`, `qb-hint` (et un futur « erreur sur champ ») | Quatre niveaux unifiés. |
| `<Tabs activeId onChange>` | `tabs` (DataPreview) + `be-tabbar` (BlockEditor.ValidateView) | Mêmes besoins, deux implémentations à fusionner. |
| `<Card variant header footer>` | `.card`, `.panel`, `.clean-op`, `.rc-card`, `.cr-card`, `.report-card`, `.keys-card` | Évite la prolifération de styles ad hoc. |
| `<EmptyState illustration title action>` | `.empty`, `.be-view-empty`, `.canvas-hint`, `.empty small` | Les 4 états vides du produit cessent d'être inventés à chaque site. |
| `<StatusBadge variant>` | `badge ok|err|run|warn|idle`, `coltype`, `coltype-inline`, `lockbadge`, `node-dirty` | Une typologie de badges décidée une fois. |
| `<Toggle>` / `<SegmentedControl>` | `mode-toggle`, `oseg`, `keys-toggle`, `sel-toggle`, `toggle` (×6 motifs) | Un choix mutuellement exclusif n'a aucune raison d'avoir 6 visuels. |
| `<DataTable>` | `RowsTable` (DataPreview) + `keys-grid` (BlockEditor) + `cr-samples` + `keys-cons` | Tri/filtre/profil/pagination factorisés ; sans cela, chaque table de l'app est un cul-de-sac. |

> Les noms ci-dessus sont du **diagnostic**, pas de la prescription : ils décrivent les primitives **manquantes**, pas une API précise à imposer.

---

## 5. Tokens manquants (à compléter dans `:root`)

Pour rendre la liste § 4 fonctionnelle, il faudrait ajouter au moins :

- **Espaces** : `--s-1: 4px ; --s-2: 8px ; --s-3: 12px ; --s-4: 16px ; --s-6: 24px ; --s-8: 32px`.
- **Surfaces** : `--surface-1` (panel hover), `--surface-2` (notice info), `--surface-3` (notice warn), `--surface-4` (notice error), `--surface-5` (notice success).
- **Rayons** : `--radius-sm` (2), `--radius` (4, déjà), `--radius-md` (6, ex-`--radius-lg`), `--radius-lg` (8), `--radius-pill` (999).
- **Typographie** : `--fs-1` (10) … `--fs-6` (22), `--fw-regular`, `--fw-semibold`, `--fw-bold`.
- **Z-index** : `--z-overlay`, `--z-modal`, `--z-modal-2` (modale au-dessus de modale), `--z-tooltip`, `--z-menu`.
- **Durées/easings** : `--dur-fast` (120ms), `--dur` (200ms), `--ease-out`.

Aucun de ces concepts n'existe aujourd'hui dans `:root`.

---

## 6. Structure du fichier CSS unique

`styles.css` est **organisé** mais **non modulaire** :

- **868 lignes**, **608 sélecteurs**, **~30 sections** délimitées par des commentaires `/* ---------- … ---------- */`.
- Les sections couvrent : topbar, generic, project grid, project view, editor, nodes, ports, inspector, query builder, group check, calc block, value_when editor, validation block, frames/groups, bouchon cap, preview modal, preview content, modal-bar, profile panel, columns tab, clean report, stats, route-flow, keys analysis, report charts, splits/segments, info bubble, keyframes.
- Tout est **chargé d'un coup** au démarrage (`main.jsx` importe `./styles.css`). Aucun *code-splitting* CSS (impossible sans modulariser).
- **Aucun préprocesseur** (pas de Sass/Less/PostCSS sauf le pipeline Vite par défaut). Pas de variables locales, pas de mixins.
- **Aucune méthodologie nommée** (BEM, OOCSS, atomic). Les classes utilisent un préfixe contextuel ad hoc (`qb-…`, `be-…`, `rc-…`, `keys-…`, `vw-…`, `vtest-…`, `tv-…`, `pp-…`, `grp-…`, `cr-…`, `ocard-…`). Pas de convention écrite.

**Constat structurel** : tant que `styles.css` reste *un* fichier, il *peut* être maintenu — mais (a) il n'y a aucune barrière qui empêche son explosion, (b) un nouvel arrivant n'a pas de table des matières machine-lisible, (c) on ne peut pas écrire de tests visuels par composant car il n'y a pas de composant CSS isolable.

---

## Synthèse

1. **Tokens présents mais sous-utilisés** : la base existe (couleur/rayon/ombre/identité). Mais l'espace, la typographie, le z-index, les animations *n'ont aucun token* — c'est l'angle mort.
2. **Cohérence par discipline, pas par construction** : ~30 motifs UI sont définis en CSS mais leurs *assemblages* JSX sont libres. 25+ combinaisons de classes pour les boutons, 4 modales redéfinies, 2 `InfoBubble` jumelles, 6 visuels de switch.
3. **63 styles inline** : preuve qu'à des endroits stratégiques (alignement, dimensions, z-index), le CSS ne suffit pas, et qu'il manque une API de composant.
4. **Aucune primitive React** factorisée pour les blocs les plus répétés (`Button`, `Input`, `Modal`, `Menu`, `Tooltip`, `Tabs`, `Card`, `Notice`, `ColumnPicker`). C'est la transition pro/amateur *au niveau du code*, pas du rendu — directement pointée par P2 du guide.
5. **CSS unique de 868 lignes** : encore navigable, mais sans barrière contre la dérive. La question n'est pas « refactoriser ou pas » mais « combien de temps avant qu'un blocage majeur de modification le force ».
