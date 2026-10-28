# ZixBots 😘

> Le bot manager qui rangeait la clé du coffre dans le coffre.

Le code source **complet** de ZixBots : un manager Discord qui crée, lance, renouvelle et fait expirer des bots à la demande, avec ses **11 templates de bots** (modération, logs, tickets, musique, vocal, blacklist, etc.), son système de **clés de licence** et ses **essais gratuits**.

Tokens, clé de chiffrement, clés de licence et mots de passe ont été retirés avant la publication. Le chiffrement AES-256-GCM est toujours là, mais sans sa clé posée juste à côté, pour une fois.

> 📄 Avant d'héberger quoi que ce soit, lisez [`ANALYSE_SECURITE_TOKENS.txt`](ANALYSE_SECURITE_TOKENS.txt). C'est honnêtement le meilleur fichier du repo.

---

## Sommaire

- [Ce que ça fait](#-ce-que-ça-fait)
- [Les bots](#-les-bots)
- [Structure du repo](#-structure-du-repo)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Commandes du manager](#-commandes-du-manager)
- [Sécurité (lol)](#-sécurité-lol)
- [FAQ](#-faq)

---

## ✨ Ce que ça fait

1. Un client reçoit une **clé** (achetée, drop par un admin via `/drop`, ou générée avec `/createkey`).
2. Il fait `/create`, donne sa clé, le token de son bot et choisit un type (`sanction`, `logs`, `music`…).
3. Le manager **copie le template** dans `manager/BotRuntimes/<botId>_<type>/`, écrit la config, **chiffre le token** et lance le bot dans un processus enfant.
4. Le bot tourne jusqu'à son **expiration**. Le manager envoie un rappel la veille, puis le coupe.
5. Le client peut renouveler (`/updatebot`), changer son token (`/changetoken`) ou gérer son bot (`/manage`).

Il y a aussi une **API HTTP locale** (`127.0.0.1:3000`) que les bots utilisent pour la commande `mybot`. Elle n'a pas d'authentification par défaut : voir [Sécurité](#-sécurité-lol).

---

## 🤖 Les bots

| Dossier | Ce que c'est | Stack |
|---|---|---|
| `manager/` | Le chef d'orchestre : clés, création, start/stop, expirations, API locale | discord.js, better-sqlite3 |
| `sanction/` | Modération complète : ban, kick, mute, tempmute, warn, lock, hide, giveaways, snipe, perms par rôle… | discord.js, JSON |
| `logs/` | Logs de tout ce que Discord permet de logger : messages, rôles, salons, vocal, invites, threads, automod, soundboard, stickers, webhooks… | discord.js, better-sqlite3 |
| `ticket/` | Tickets avec panel, claim, catégories, transcripts, leaderboard, blacklist ticket | discord.js, better-sqlite3 |
| `music/` | Musique multi-bots via Lavalink, avec support Spotify, playlists et panel interactif | kazagumo, shoukaku, canvas |
| `voice/` | Salons vocaux temporaires et stats vocales | discord.js, better-sqlite3 |
| `gestion/` | Builder de messages Components V2, automatisations, giveaways avancés | discord.js |
| `bl/` | Blacklist de membres | discord.js, better-sqlite3 |
| `blr/` | Blacklist de rang : empêche certains membres de recevoir des rôles | discord.js, better-sqlite3 |
| `limitrole/` | Limite le nombre de membres par rôle | discord.js, better-sqlite3 |
| `utils/` | Utilitaires : embeds, profil du bot, etc. | discord.js, better-sqlite3 |

---

## 🗂 Structure du repo

```
ZixBots/
├── manager/                 # le manager
│   ├── index.js
│   ├── config.json          # token + owners + IDs (à remplir)
│   ├── SlashCommands/       # Admin/ et Public/
│   ├── Handlers/            # apiServer, botsService, base de données…
│   ├── Utils/               # tokenVault.js (le fameux), scheduler, runtime…
│   ├── BotsFolders/         # ← à créer : les templates vont ici
│   └── BotRuntimes/         # ← généré : une copie par bot client
├── sanction/  logs/  ticket/  music/  voice/  gestion/
├── bl/  blr/  limitrole/  utils/
├── ANALYSE_SECURITE_TOKENS.txt
└── README.md
```

⚠️ **Important :** le manager cherche ses templates dans `manager/BotsFolders/<type>/`. Dans ce repo, les bots sont à la racine, donc il faut les y déplacer ou les lier (voir l'installation).

---

## 📦 Prérequis

- **Node.js ≥ 20.10**
- De quoi compiler les modules natifs (`better-sqlite3`, `canvas`) :
  - Debian/Ubuntu : `sudo apt install build-essential python3 libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
  - Arch : `sudo pacman -S base-devel python cairo pango libjpeg-turbo giflib librsvg`
- Un **serveur Lavalink** pour le bot music (ramène le tien, celui en dur a été retiré)
- Un serveur Discord pour le manager, avec les salons de logs et le rôle client
- Un peu de courage

---

## 🚀 Installation

```bash
git clone https://github.com/mrtsubasa/ZixBots.git
cd ZixBots

# 1. Installer les dépendances partout
for d in manager bl blr gestion limitrole logs music sanction ticket utils voice; do
  (cd "$d" && npm install)
done

# 2. Ranger les templates là où le manager les cherche
mkdir -p manager/BotsFolders
for d in bl blr gestion limitrole logs music sanction ticket utils voice; do
  ln -s "../../$d" "manager/BotsFolders/$d"   # ou mv si tu préfères
done

# 3. Générer une clé de chiffrement HORS du repo (s'il te plaît)
sudo mkdir -p /etc/zixbots
openssl rand -base64 32 | sudo tee /etc/zixbots/vault.key > /dev/null
sudo chmod 600 /etc/zixbots/vault.key && sudo chown "$USER" /etc/zixbots/vault.key

# 4. Configurer (voir la section suivante), puis lancer
cd manager
TOKEN_VAULT_KEY_PATH=/etc/zixbots/vault.key \
BOTS_API_KEY="$(openssl rand -hex 32)" \
node index.js
```

Le nom de chaque dossier dans `BotsFolders/` devient le **type** proposé dans `/create`. Renomme-les si tu veux des noms plus vendeurs.

---

## ⚙️ Configuration

### `manager/config.json`

```jsonc
{
  "token": "TOKEN_DU_BOT_MANAGER",      // chiffré automatiquement au premier lancement
  "owners": ["TON_ID_DISCORD"],          // accès aux commandes Admin
  "color": "#2b2d31",
  "guildId": "ID_DU_SERVEUR_SUPPORT",
  "clientRoleId": "ID_DU_ROLE_CLIENT",   // donné automatiquement aux acheteurs
  "expiryReminderEnabled": true,
  "expiryReminderDays": 1,
  "channel": {
    "logs": "ID_SALON",
    "botCreateLogs": "ID_SALON",
    "keyCreateLogs": "ID_SALON"
    // … une vingtaine de salons de logs au total, voir le fichier
  },
  "database": { "path": "./Utils/DataBase/database.db" },
  "PID": []
}
```

La base SQLite et ses tables (`bot`, `cle`, `trial_use`) sont créées toutes seules au premier lancement.

### Configs des templates (`<bot>/config.json`)

Laisse `token` et `buyers` vides : le manager les remplit dans chaque copie de `BotRuntimes/`. Tu peux changer le `prefix` et la `color` par défaut.

### Variables d'environnement

| Variable | Rôle | Obligatoire ? |
|---|---|---|
| `TOKEN_VAULT_KEY_PATH` | Chemin vers la clé AES (32 octets base64) | Fortement conseillé |
| `TOKEN_VAULT_KEY` | La clé directement en variable d'env (prioritaire sur le fichier) | Alternative au précédent |
| `BOTS_API_KEY` | Secret de l'API locale. **Sans lui, l'API est ouverte à tout le monde** | Oui, sérieusement |
| `BOTS_API_PORT` | Port de l'API (défaut `3000`) | Non |
| `BOTS_API_URL` | URL de l'API vue par les bots (défaut `http://127.0.0.1:3000`) | Non |

> Si aucune clé n'est fournie, `tokenVault.js` en génère une dans `manager/Utils/.token-secret`, juste à côté de la base. C'est exactement le problème décrit dans le rapport. Le `.gitignore` l'exclut, mais l'idéal est de ne jamais en arriver là.

### Bot music (`manager/BotsFolders/music/.env`)

Ce `.env` sert de modèle et est recopié dans chaque runtime music.

```env
LAVALINK_HOST=ton.lavalink.tld
LAVALINK_PORT=2333
LAVALINK_PASSWORD=un_vrai_mot_de_passe_pas_agent
LAVALINK_SECURE=false
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_SEARCH_MARKET=FR
SUPPORT_URL=https://discord.gg/ton-serveur
```

`CONTROL_TOKEN`, `BUYER_ID`, `CLIENT_ID` et `MUSIC_TOKEN_1..20` sont gérés par le manager.

---

## 🛠 Commandes du manager

**Public**

| Commande | Description |
|---|---|
| `/create` | Créer son bot avec une clé |
| `/create-essai` | Créer un bot d'essai (une fois par utilisateur) |
| `/manage` | Gérer son bot |
| `/updatebot` | Renouveler son bot avec une nouvelle clé |
| `/changetoken` | Changer le token de son bot |
| `/mybot` | Voir et mettre à jour ses bots |
| `/help` | Liste des commandes |

**Admin** (owners uniquement)

| Commande | Description |
|---|---|
| `/createkey` · `/key` · `/delkey` · `/drop` | Créer, gérer, supprimer et envoyer des clés en MP |
| `/addbot` | Créer un bot sans clé |
| `/addtime` · `/removetime` | Ajouter ou retirer du temps à un bot |
| `/start` · `/stop` · `/restart` | Gérer un bot |
| `/start-all` · `/restartall` | Gérer tous les bots |
| `/update` · `/updateall` | Resynchroniser les runtimes avec les templates et redémarrer |
| `/delbot` | Supprimer un bot de la base et du disque |
| `/bot-list` · `/botinfos` · `/info-bot` · `/buyer-list` | Infos sur les bots et les acheteurs |
| `/bot-dossier` · `/bot-structure` | Inspecter le dossier d'un bot |
| `/manage` | Gérer le bot de n'importe qui |

---

## 🔐 Sécurité (lol)

Le chiffrement est **bien codé** : AES-256-GCM, IV aléatoire de 12 octets, tag d'authentification vérifié. Rien à redire là-dessus.

Le problème, c'est **tout le reste** :

- 🔑 La clé était un fichier texte de 44 caractères **dans le projet**, à deux dossiers de la base. Lire un seul fichier suffisait pour tout déchiffrer.
- 📂 La clé et la base étaient en `755`, donc lisibles par tous les utilisateurs de la machine.
- 🚪 L'API locale laisse **tout passer** si `BOTS_API_KEY` n'est pas défini, ce qui est le cas par défaut. N'importe quel processus local peut changer le token ou le propriétaire d'un bot.
- 🧬 Chaque bot client hérite de **tout l'environnement** du manager et peut charger son `tokenVault`. Un seul bot compromis donne accès à tous les autres.
- 🤫 Si le déchiffrement échoue, la fonction renvoie le texte chiffré sans erreur, et si la clé disparaît, une nouvelle est créée sans prévenir.

Le détail, les scénarios d'attaque et les correctifs sont dans **[`ANALYSE_SECURITE_TOKENS.txt`](ANALYSE_SECURITE_TOKENS.txt)**.

**Si tu héberges ça pour de vrai :** clé hors du repo, `BOTS_API_KEY` défini, `chmod 600` sur la clé et la base, et idéalement un utilisateur Unix ou un conteneur par bot.

---

## ❓ FAQ

**C'est le vrai code de ZixBots ?**
Oui, l'intégralité : le manager et tous les bots.

**Il manque des tokens, c'est cassé ?**
Non, c'est voulu. Mets les tiens.

**Pourquoi la base de données n'est pas incluse ?**
Parce qu'elle contenait les tokens de 55 bots clients et 37 clés de licence. Elle se recrée vide au lancement.

**Le chiffrement sert à quelque chose ?**
Maintenant, oui, à condition de mettre la clé ailleurs que dans le dossier qu'il est censé protéger.

**Je peux revendre ça ?**
Tu peux surtout lire le rapport de sécurité avant d'y mettre les tokens de quelqu'un.

**Support ?**
Non. 😘

---

<sub>Publié tel quel, sans garantie d'aucune sorte. Les secrets d'origine ont été retirés. Si tu en trouves un qui a survécu, dis-le, ce sera drôle.</sub>
