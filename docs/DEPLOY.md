# Déployer Roade en ligne (partager un lien)

Objectif : donner à quelqu'un (un manager, un collègue) **un simple lien** vers
Roade, sans rien à installer de son côté — juste un navigateur. On déploie
l'image Docker de prod (un seul process FastAPI qui sert l'API **et** le
frontend), et on la protège par un mot de passe.

> ⚠️ **Roade n'a pas de comptes.** Sans mot de passe, une URL publique est
> ouverte à tout internet. **Toujours** définir `ROADE_PASSWORD` avant de
> partager le lien (voir étape 3).

---

## Option recommandée — Railway

Railway build directement depuis le dépôt GitHub via le `Dockerfile`, fournit
une URL HTTPS et un disque persistant. Le plus court chemin.

1. **Pousser le code sur GitHub** (déjà fait : `MaloLeCouls/Roade`). Vérifier
   que `main` est à jour : `git push`.

2. **Créer le service.** Sur [railway.app](https://railway.app) → *New Project*
   → *Deploy from GitHub repo* → choisir `Roade`. Railway détecte le
   `Dockerfile` et build tout seul. (Le port est géré : le conteneur écoute sur
   `$PORT` fourni par Railway.)

3. **Définir le mot de passe.** Onglet *Variables* du service → ajouter :
   - `ROADE_PASSWORD` = un mot de passe solide (ex. généré, 16+ caractères).
   - *(optionnel)* `ROADE_USER` = l'identifiant (défaut : `roade`).

4. **Ajouter un disque persistant** (sinon les projets, imports et exports sont
   effacés à chaque redéploiement). Onglet *Volumes* → *New Volume* → **Mount
   path : `/app/projects`**.

5. **Récupérer l'URL.** Onglet *Settings* → *Networking* → *Generate Domain*.
   On obtient un lien `https://roade-production-xxxx.up.railway.app`.

6. **Donner l'accès.** Envoyer au manager : l'URL + l'identifiant (`roade` par
   défaut) + le mot de passe. À l'ouverture, le navigateur affiche une fenêtre
   de connexion native — il saisit les deux, une fois, et c'est tout.

---

## Alternative — Render

Même principe (build via `Dockerfile`) :

1. [render.com](https://render.com) → *New* → *Web Service* → connecter le repo
   `Roade`. Runtime : *Docker*.
2. *Environment* → ajouter `ROADE_PASSWORD` (et `ROADE_USER` si besoin). Render
   fournit `PORT` automatiquement, le conteneur s'y adapte.
3. *Disks* → *Add Disk* → **Mount path `/app/projects`** (≥ 1 Go).
4. Render expose l'URL HTTPS. La donner au manager avec les identifiants.

> Le plan gratuit de Render met le service en veille après inactivité (premier
> chargement lent) et le disque persistant est payant. Pour un usage régulier,
> prévoir un petit plan payant — comme sur Railway.

---

## Vérifier / faire tourner en local d'abord

L'image de prod tourne aussi en local, mot de passe compris :

```bash
# sans mot de passe (comme aujourd'hui) :
docker compose up --build            # → http://localhost:8000

# en simulant le mode "en ligne" protégé :
ROADE_PASSWORD=test docker compose up --build
# puis se connecter avec roade / test
```

## Bon à savoir

- **Données.** En ligne, les fichiers importés vivent sur le disque de
  l'hébergeur (le volume `/app/projects`), pas sur la machine de l'utilisateur.
  L'esprit « local-first » de Roade ne s'applique plus dans ce mode — à garder
  en tête si les fichiers sont sensibles. Pour du strictement local, voir le
  [guide développeur](DEV.md) (lancement sur poste).
- **HTTPS.** Railway et Render fournissent le HTTPS : le mot de passe Basic
  transite chiffré. Ne pas exposer Roade en clair (`http://`) sur internet.
- **Licence.** Roade est sous AGPL-3.0 : mettre une version (même non modifiée)
  à disposition via un réseau est permis ; si tu **modifies** le code et le
  déploies, l'AGPL impose d'en publier la source aux utilisateurs.
- **Un seul utilisateur à la fois.** Roade n'a pas (encore) de multi-session :
  c'est fait pour qu'une personne pilote l'app. Plusieurs personnes sur la même
  URL en même temps partagent le même état de projet.
