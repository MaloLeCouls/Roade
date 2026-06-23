# Roade en application de bureau (.exe Windows)

Empaqueter Roade en **un seul programme Windows** que quelqu'un lance d'un
double-clic — sans installer Python, ni Node, ni Docker, **sans cloud et sans
compte**. Les fichiers de l'utilisateur restent sur sa machine : c'est l'esprit
« local-first » de Roade, livré clés en main.

Au lancement, le `.exe` démarre un petit serveur local et ouvre Roade dans le
**navigateur par défaut** sur une adresse `http://127.0.0.1:…`. Une **petite
fenêtre console** (fond noir) reste ouverte pendant l'utilisation — c'est normal
et volontaire (voir [« Pourquoi une fenêtre console »](#pourquoi-une-fenêtre-console-reste-ouverte)) ;
la fermer arrête l'application.

> **Déjà validé.** Le binaire a été construit et testé de bout en bout sur
> Windows (Python 3.14) : démarrage, service du frontend, création du projet
> d'exemple et **exécution complète d'un workflow** (DuckDB + pandas + pyarrow
> embarqués fonctionnent). Le livrable est un dossier `dist\Roade\` (~185 Mo),
> compressé en un `.zip` (~77 Mo) à transférer.

---

## Construire le `.exe`

Prérequis : être **sur Windows** (un `.exe` se construit sur la plateforme
cible), avec le dépôt installé (voir [`DEV.md`](DEV.md)) et PyInstaller dans le
venv.

```powershell
# 1. (Re)builder le frontend — le .exe embarque frontend/dist :
npm --prefix frontend run build

# 2. Installer l'outil de packaging (une fois) :
.\.venv\Scripts\python.exe -m pip install pyinstaller

# 3. Construire :
.\.venv\Scripts\python.exe -m PyInstaller --noconfirm roade_desktop.spec
```

Résultat : le dossier **`dist\Roade\`**, contenant `Roade.exe` et ses
dépendances (~185 Mo).

> Le `.exe` seul ne suffit pas : il a besoin des fichiers du dossier `dist\Roade\`
> à côté de lui. C'est pourquoi on distribue **tout le dossier** (voir plus bas).

## L'envoyer à quelqu'un (un manager, un collègue)

1. **Compresser** le dossier `dist\Roade\` en `.zip` (clic droit → *Envoyer
   vers → Dossier compressé*). Le `.zip` se transfère par lecteur partagé ou clé
   USB (trop volumineux pour un e-mail).
2. La personne **décompresse** le `.zip` où elle veut (Bureau, Documents…).
3. Elle ouvre le dossier et **double-clique `Roade.exe`**. Roade s'ouvre dans son
   navigateur. C'est tout.

### Au tout premier lancement : l'alerte Windows

Le programme n'est pas signé (la signature est payante) : Windows affichera
**« Windows a protégé votre PC »**. Message à transmettre :

> *« C'est normal, l'appli n'est pas signée par un éditeur commercial. Clique sur
> « Informations complémentaires », puis sur le bouton « Exécuter quand même ».
> À faire une seule fois. »*

## Pourquoi une fenêtre console reste ouverte

Le `spec` est volontairement en `console=True`. On a essayé le mode « sans
fenêtre » (`console=False`, plus joli) : le bootloader « application GUI »
produit par PyInstaller est un **motif que les antivirus suppriment à la volée**
(on l'a constaté — l'exécutable disparaissait juste après le build, alors que le
build *avec* console survivait). La fenêtre console est donc le choix **fiable**
pour distribuer le `.exe` sans qu'il se fasse effacer, ici comme sur le poste du
destinataire. ⚠️ **Ne pas “corriger” `console` en `False`** dans `roade_desktop.spec`
sans une signature de code (payante) ou une exclusion antivirus.

## Où sont rangés les fichiers ?

Un dossier **`Roade-projets`** est créé dans les **Documents** de l'utilisateur
(`Documents\Roade-projets`) : il contient les fichiers importés, les workflows et
les exports. Il est **volontairement à l'écart du dossier de l'application**,
pour qu'une **mise à jour** (remplacer le dossier `Roade`) **n'efface jamais les
données**. Pour sauvegarder le travail, il suffit de copier ce dossier.

> Anciennes versions (≤ 0.5.0) : les projets étaient à côté de `Roade.exe`. Au
> premier lancement de la nouvelle version, s'il existe encore un ancien dossier
> `Roade-projets` à côté de l'exe, il est **déplacé automatiquement** vers les
> Documents (aucune perte). On peut toujours forcer un autre emplacement avec
> `ROADE_PROJECTS_DIR`.

## Réglages (variables d'environnement, optionnel)

- `ROADE_PORT` — forcer un port fixe (sinon un port libre est choisi
  automatiquement). Utile pour un favori stable.
- `ROADE_NO_BROWSER` — ne pas ouvrir le navigateur au démarrage (tests, serveur).
- `ROADE_PROJECTS_DIR` — ranger les projets ailleurs qu'à côté de l'exécutable.

## Bon à savoir

- **Windows uniquement.** Pour un `.exe` Windows, on build sur Windows ; pour un
  Mac, il faudrait builder sur un Mac (même `desktop.py`, même `spec`).
- **Une personne à la fois.** Roade est conçu pour un seul utilisateur ; ce n'est
  pas un serveur multi-sessions.
- **Mises à jour.** Pour livrer une nouvelle version, on reconstruit et on
  renvoie le `.zip`. La personne remplace son dossier `Roade` par le nouveau ;
  ses données (dans `Documents\Roade-projets`) ne sont pas touchées. (Pas
  d'auto-update.)
- **Alternative en ligne** (lien partagé au lieu d'un fichier) : voir
  [`DEPLOY.md`](DEPLOY.md).
