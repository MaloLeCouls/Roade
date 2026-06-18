# Contrat de bloc — Roade

> **F.0** dans la roadmap (`ROADE_ROADMAP_ETAPE3.md`).
>
> *Objectif :* éviter qu'un bloc soit *richement* travaillé d'un côté (Validation)
> et *anémique* de l'autre (Union, Pivot, Filtre). Tout bloc exécutable doit
> exposer le même socle d'expérience. Cette page formalise ce socle et liste
> où chaque bloc en est aujourd'hui.

## Le socle (7 items)

Pour chaque item : **ce qu'on attend** · *pourquoi* · **critère de validation**.

### 1. UI de configuration dédiée
Le bloc a son propre `*Config` dans `Inspector.jsx`.
*Pourquoi :* sans ça, l'utilisateur édite un JSON brut — c'est ce qui fait passer
un éditeur visuel à un « champ texte mal déguisé ». ▸ **Critère :** un fichier ou
une fonction dédiée par bloc, qui rend les options en champs Roade (Field, Select,
ColumnPicker), pas en `<input>` nus.

### 2. Sélecteur de colonnes typé
Toute saisie « nom de colonne » passe par le `<ColumnPicker>` (`ui/ColumnPicker.jsx`),
qui affiche **le type à côté du nom**.
*Pourquoi :* la sémantique de presque tous les blocs (filtre, jointure, agrégation,
contrôle) dépend du type. Un picker non typé invite à comparer un `VARCHAR` à un
`DOUBLE` sans le voir. ▸ **Critère :** plus aucun `<select>` brut ni `ColSelect`/
`ColChecklist`/`CalcColSelect` quand on choisit une colonne. Le type apparaît à
côté du nom.

### 3. Aperçu de la sortie
L'utilisateur peut ouvrir `<DataPreview>` sur les sorties du bloc.
*Pourquoi :* « voir les données » à chaque étape est le ressort principal d'une
data-prep visuelle. ▸ **Critère :** le bouton 👁 (`onPreview`) est présent sur le
nœud ; sa modale ouvre Données / Colonnes / Stats sans erreur.

### 4. Profilage par colonne
Depuis l'aperçu, un panneau « profil » affiche distincts, top valeurs, stats num.
*Pourquoi :* repérer un mojibake, une distribution suspecte, une colonne quasi-
constante. ▸ **Critère :** l'API `/profile` répond pour les colonnes du bloc, et
le panneau de profil s'affiche dans `<DataPreview>`.

### 5. Validation pré-run
Les erreurs de configuration détectables sans exécuter sont listées dans
`lib/preflight.js` (E.3) et affichées en pastille rouge sur le nœud.
*Pourquoi :* éviter le « clic Exécuter → 30 s d'attente → erreur ». ▸ **Critère :**
chaque cause d'échec runtime déterministe (entrée requise non branchée, colonne
non choisie, paire vide…) a une règle dans `preflightWorkflow()`.

### 6. État d'erreur sur le nœud
Une erreur runtime renvoyée par l'engine s'affiche en badge `erreur` sur le pied
du nœud avec son message en `title`.
*Pourquoi :* l'utilisateur sait *où* ça a cassé sans avoir à lire la console.
▸ **Critère :** `status[id].error` est rendu et affiche le message.

### 7. Info-bulle qui dépaquette le concept
Au-dessus du `*Config`, un `<InfoBubble>` rappelle ce que fait le bloc et donne
au moins un exemple d'usage en français métier.
*Pourquoi :* « Pivot », « UNPIVOT », « jointure externe » — sans rappel, le bloc
intimide ou est utilisé de travers. ▸ **Critère :** chaque bloc concept-lourd a
sa bulle ; le texte fait au moins 2 phrases (quoi · comment · quand).

### 8. Exemples / préréglages (quand pertinent)
Pour les blocs où la *forme* de la config varie beaucoup (Calc, SQL, Clean,
Filter), 2–3 préréglages cliquables remplissent la config en un clic.
*Pourquoi :* la page blanche est l'ennemi de l'éditeur visuel — l'utilisateur
doit voir à quoi ressemble une configuration « plausible » avant d'éditer.
▸ **Critère :** un menu/sous-section « Exemples » au-dessus du formulaire, à
l'image de `CALC_EXAMPLES`.

---

## Audit bloc par bloc (état au 2026-06-18)

Légende : ✅ conforme · ⚠ partiel · ❌ manquant · ➖ non applicable.
Quand un manque est rattaché à un todo de la roadmap, l'ID est mentionné.

