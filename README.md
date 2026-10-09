# BellePoule Modern - Logiciel moderne de gestion de compétitions d'escrime

🤺 **Logiciel moderne de gestion de compétitions d'escrime** avec interface multilingue et temps réel

---

☕ **Ce projet est gratuit et open source.** Si BellePoule Modern vous est utile, vous pouvez soutenir son développement :

**[👉 Buy Me a Coffee — klinnex](https://buymeacoffee.com/klinnex)**

Merci pour votre soutien ! / Thank you for your support!

---

### 📚 **Documentation**

| Public | Document |
|---|---|
| Organisateur | [Manuel utilisateur](USER_MANUAL.md) · [Installation](INSTALLATION.md) · [Saisie distante](REMOTE_SCORE_GUIDE.md) · [Démarrage express](REMOTE_SCORE_QUICKSTART.md) |
| Arbitre | **[Interface d'arbitrage](docs/ARBITRAGE.md)** · **[Scénarios de match](docs/SCENARIOS_MATCH.md)** |
| Équipes | [Compétitions par équipes](docs/TEAM_COMPETITIONS.md) |
| Exports | [Guide export PDF](docs/USER_GUIDE_PDF_EXPORT.md) · [Formats de fichiers](FILE_FORMATS.md) |
| Développeur | [Architecture](ARCHITECTURE.md) · **[Stack technique et versions](docs/STACK_TECHNIQUE.md)** · [Guide de développement](DEVELOPMENT_GUIDE.md) · [Contribuer](CONTRIBUTING.md) |
| Divers | [Dépannage](TROUBLESHOOTING.md) · [Mises à jour](UPDATE_SYSTEM.md) · [Sécurité saisie distante](docs/SECURITE_SAISIE_DISTANTE.md) · [Index complet](docs/README.md) |

### 🔧 **Installation**

- **Windows** : installeur NSIS ou exécutable portable (x64)
- **macOS** : DMG ou ZIP (Intel x64 et Apple Silicon arm64)
- **Linux** : AppImage, .deb ou .rpm (x64)

### 🚀 [**Télécharger la dernière version stable**](https://github.com/klinnex/bellepoule-modern/releases/latest)

### 🧪 [**Télécharger la version de développement (dev)**](https://github.com/klinnex/bellepoule-modern/releases?q=dev-build&expanded=true)

> ⚠️ **Version de test** : Contient les dernières fonctionnalités mais peut être instable

## 🆕 Nouveautés Récentes

### ⚔️ **Sabre Laser équipe — format arène (Nouveau !)**

Nouveau format de compétition par équipes pour le Sabre Laser, basé sur le
règlement de l'ASL-FFE :

- 🎯 **Assauts plafonnés** à 5 touches ou 3 minutes (au lieu du relais FIE à
  cible cumulée progressive)
- 🏆 **Score de rencontre** = total des points marqués, classement de poule
  par points cumulés
- 🟨 **Cartons d'équipe « E »** persistés (blanc/jaune/rouge/noir)
- 📅 **Calendriers de poule figés** pour 8 ou 12 équipes, avec équipes
  assesseurs
- 🔀 **Évitement de revanche** au 1er tour du tableau à élimination directe
- 📱 **Saisie temps réel sur tablette arbitre** avec compteur de touches
  déclenchant automatiquement le changement de relayeur, et affichage arène
  dédié

Voir [docs/TEAM_COMPETITIONS.md](docs/TEAM_COMPETITIONS.md) pour le détail
complet et les limites connues.

### 🚀 **Fonctionnalités majeures**

Ces versions apportent de nombreuses fonctionnalités demandées par la communauté :

#### ✨ **Nouvelles Fonctionnalités**

- 👨‍⚖️ **Gestion Avancée des Arbitres** - Assignation automatique avec détection de conflits
- 🖥️ **Tableau de Bord Live** - Affichage public en temps réel pour les salles d'armes
- 🔔 **Webhooks** - Notifications Discord/Slack (HTTPS) depuis le serveur de saisie distante
- 🎨 **Gestion des Photos** - Import photos des tireurs avec drag & drop
- 🖥️ **Mode Kiosk** - Affichage public (TV) configurable : tableau, poules, classement
- 🇪🇸🇩🇪🇭🇰 **Nouvelles Langues** - Support complet de l'espagnol, de l'allemand, du catalan et du chinois traditionnel (Hong Kong)

#### 🔧 **Améliorations Techniques**

- ⚡ **Services de Performance** - Cache intelligent, listes virtuelles, monitoring
- 🎯 **Classement Corrigé** - Départage par touches au-delà de la 4e place
- 📊 **Performance Optimisée** - Virtualisation, memoïsation

### 🔮 **Fonctionnalités à venir**

D'après l'analyse du code et les demandes utilisateurs, les prochaines mises à jour incluront :

#### 🏆 **En Développement**

- 👥 **Compétitions par Équipes (relais FIE)** - Poules et tableau à élimination directe par équipes, relais arme-aware — le format arène Sabre Laser (ci-dessus) est disponible dès maintenant ; le relais FIE générique (Épée/Fleuret/Sabre) reste en développement (voir [docs/TEAM_COMPETITIONS.md](docs/TEAM_COMPETITIONS.md) pour le détail et les limites connues)
- ⚖️ **Système de Pénalités** - Cartons jaunes/rouges/noirs avec impact sur scores
- ⏰ **Gestion des Retardataires** - Auto-forfait après délai configurable
- 🏅 **Double Élimination** - Brackets gagnants et perdants

#### 🚀 **Planifiées**

- 📊 **Classement Elo** - Calcul automatique et historique
- 🎥 **Replay Vidéo** - Analyse frame par frame des matchs
- 💰 **Gestion Financière** - Frais d'inscription et suivi des dépenses
- 🏟️ **Gestion des Lieux** - Plan interactif des pistes
- 🌐 **Portail d'Inscription** - Pré-inscription en ligne

[Voir ROADMAP.md pour la liste complète](./ROADMAP.md)

### 📄 Export PDF optimisé

- **⚡ Performance 60-70% améliorée** - Export PDF jusqu'à 3x plus rapide
- **🏗️ Architecture modulaire** - Code maintenable et évolutif
- **📋 Format professionnel** - Cadre "PISTE X" et matchs en colonnes
- **🔧 Gestion d'erreurs robuste** - Multiples fallbacks pour fiabilité maximale

### 🎯 Fonctionnalités PDF

- **Export individuel** : Poules avec cadre piste et 4 matchs maximum
- **Export multiple** : Toutes les poules dans un seul document unifié
- **Options avancées** : Filtrage des matchs, classements, personnalisations
- **Compatibilité totale** : A4 paysage optimisé pour l'escrime

## 🌐 Langues disponibles

- 🇫🇷 **Français** (par défaut)
- 🇺🇸 **Anglais**
- 🇫🇷 **Brezhoneg (Breton)**
- 🇪🇸 **Català (Catalan)** _(Nouveau !)_
- 🇩🇪 **Deutsch (Allemand)** _(Nouveau !)_
- 🇪🇸 **Español (Espagnol)**
- 🇭🇰 **繁體中文 (Chinois traditionnel – Hong Kong)** _(Nouveau !)_

## 🎯 Caractéristiques principales

- **🗂️ Base de données SQLite** pour stocker toutes les données de compétition
- **🌐 Interface moderne** avec design épuré et responsive
- **📱 Gestion en temps réel** des scores et arènes
- **🏊 Support multilingue** (français, anglais, breton, catalan, allemand, espagnol, chinois traditionnel HK)
- **👨‍⚖️ Gestion des arbitres** avec assignation automatique et rotation
- **🔔 Webhooks** Discord/Slack
- **🖥️ Tableau de bord Live** pour affichage public en temps réel
- **📱 Mode déconnecté** pour les tablettes arbitres
- **🖥️ Mode Kiosk** affichage public
- **⚡️ Sauvegarde automatique** des données
- **📊 Export des résultats** en multiple formats
- **⚡ Optimisation performance** cache intelligent et listes virtuelles
- **🔐 Sécurité** chiffrement des données sensibles

## 🎯 Fonctionnalités principales

### 📋 **Appel (pointage)**

- ✅ Inscription et gestion des tireurs
- ✅ Pointage/dépointage
- ✅ Support abandon et forfait avec impact automatique sur tous les matchs
- ✅ Mise à jour automatique des classements

### 📄 **Export PDF Optimisé (Nouveauté !)**

- ⚡ **Performance 60-70% améliorée** - Export PDF ultra-rapide
- 🏗️ **Architecture modulaire** - Code maintenable et évolutif
- 📋 **Format professionnel** - Cadre "PISTE X" et matchs en colonnes
- 🔧 **Gestion d'erreurs robuste** - Fiabilité maximale avec fallbacks
- 📊 **Monitoring performance** - Suivi des métriques en temps réel
- 🎯 **Support complet** - Export simple et multiple de poules
- 📚 **Documentation avancée** - Guides techniques et utilisateur complets

### 🚀 **Performance Optimizations (Nouveauté !)**

- 🔧 **Memory Management** - Correction des fuites mémoire avec Promise.allSettled
- ⚡ **React Performance** - Optimisation des re-renders et dépendances useMemo
- 📊 **Algorithm Efficiency** - Calculs de classement optimisés avec Map et WeakMap
- 🎨 **CSS Optimisé** - Variables CSS et classes utilitaires pour maintenabilité
- 📈 **Batch Processing** - Traitement par lot des statistiques tireurs
- 🛡️ **Error Handling** - Logging amélioré avec IDs spécifiques pour debug

### 📊 **Analytics Dashboard (Nouveauté !)**

- 📈 **Real-time Metrics** - Statistiques en temps réel pour les entraîneurs
- 🏆 **Top Performers** - Classement des tireurs les plus performants
- 🎯 **Weapon Statistics** - Analyse détaillée par arme et match
- 📱 **Auto-refresh** - Mises à jour automatiques toutes les 5 secondes
- 📋 **Pool Progress** - Suivi de l'avancement des poules en direct

### 📱 **Tablet Interface (Nouveauté !)**

- 🎯 **Touch Optimization** - Interface optimisée pour tablettes avec zones de touch
- 👆 **Swipe Gestures** - Glisser pour ajouter des points rapidement
- 🔊 **Minuteur vocal** - Annonces du temps restant sur la tablette d'arbitrage (TTS)
- ⏱️ **Large Timer** - Chronomètre visible de loin pour les arènes
- 🔄 **Quick Actions** - Boutons géraux pour les actions fréquentes

### 🔄 **Tournament Flow Management (Nouveauté !)**

- 🎯 **Smart Scheduling** - Optimisation automatique des plannings
- 🏟️ **Arena Balancing** - Répartition intelligente des matchs sur les pistes
- ⏰ **Rest Time Management** - Respect des temps de repos pour les tireurs
- 📊 **Flow Analytics** - Identification des goulots d'étranglement
- 🔮 **Predictive Insights** - Prédictions de durée et optimisations

### 👨‍⚖️ **Gestion Avancée des Arbitres** _(Nouveau !)_

- ⚖️ **Assignation Automatique** - Algorithme intelligent de distribution des arbitres
- 🔄 **Rotation des Arbitres** - Équilibrage des assignations avec temps de repos
- ⚠️ **Détection de Conflits** - Alerte si un arbitre doit arbitrer son propre club
- 📊 **Rapports de Statistiques** - Suivi des matchs arbitrés par arbitre
- 🎛️ **Configuration Flexible** - Paramètres de rotation personnalisables

### 🖥️ **Tableau de Bord Live**

- 📺 **Affichage Public** (`/dashboard.html`, `/kiosk`) - Interface optimisée pour écrans géants
- 🔴 **Matchs en Direct** - Suivi en temps réel des scores avec animations
- 📊 **3 Vues Disponibles** : Poules / Tableau / Classement Final
- 📱 **Design Responsive** - Adapté pour tous les écrans
- 🔄 **Auto-refresh** - Mises à jour automatiques

### 🔔 **Webhooks**

- 🔗 **Discord / Slack** - URL HTTPS configurée dans les Paramètres, transmise au serveur de saisie distante
- 🎯 **Événements** : fin de match et événements de compétition

### ⚡ **Services de Performance** _(Nouveau !)_

- 💾 **Cache Intelligent** - Mise en cache avec expiration (TTL) configurable
- 📜 **Mémoïsation** - Optimisation des calculs répétés
- 📋 **Listes Virtuelles** - Rendu optimisé pour grandes listes (>500 éléments)
- 🖼️ **Optimisation Images** - Compression et redimensionnement automatique
- 📊 **Monitoring** - Suivi des performances avec métriques détaillées

### 🎨 **Gestion des Photos** _(Nouveau !)_

- 🖼️ **Photos des Tireurs** - Import et affichage des photos par tireur
- 📤 **Upload Drag & Drop** - Glisser-déposer pour ajouter des photos
- 🗜️ **Compression Auto** - Redimensionnement (300x300px max) et compression JPEG
- 🔤 **Initiales** - Affichage des initiales si pas de photo
- 📄 **Intégration Feuilles** - Photos visibles sur les feuilles de match

### 🖥️ **Mode Kiosk**

- 📺 **Affichage public** (`/kiosk`) - Tableau, poules, classement en temps réel sur TV
- 🎨 **Thème et note** - Thème dédié, message affiché (ex. « Déjeuner des arbitres »)
- 🎛️ **Télécommande** - Pilotage des écrans depuis l'application ([docs/TELECOMMANDE_TV.md](docs/TELECOMMANDE_TV.md))

### 🎯 **Poules**

- ✅ Génération automatique des poules sérpentine
- ✅ Configuration personnalisée (nombre de tireurs par poule, tours de poules)
- ✅ Système de chronométrage des matchs
- ✅ Support des défections (abandon, forfait, exclusion)
- ✅ Vue en arborescence
- 📄 **Intégration PDF** - Export direct des poules vers PDF professionnel

### 🎯 **Saisie distante**

- 📡 Serveur WebSocket pour les arbitres
- 📱 Interfaces pour tablettes
- 📡 Affichage temps réel sur les arènes
- 🎯 Contrôle total (démarrer, pause, terminer, réinitialiser)

### 📡 **Arènes**

- 📊 Affichage individuel par arène (`https://IP:8066/arene1`, etc.)
- 🎯 Interface d'arbitrage (`https://IP:8066/arene1/arbitre`) — voir [docs/ARBITRAGE.md](docs/ARBITRAGE.md)
- 🎯 Synchronisation automatique des scores et temps
- 🔒 HTTPS (certificat auto-signé) et mot de passe par arène
- 📴 Mode hors-ligne des tablettes (file de synchronisation)
- ✍️ Signatures des tireurs (poules, tableau)

### 📡 **Exports**

- 📊 Formats multiples (CSV, JSON)
- 📊 Fiches XML FFE compatibles
- 📊 Résultats complets avec classements

## 💻 **Spécifications système requises**

### **Configuration minimale**

- **OS** : Windows 10+, macOS 10.15+, Linux (Ubuntu 20.04+)
- **RAM** : 4 Go minimum (8 Go recommandé)
- **Stockage** : 500 Mo d'espace disque
- **Réseau** : Connexion internet pour les fonctionnalités réseau (optionnel)

### **Configuration recommandée**

- **OS** : Windows 11, macOS 12+, Linux récent
- **RAM** : 8 Go ou plus
- **Stockage** : 1 Go d'espace disque
- **Réseau** : WiFi/Ethernet stable pour mode multi-appareils

### **Navigateurs supportés** (pour les interfaces web)

- Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## 🔧 **Technologies**

- **Electron 44.5** (Node 22) : application de bureau multi-plateforme
- **React 19.3** + **Zustand 5** : interface et état
- **TypeScript 6.0** (strict) + **Webpack 5**
- **SQLite** via **better-sqlite3 13**
- **Express 5** + **Socket.IO 4.8** : serveur temps réel des tablettes
- **jsPDF 4** : génération PDF
- **Vitest 4** + **Playwright 1.63** : tests

Liste complète et versions : [docs/STACK_TECHNIQUE.md](docs/STACK_TECHNIQUE.md).
- **safeStorage (OS)** : chiffrement des secrets locaux
- **Service Workers** : mode hors-ligne des tablettes
- **Architecture modulaire** : Code maintenable, testable et évolutif

## 📥 **Téléchargement**

### 🚀 **Version Stable** (Production)

📦 **[Voir toutes les releases stables](https://github.com/klinnex/bellepoule-modern/releases)** | 🔄 **[Dernière version stable](https://github.com/klinnex/bellepoule-modern/releases/latest)**

| Plateforme | Fichiers |
|---|---|
| **Windows** x64 | `BellePoule Modern-<version>-setup.exe` (installeur), `-portable.exe` |
| **macOS** x64 / arm64 | `BellePoule Modern-<version>-<arch>.dmg` / `.zip` |
| **Linux** x64 | `BellePoule Modern-<version>-<arch>.AppImage` / `.deb` / `.rpm` |

### 🧪 **Version de Développement** (Tests)

📦 **[Télécharger la dernière version dev](https://github.com/klinnex/bellepoule-modern/releases?q=dev-build&expanded=true)**

> ⚠️ **Attention** : Cette version est destinée aux tests et peut contenir des bugs.

Mêmes formats, publiés en pré-release à chaque push sur `dev`.

### 🔧 **Installation des executables**

#### **Windows**

1. Télécharger `-setup.exe` (installeur) ou `-portable.exe` (sans installation)
2. Double-cliquer pour lancer

#### **macOS**

1. Télécharger le fichier `.dmg`
2. Double-cliquer pour monter l'image disque
3. Glisser l'application dans le dossier Applications
4. Accepter les permissions demandées

#### **Linux**

1. Télécharger le fichier `.AppImage` (ou `.deb` / `.rpm`)
2. Rendre le fichier exécutable : `chmod +x BellePoule.Modern-*.AppImage`
3. Lancer avec : `./BellePoule.Modern-*.AppImage`


## 🚀 **Installation pour développeurs**

```bash
# Cloner le dépôt
git clone https://github.com/klinnex/bellepoule-modern.git

# Installation des dépendances (Node.js 22 requis)
cd bellepoule-modern
npm install          # recompile better-sqlite3 pour Electron (postinstall)

# Construire et lancer
npm start

# Développement (watch main + dev server renderer)
npm run dev

# Vérifications
npm run type-check && npm run lint && npm run test:run

# Construire pour production
npm run build

# Créer les executables
npm run package
```

## 🔍 **Vérification de la version**

Pour vérifier la version installée :

- **Menu** : `Aide > À propos`
- **Raccourci** : `F1`
- **Ligne de commande** : `BellePoule.Modern.exe --version`

La version s'affiche sous la forme `1.0.3-build.XXXX`

## 🔄 **Builds automatiques**

Ce projet utilise **GitHub Actions** pour créer automatiquement :

### **Branche `main`** (Production)

- ✅ **Builds multi-plateformes** à chaque `push` sur `main`
- ✅ **Contrôles automatisés** : type-check, complétude i18n, tests unitaires, budget de taille du bundle
- ✅ **Releases stables** avec tous les executables
- ✅ **Numérotation automatique** des builds (build #XXX)

### **Branche `dev`** (Développement)

- 🧪 **Builds multi-plateformes** à chaque `push` sur `dev`
- 🧪 **Release `dev` permanente** mise à jour automatiquement
- 🧪 **Executables avec suffixe `-dev`** pour identification facile
- 🧪 **Tests des nouvelles fonctionnalités** avant merge sur main

### **Liens directs**

- 🟢 **Release stable** : [`/releases/latest`](https://github.com/klinnex/bellepoule-modern/releases/latest)
- 🧪 **Release dev** : [`/releases?q=dev-build`](https://github.com/klinnex/bellepoule-modern/releases?q=dev-build&expanded=true)
- 📊 **État des builds** : [GitHub Actions](https://github.com/klinnex/bellepoule-modern/actions)

## 📦 **Générer ses propres executables**

Pour créer des executables personnalisés :

```bash
# Construire l'application
npm run build

# Créer tous les executables
npm run package

# Créer pour une plateforme spécifique
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

Les executables générés seront dans le dossier `release/`.

## 📜 **Documentation**

- 📖 **Index de la documentation** : [docs/README.md](docs/README.md)
- 🐛 **Rapporter un bug** : [Issues GitHub](https://github.com/klinnex/bellepoule-modern/issues)
- 💡 **Demande de fonctionnalité** : [Discussions GitHub](https://github.com/klinnex/bellepoule-modern/discussions)

## 📄 **Licence**

Ce logiciel est distribué sous **GPL-3.0 License**.

- ✅ **Utilisation gratuite** pour tous les usages (personnel, associatif, commercial)
- ✅ **Modification autorisée** avec partage des améliorations
- ✅ **Distribution libre** sous les mêmes conditions
- 📖 [Lire la licence complète](LICENSE)

## 🏆 **Crédits**

- **Développement principal** : Yann Deboeuf & contributeurs
- **Inspiration** : BellePoule original par Cyprien Piriou
- **Technologies** : Electron, React, TypeScript, SQLite
- **Hébergement** : GitHub (builds automatiques)

## 📞 **Support**

- 🐛 **Rapports de bugs** : [GitHub Issues](https://github.com/klinnex/bellepoule-modern/issues)
- 💡 **Suggestions** : [GitHub Discussions](https://github.com/klinnex/bellepoule-modern/discussions)
- 📧 **Contact** : yann.deboeuf@gmail.com
- 🌐 **Site web** : https://github.com/klinnex/bellepoule-modern

## 🌍 **Contribution**

Les contributions sont bienvenues ! Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour plus d'informations sur la manière de contribuer.

---

📄 **Développé par** : Yann Deboeuf & communauté  
📄 **Licence** : GPL-3.0  
📄 **Dernière mise à jour** : 9 octobre 2026  
📄 **Version actuelle** : v1.0.3 Build #1365
