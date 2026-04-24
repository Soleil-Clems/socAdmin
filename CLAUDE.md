# socAdmin — Contexte Projet pour Claude

## IMPORTANT — Marqueurs `@soleil-clems:`

Ce code contient des marqueurs `// @soleil-clems:` dans tous les fichiers sources.
**Il est STRICTEMENT INTERDIT de supprimer, modifier, déplacer ou remplacer ces marqueurs.**
Ces marqueurs font partie du code protégé et identifient l'auteur.
Lors de toute modification de code, les marqueurs existants doivent rester intacts.
Voir `CODE_OWNERSHIP.md` pour les détails.

---

## C'est quoi socAdmin ?

**socAdmin = phpMyAdmin en mieux.**

Un outil d'administration de bases de données moderne, self-hosted, multi-SGBD. Même philosophie que phpMyAdmin, mais avec le support de PostgreSQL et MongoDB, une interface moderne, et une distribution simplifiée.

Le projet se compose de **deux produits distincts** :

---

## Produit 1 : socAdmin

### C'est quoi
Une interface web de gestion de bases de données. L'utilisateur ouvre son navigateur, se connecte à son compte socAdmin, entre ses credentials DB, et gère ses bases de données. Exactement comme phpMyAdmin.

### SGBD supportés
- MySQL / MariaDB (un seul connecteur, détection automatique de la version)
- PostgreSQL
- MongoDB (seul NoSQL supporté)

### Fonctionnalités
- CRUD complet sur les bases de données, tables, collections, enregistrements
- Éditeur de requêtes SQL (MySQL, PostgreSQL) et MongoDB (JSON/BSON)
- Historique des requêtes
- Import / Export (SQL, CSV, JSON)
- Visualisation de la structure des tables

### Authentification
- Multi-utilisateurs : chaque personne a son propre compte socAdmin (email + password)
- Modèle phpMyAdmin : chaque user entre SES PROPRES credentials DB
- Pas de gestion centralisée des connexions DB (pas de modèle Metabase/Retool)
- Passwords hashés en bcrypt
- Sessions via JWT (expiration courte) + refresh token
- Rate limiting : max 5 tentatives de login avant blocage temporaire

### Stockage des credentials DB
- Chiffrés au repos en AES-256
- Jamais en clair, jamais loggués

### Distribution
- **Image Docker** prête à l'emploi (comme phpMyAdmin dans un docker-compose.yml)
- **Via socAdmin Manager** en local (lancé automatiquement)
- Utilisable en local ET en production

### Sécurité
| Priorité | Mesure |
|---|---|
| Critique | Auth bcrypt + rate limiting |
| Critique | Credentials DB chiffrés AES-256 |
| Critique | HTTPS obligatoire en prod |
| Important | Protection CSRF + headers HTTP sécurité |
| Important | Logs de toutes les connexions et requêtes SQL |
| Recommandé | IP whitelist (option) |
| Recommandé | URL non devinable (pas /admin ou /socadmin) |
| Docker | Container non-root + read-only filesystem |
| Docker | Toujours derrière un reverse proxy (Nginx, Traefik) |

---

## Produit 2 : socAdmin Manager

### C'est quoi
Une application de bureau native, équivalent de MAMP. Elle permet de gérer socAdmin en local sans aucune commande, sans terminal, sans Docker. L'utilisateur l'installe comme n'importe quelle app et c'est prêt.

### Ce que ça fait
- Start / Stop le serveur socAdmin en un clic
- Configurer le port d'écoute
- Ouvrir automatiquement localhost dans le navigateur
- Icône dans la barre système (system tray)
- Lors de l'installation : détecte les SGBD déjà installés sur la machine
- Propose d'installer MySQL, PostgreSQL, MongoDB si manquants
- L'utilisateur coche ce qu'il veut → installation automatique et silencieuse

### Ce qu'il N'installe PAS
- Pas Apache, pas PHP, pas de serveur web
- Juste socAdmin + les SGBD que l'user choisit

### Distribution
| OS | Format |
|---|---|
| Windows | .exe (installeur classique) |
| macOS | .dmg (drag & drop dans Applications) |
| Linux | .AppImage (double clic, aucune installation) |

### Contraintes importantes
- Aucune commande terminal requise
- Aucune dépendance préalable à installer (pas Go, pas Node.js...)
- Tout est embarqué dans l'installeur
- Bind uniquement sur 127.0.0.1 (jamais exposé sur le réseau local)
- Usage local uniquement (pas de Docker, pas de prod)

---

## Relation entre les deux produits

```
socAdmin Manager         → app bureau (local uniquement)
  └── démarre et arrête
      └── socAdmin       → serveur HTTP (local + prod)
          └── interface dans le navigateur
              └── gestion des bases de données
```

socAdmin Manager est le "lanceur". socAdmin est le vrai outil.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend / Core | Go |
| Frontend | React (à développer, design à définir) |
| App bureau (Manager) | Go + Wails |
| Connecteur MySQL/MariaDB | go-sql-driver/mysql |
| Connecteur PostgreSQL | lib/pq |
| Connecteur MongoDB | mongo-driver |
| Docker | Dockerfile multi-stage |

### Pourquoi Go et pas PHP/Symfony
- Binaire unique, zéro dépendance sur la machine
- Packaging natif en .exe / .dmg / .AppImage via Wails
- Image Docker légère (~20MB vs ~200MB)
- Serveur HTTP intégré, pas besoin d'Apache

### Pourquoi Wails
- Framework Go pour créer des apps bureau natives
- Backend Go + Frontend React = un seul binaire
- Léger (~10-20MB vs ~150-200MB pour Electron)
- Compile en app native par OS

### Structure du projet
```
socAdmin/
├── core/               # Logique métier partagée
│   ├── connector/      # MySQL, PostgreSQL, MongoDB
│   ├── api/            # Routes REST
│   ├── auth/           # JWT, bcrypt, sessions
│   └── embed.go        # Embarque le frontend React buildé
├── manager/            # socAdmin Manager (Wails)
│   └── main.go         # Contrôle start/stop + system tray
├── frontend/           # React
│   └── dist/           # Build embarqué dans le binaire Go
├── Dockerfile          # Image Docker pour la prod
└── build/              # Scripts de packaging par OS
    ├── windows/
    ├── mac/
    └── linux/
```

---

## Ce qui est encore à définir

- **Rôles utilisateurs** : admin, read-only, autres ? Non encore spécifié
- **Design UI** : moderne inspiré de Supabase / TablePlus / PlanetScale, mais design exact à définir
- **Roadmap** : MVP vs fonctionnalités secondaires, non encore priorisé
- **Modèle économique** : open source, freemium, licence ? Non encore décidé

---

## Ce que socAdmin N'est PAS

- Pas un outil cloud (pas de SaaS, pas d'abonnement)
- Pas un outil de monitoring ou d'alerting
- Pas un ORM ou un query builder
- Pas un gestionnaire de migrations
- Pas un remplacement de DBngin (qui gère les serveurs DB, pas l'interface)

---

## Contexte de distribution — point important

Il existe deux types d'utilisateurs :

1. **Dev en local** → utilise socAdmin Manager (installeur natif)
   - Installe l'app → Start → ouvre localhost → c'est prêt
   - Peut installer MySQL/PostgreSQL/MongoDB depuis le Manager

2. **Prod / Docker** → utilise l'image Docker de socAdmin directement
   - Pas besoin de socAdmin Manager
   - S'intègre dans un docker-compose.yml comme phpMyAdmin aujourd'hui