| Bloc | 1. UI dédiée | 2. Picker typé | 3. Aperçu | 4. Profil | 5. Preflight | 6. Erreur nœud | 7. Info-bulle | 8. Exemples |
|---|---|---|---|---|---|---|---|---|
| **Source**     | ✅ | ➖ | ✅ | ✅ | ✅ `no_file` | ✅ | ✅ (`sniffSummary` + override encodage/décimale) | ➖ |
| **SQL**        | ✅ | ❌ (D.7) | ✅ | ✅ | ✅ `sql_empty` (mode raw) | ✅ | ✅ | ❌ (F.4) |
| **Doublons**   | ✅ | ✅ (`ColChecklist` montre les types) | ✅ | ✅ | ❌ (clé vide non détectée) | ✅ | ✅ | ➖ |
| **Validation** | ✅ | ⚠ (`ColSelect` non typé sur la cible) | ✅ | ✅ | ✅ `validate_target` | ✅ | ✅ | ❌ |
| **Pivot**      | ✅ | ❌ (D.7) | ✅ | ✅ | ❌ (pas de check pivot_column/value_column ; F.2) | ✅ | ✅ (depuis F.2) | ❌ |
| **Nettoyage**  | ✅ | ✅ (`CalcColSelect` typé) | ✅ | ✅ | ❌ (op sans colonne non détectée) | ✅ | ✅ | ❌ (F.4) |
| **Calcul**     | ✅ | ✅ (`CalcColSelect` typé) | ✅ | ✅ | ❌ (formule vide non détectée) | ✅ | ✅ | ✅ (`CALC_EXAMPLES`) |
| **Filtre**     | ✅ | ❌ (`mainCols`/`refCols` non typés ; F.3) | ✅ | ✅ | ✅ `filter_empty`/`filter_mismatch` | ✅ | ✅ | ❌ (F.4) |
| **Cols**       | ✅ | ✅ | ✅ | ✅ | ❌ (sélection vide non détectée) | ✅ | ✅ | ➖ |
| **Union**      | ✅ | ➖ | ✅ | ✅ | ⚠ (input manquant détecté, alignement des schémas pas remonté ; F.1) | ✅ | ⚠ (à enrichir ; F.1) | ➖ |
| **Analyse**    | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ➖ |
| **Export**     | ✅ | ➖ | ➖ | ➖ | ❌ (filename vide non détecté) | ✅ | ✅ | ➖ |

### Manques qui devront être adressés

**Item 2 — pickers non typés** (rattaché à D.7, débloque F.1/F.2/F.3) :
- `ColSelect` (Inspector.jsx:378) : utilisé dans SQL, Pivot, Validation (cible).
- `mainCols`/`refCols` du Filtre (Inspector.jsx:991-1004 d'après l'audit 03) :
  Filtre compare des valeurs, c'est typiquement là que le type compte le plus.

**Item 5 — preflight incomplet** : les blocs Doublons (clé vide), Pivot (colonnes
manquantes), Nettoyage (op sans colonne), Calcul (formule vide), Cols (sélection
vide), Export (`filename` vide) n'ont pas encore de règle. Ajouter ligne par
ligne dans `preflightWorkflow()`.

**Item 8 — exemples** : aujourd'hui seul Calcul en a (`CALC_EXAMPLES`).
À étendre à SQL, Nettoyage, Filtre — c'est **F.4**.

### Mapping F.x → manques du contrat

- **F.1 Union au socle** → preflight (alignement des schémas) + info-bulle qui
  prévient sur la stratégie `union_by_name` vs par position + aperçu des colonnes
  orphelines.
- **F.2 Pivot au socle** → pickers typés (item 2) + preflight (item 5) + bulle
  enrichie (déjà partiellement faite).
- **F.3 Filtre typé** → pickers typés sur `mainCols`/`refCols` (item 2) + dry-run
  des lignes exclues (bonus).
- **F.4 Exemples** → item 8 sur SQL, Clean, Filter.
- **F.5 Dry-run gros volumes** → ce n'est pas un item du contrat *à proprement
  parler* mais une couche transverse qui sert tous les blocs lourds.

---

## Pour ajouter un nouveau bloc

Avant d'ouvrir un PR qui introduit un nouveau bloc exécutable, vérifier la
checklist ci-dessus (items 1–6 minimum). Les items 7–8 sont *fortement
recommandés* dès qu'il y a un concept à expliquer ou une configuration variable.

La règle de cohérence anti-slop (§1 de la roadmap) s'applique aussi : la *forme*
des selects, des info-bulles, des messages d'erreur doit être empruntée aux
blocs existants — pas réinventée à la pelle.
