# 🛸 Among Us Web — Multijoueur en ligne

Un clone d'Among Us jouable dans le navigateur, avec multijoueur en temps réel via WebSockets.

## 🎮 Fonctionnalités

- **Multijoueur en ligne** (jusqu'à 12 joueurs)
- **Rôles** : Crewmate & Imposteur (assignés aléatoirement)
- **Carte du vaisseau** avec 14 salles
- **4 types de tâches** : Réparation de fils, Glisser la carte, Téléchargement, Détruire des astéroïdes
- **Système de meurtre** avec cooldown et proximité
- **Signalement de corps** / Réunion d'urgence
- **Réunions avec chat rapide** (mots pré-enregistrés)
- **Vote pour éjecter** un joueur
- **Condition de victoire** (tâches complètes / imposteurs éliminés / équipage éliminé)

## 🕹️ Contrôles

- **ZQSD** ou **Flèches directionnelles** : se déplacer
- **Bouton TÂCHE** : interagir avec une tâche proche
- **Bouton SIGNALER** : signaler un corps proche
- **Bouton TUER** (Imposteur) : tuer un joueur proche (cooldown 30s)
- **Bouton URGENCE** : appeler une réunion d'urgence (1 fois par partie)

## 🚀 Déploiement

### Backend (Render ou Railway — GRATUIT)

1. Créez un compte sur [render.com](https://render.com)
2. "New Web Service" → connectez votre repo GitHub
3. **Root Directory** : `server`
4. **Build Command** : `npm install`
5. **Start Command** : `npm start`
6. Copiez l'URL générée (ex: `https://among-us-server.onrender.com`)

### Frontend (Vercel — GRATUIT)

1. Créez un compte sur [vercel.com](https://vercel.com)
2. "New Project" → importez votre repo GitHub
3. **Root Directory** : `client`
4. Ajoutez la variable d'environnement :
   - `REACT_APP_SERVER_URL` = `https://votre-server.onrender.com`
5. Déployez !

### Alternative : développement local

```bash
# Installer toutes les dépendances
npm run install-all

# Lancer serveur + client simultanément
npm run dev
```

Le client sera sur http://localhost:3000 et le serveur sur http://localhost:3001.

## 📁 Structure du projet

```
among-us/
├── server/
│   ├── index.js         # Serveur Node.js + Socket.io
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.js       # Application React principale
│   │   ├── index.js
│   │   ├── hooks/
│   │   │   └── useSocket.js
│   │   └── styles/
│   │       └── App.css
│   ├── public/
│   │   └── index.html
│   └── package.json
├── vercel.json
├── package.json
└── README.md
```

## 🔧 Variables d'environnement

| Variable | Valeur par défaut | Description |
|---|---|---|
| `PORT` (server) | `3001` | Port du serveur |
| `REACT_APP_SERVER_URL` (client) | `http://localhost:3001` | URL du serveur |

## 🎯 Règles du jeu

- **4 joueurs minimum** pour démarrer
- Les **imposteurs** doivent tuer tous les crewmates sans être éjectés
- Les **crewmates** gagnent en complétant toutes leurs tâches OU en éjectant tous les imposteurs
- Pendant les réunions, utilisez le **chat rapide** pour débattre et **votez** pour éjecter un suspect
