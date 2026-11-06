# 📋 Product Requirements Document (PRD)
# BellePoule Modern

**Version** : 1.2  
**Date** : 21 février 2026  
**Auteur** : Yann Deboeuf  
**Statut** : Draft  

---

## 📑 Table des matières

1. [Vision & Objectifs](#1-vision--objectifs)
2. [Utilisateurs Cibles](#2-utilisateurs-cibles)
3. [Fonctionnalités](#3-fonctionnalités)
4. [Contraintes Réglementaires Sabre Laser (FFE)](#4-contraintes-réglementaires-sabre-laser-ffe)
5. [Exigences Techniques](#5-exigences-techniques)
6. [Architecture](#6-architecture)
7. [Roadmap](#7-roadmap)
8. [Métriques de Succès](#8-métriques-de-succès)
9. [Risques & Mitigations](#9-risques--mitigations)
10. [Annexes](#10-annexes)

---

## 1. Vision & Objectifs

### 1.1 Vision

**BellePoule Modern** a pour ambition de devenir **LA référence mondiale** pour la gestion des compétitions d'escrime, en remplaçant complètement l'ancien logiciel BellePoule par une solution moderne, performante et évolutive.

> *"Un logiciel d'escrime moderne, gratuit et open source, conçu par et pour la communauté."*

### 1.2 Objectifs Stratégiques

| Objectif | Description | Horizon |
|----------|-------------|---------|
| **Adoption** | 10 clubs utilisateurs actifs | 12 mois |
| **Remplacement** | Alternative crédible à l'ancien BellePoule | 6 mois |
| **Référence** | Standard de facto en France | 24 mois |
| **International** | Expansion hors France (Belgique, Suisse, etc.) | 36 mois |

### 1.3 Principes Fondateurs

1. **Open Source (GPL-3.0)** : Code source ouvert, contributions bienvenues
2. **Gratuit** : Aucune licence payante, jamais
3. **Multi-plateforme** : Windows, macOS, Linux (x64 & ARM64)
4. **Moderne** : Architecture évolutive permettant l'ajout rapide de fonctionnalités
5. **Communautaire** : Développé avec et pour les utilisateurs

---

## 2. Utilisateurs Cibles

### 2.1 Personas Principaux

#### 👨‍⚖️ Persona 1 : L'Arbitre (e-Arbitre)
| Attribut | Description |
|----------|-------------|
| **Rôle** | Arbitre sur piste lors des compétitions |
| **Contexte** | Utilise une tablette pour saisir les scores en temps réel |
| **Besoins** | Interface tactile intuitive, gros boutons, chronomètre visible |
| **Frustrations** | Interfaces trop petites, bugs de synchronisation |
| **Objectif** | Saisir les scores rapidement sans erreur |

#### 🤺 Persona 2 : Le Tireur
| Attribut | Description |
|----------|-------------|
| **Rôle** | Compétiteur participant aux tournois |
| **Contexte** | Consulte ses résultats, son classement, ses prochains matchs |
| **Besoins** | Accès rapide aux informations, notifications |
| **Frustrations** | Ne pas savoir quand passer, résultats tardifs |
| **Objectif** | Suivre sa progression et se préparer pour le prochain match |

#### 🏢 Persona 3 : Le Comité Technique
| Attribut | Description |
|----------|-------------|
| **Rôle** | Organisateur de la compétition |
| **Contexte** | Gère l'ensemble du tournoi depuis un PC central |
| **Besoins** | Vue d'ensemble, contrôle total, exports FFE |
| **Frustrations** | Logiciels obsolètes, bugs, manque de fonctionnalités |
| **Objectif** | Organiser une compétition fluide et sans accroc |

### 2.2 Niveau Technique

- **Niveau moyen** : Utilisateurs habitués aux logiciels de gestion de compétition
- **Besoin critique** : Documentation claire et complète
- **Formation** : Guides utilisateur, tutoriels vidéo (à développer)

---

## 3. Fonctionnalités

### 3.1 Fonctionnalités Actuelles (v1.0.1)

#### ✅ Gestion des Compétitions
| Fonctionnalité | Statut | Description |
|----------------|--------|-------------|
| Création de compétition | ✅ Fait | Titre, date, arme, catégorie, genre |
| Import tireurs (FFE) | ✅ Fait | Fichiers .fff, .csv, .xml |
| Pointage/Appel | ✅ Fait | Check-in des tireurs avec statuts |
| Abandon/Forfait | ✅ Fait | Impact automatique sur les matchs |

#### ✅ Phase de Poules
| Fonctionnalité | Statut | Description |
|----------------|--------|-------------|
| Génération serpentine | ✅ Fait | Répartition équilibrée des tireurs |
| Configuration flexible | ✅ Fait | Nombre de tireurs/poule, tours multiples |
| Saisie des scores | ✅ Fait | Interface modale avec validation |
| Classement automatique | ✅ Fait | V/M, indice, TD, TR |
| Export PDF | ✅ Fait | Grille + matchs sur une page |

#### ✅ Phase de Tableau (Élimination Directe)
| Fonctionnalité | Statut | Description |
|----------------|--------|-------------|
| Génération tableau | ✅ Fait | 4, 8, 16, 32, 64 tireurs |
| Seeding FIE | ✅ Fait | Placement selon classement poules |
| Gestion des byes | ✅ Fait | Attribution automatique |
| Propagation vainqueurs | ✅ Fait | Avancement automatique |

#### ✅ Système Quest (Sabre Laser) ⭐ PRIORITÉ ABSOLUE
| Fonctionnalité | Statut | Description |
|----------------|--------|-------------|
| Points Quest | ✅ Fait | 1-4 pts selon écart de score |
| Classement Quest | ✅ Fait | Points > TD > Victoires > V4/V3/V2/V1 |
| Affichage dédié | ✅ Fait | Colonne Quest dans les poules |

#### ✅ Fonctionnalités Techniques
| Fonctionnalité | Statut | Description |
|----------------|--------|-------------|
| Persistance session | ✅ Fait | Survit au refresh (F5) |
| Base SQLite | ✅ Fait | Stockage local portable |
| Multi-langue | ✅ Fait | FR, EN, Breton |
| Mises à jour auto | ✅ Fait | Vérification au démarrage |

### 3.2 Fonctionnalités Prioritaires (Roadmap)

#### 🔴 Priorité 1 : Interface Tablette (Q1 2026)
| Fonctionnalité | Description | Effort |
|----------------|-------------|--------|
| Zones tactiles agrandies | Boutons minimum 48x48px | M |
| Mode plein écran arbitre | Interface dédiée sans distractions | M |
| Gestes swipe | Ajouter points par glissement | S |
| Chronomètre grande taille | Visible de loin sur la piste | S |
| Commandes vocales | "Point rouge", "Point vert", "Pause" | L |
| Mode hors-ligne complet | Synchronisation différée | L |

#### 🟠 Priorité 2 : Documentation (Q1 2026)
| Document | Description | Effort |
|----------|-------------|--------|
| Guide utilisateur | Manuel complet avec captures | M |
| Tutoriels vidéo | 5-10 vidéos courtes | L |
| FAQ | Questions fréquentes | S |
| Guide arbitre tablette | Spécifique e-Arbitre | S |

#### 🟡 Priorité 3 : Stabilité & Bugs (Q1-Q2 2026)
| Action | Description | Effort |
|--------|-------------|--------|
| Tests automatisés | Couverture > 80% | L |
| Correction bugs connus | Backlog GitHub Issues | M |
| Performance | Optimisation 10 pistes simultanées | M |
| Monitoring | Logs et alertes | S |

#### 🟢 Priorité 4 : Nouvelles Fonctionnalités (Q2-Q3 2026)
| Fonctionnalité | Description | Effort |
|----------------|-------------|--------|
| Compétitions par équipes | Relais, matchs par équipe | XL |
| Export FFE officiel | Envoi résultats à la fédération | L |
| Version web/cloud | Option serveur centralisé | XL |
| Statistiques avancées | Analytics pour entraîneurs | M |

### 3.3 Matrice des Priorités (MoSCoW)

| Must Have | Should Have | Could Have | Won't Have (v1) |
|-----------|-------------|------------|-----------------|
| Interface tablette optimisée | Documentation complète | Version web/cloud | Intégration vidéo |
| Mode hors-ligne | Tests automatisés | Statistiques avancées | IA/ML prédictions |
| Système Quest stable | Export FFE | Notifications push | Réalité augmentée |
| 10 pistes simultanées | Multi-compétition | Thèmes personnalisés | Blockchain |

---

## 4. Contraintes Réglementaires Sabre Laser (FFE)

> **Source** : Règlement National FFE - Livret 2 : Système pour le Combat Sportif (Saison 2025-2026)

### 4.1 Conditions de Combat par Catégorie

| Catégorie | Âge | Score Max | Durée | Arène | Distance Garde |
|-----------|-----|-----------|-------|-------|----------------|
| **SENIOR** | 17+ ans | 15 points | 3 min | Ø 8m | 6m |
| **CADET (M17)** | 13-16 ans | 15 points | 3 min | Ø 8m | 4m |
| **BENJAMIN (M13)** | 9-12 ans | 15 points | 3 min | Ø 6m | 4m |

**Implémentation requise** :
- [ ] Configuration automatique selon catégorie sélectionnée
- [ ] Validation du score max (peut atteindre 19 pts avec touche finale 5 pts)
- [ ] Chronomètre 3 minutes en temps réel SANS arrêt (sauf incident)

### 4.2 Système de Cibles et Points

| Cible | Zone | Points | Description |
|-------|------|--------|-------------|
| **Cible A** | Mains, poignets, doigts, arme | **1 pt** | Extrémités |
| **Cible B** | Bras, jambes | **3 pts** | Membres |
| **Cible C** | Tête, tronc | **5 pts** | Zones vitales |

**Implémentation requise** :
- [ ] Saisie rapide par zone (boutons 1/3/5 pts)
- [ ] Score peut dépasser 15 (max 19 avec touche finale)
- [ ] Affichage clair des zones sur l'interface tablette

### 4.3 Système de Points Quest (Cotation des Duels)

| Écart de Score | Points Quest | Exemple |
|----------------|--------------|---------|
| ≤ 3 points | **1 pt Quest** | 11-9, 15-12 |
| 4-7 points | **2 pts Quest** | 15-8, 12-5 |
| 8-11 points | **3 pts Quest** | 15-4, 14-4 |
| ≥ 12 points | **4 pts Quest** | 15-2, 15-0 |

**Classement Quest (ordre de priorité)** :
1. Somme totale des points Quest
2. Nombre total de victoires
3. Nombre de victoires à cotation la plus élevée (V4 > V3 > V2 > V1)

**Implémentation requise** :
- [x] Calcul automatique des points Quest
- [x] Classement selon les critères FFE
- [ ] Affichage détaillé (V1/V2/V3/V4) dans le classement

### 4.4 Gestion des Cartons (Sanctions)

#### Groupes de Fautes

| Groupe | 1ère fois | 2ème fois | 3ème fois | 4ème fois |
|--------|-----------|-----------|-----------|-----------|
| **Groupe 1** | Carton JAUNE | Carton ROUGE | Carton ROUGE | Exclusion |
| **Groupe 2** | Carton ROUGE | Carton ROUGE | Exclusion | - |
| **Groupe 3** | Carton ROUGE | Exclusion | - | - |
| **Groupe 4** | Carton NOIR (exclusion immédiate) | - | - | - |

#### Fautes du Groupe 1 (Carton Jaune → Rouge)

| Faute | Description |
|-------|-------------|
| Commencer avant "Combattez!" | Départ anticipé |
| Continuer après "Cessez!" | Arrêt tardif |
| Corps à corps volontaire | Pour éviter une touche |
| Contre-attaque | Attaquer pendant qu'on subit une attaque |
| Substitution de cible | Remplacer une cible par une autre |
| Lâcher de sabre volontaire | Lâcher délibéré |
| Faire perdre du temps | Comportement dilatoire |
| Matériel non conforme | Après avertissement |

#### Fautes du Groupe 2 (Carton Rouge direct)

| Faute | Description |
|-------|-------------|
| Touche d'estoc | Coup de pointe interdit |
| Usage main/bras non armé | Action offensive/défensive avec main libre |
| Sortie volontaire | Pour éviter une touche |
| Frappe lourde | "Forcer" la parade adverse |

#### Fautes du Groupe 3 (Carton Rouge → Exclusion)

| Faute | Description |
|-------|-------------|
| Brutalité volontaire | Violence intentionnelle |
| Comportement dangereux répété | Mise en danger de l'adversaire |

#### Fautes du Groupe 4 (Carton Noir = Exclusion immédiate)

| Faute | Description |
|-------|-------------|
| Refus de combattre | Refuser un défi |
| Comportement anti-sportif grave | Insultes, violence |
| Tricherie avérée | Fraude délibérée |

**Points attribués par cartons** :
- Carton JAUNE : Avertissement (0 pt)
- Carton ROUGE : **+1 pt à l'adversaire** (touche de pénalité)
- Carton NOIR : Exclusion de la compétition

**Implémentation requise** :
- [ ] Boutons Carton Jaune/Rouge/Noir dans l'interface arbitre
- [ ] Historique des cartons par combattant
- [ ] Attribution automatique du point sur carton rouge
- [ ] Gestion de l'exclusion (carton noir)
- [ ] Cumul des cartons avec escalade automatique

### 4.5 Gestion des Sorties d'Arène

| Situation | Conséquence | Points |
|-----------|-------------|--------|
| Sortie 2 pieds hors de l'arène | Touche contre le sortant | **+3 pts adversaire** |
| Sortie volontaire (pour éviter touche) | Carton ROUGE + sortie | **+3 pts + 1 pt** |
| Sortie involontaire (bousculade) | Pas de pénalité | 0 pt |

**Implémentation requise** :
- [ ] Bouton "Sortie d'arène" avec attribution 3 pts
- [ ] Option "Sortie volontaire" pour ajouter carton rouge
- [ ] Distinction sortie volontaire/involontaire

### 4.6 Gestion de l'Abandon et du Forfait

#### Abandon en cours de match

| Situation | Conséquence |
|-----------|-------------|
| Abandon pendant le combat | Match terminé, score conservé |
| Blessure | Temps médical possible (décision arbitre) |

#### Forfait

| Formule | Conséquence pour le forfait | Conséquence pour adversaires |
|---------|----------------------------|------------------------------|
| **QUEST** | Points acquis conservés, reste au classement | Points acquis conservés |
| **ASL Compétition** | Points annulés en poule, classement acquis ensuite | Points annulés en poule |

**Implémentation requise** :
- [ ] Statut "Abandon" distinct de "Forfait"
- [ ] Traitement différent selon formule (Quest vs ASL)
- [ ] Conservation ou annulation des points selon règlement

### 4.7 Gestion de l'Exclusion (Carton Noir)

| Formule | Conséquence |
|---------|-------------|
| **QUEST** | Exclu du classement général, adversaires conservent leurs points |
| **ASL Compétition** | Exclu du classement général |

**Implémentation requise** :
- [ ] Retrait immédiat du classement
- [ ] Historique conservé pour les adversaires
- [ ] Notification visuelle de l'exclusion

### 4.8 Mort Subite

#### Cas 1 : Le Challenger (pendant le match)
- Déclenchée quand les deux combattants atteignent **10 points**
- Continue jusqu'à fin du temps ou touche en **zone C uniquement** (5 pts)
- Les autres zones ne comptent plus mais permettent de garder la priorité

#### Cas 2 : Égalité à la fin du temps
- 30 secondes supplémentaires
- Seule touche en **zone C** ou pénalité met fin au match
- Si toujours égalité : **tirage au sort**

**Implémentation requise** :
- [ ] Détection automatique du passage en mort subite (2x 10 pts)
- [ ] Mode "Mort Subite" avec chrono 30s
- [ ] Restriction saisie aux zones C (5 pts) ou pénalités
- [ ] Bouton "Tirage au sort" si égalité finale

### 4.9 Chronomètre

| Règle | Description |
|-------|-------------|
| Durée | 3 minutes |
| Mode | **Temps réel SANS arrêt** |
| Arrêt autorisé | Uniquement sur décision arbitre (blessure, matériel) |
| Fin du temps | e-Arbitre annonce "Temps!" |

**Implémentation requise** :
- [ ] Chronomètre temps réel (pas d'arrêt aux "Cessez!")
- [ ] Bouton "Pause" pour incidents uniquement
- [ ] Alerte sonore/visuelle à la fin du temps
- [ ] Affichage grande taille pour visibilité piste

### 4.10 Formules de Compétition

#### Formule QUEST

```
┌─────────────────────────────────────────────────────────────┐
│  PRÉ-TOURNOI (optionnel)     │  TOUR 1 - BRAVES            │
│  "Temps des Challengers"      │  Tous font le même nombre   │
│  Poules sans élimination      │  de combats, pas d'élim.    │
├─────────────────────────────────────────────────────────────┤
│  TOUR 2 - TÉMÉRAIRES         │  TOUR 3 - CONQUÉRANTS       │
│  Top 8 du classement Quest   │  Top 4 → Tableau élim.      │
│  Même principe que Tour 1    │  Demi + Petite finale       │
└─────────────────────────────────────────────────────────────┘
```

#### Formule ASL Compétition

```
┌─────────────────────────────────────────────────────────────┐
│  PRÉ-TOURNOI (optionnel)     │  QUALIFICATION              │
│  64 tireurs max              │  Poules de 8 max            │
│  Poules de 10 max            │  64 qualifiés               │
├─────────────────────────────────────────────────────────────┤
│  ÉLIMINATION                 │  PRESTIGE                   │
│  Tableau jusqu'à Top 16      │  Top 16 → Tableau final     │
│  Combats de classement       │  Petite finale pour 3ème    │
└─────────────────────────────────────────────────────────────┘
```

**Implémentation requise** :
- [ ] Sélection formule Quest ou ASL à la création
- [ ] Gestion des tours spécifiques Quest
- [ ] Classement différent selon formule

### 4.11 Récapitulatif des Implémentations Sabre Laser

| Fonctionnalité | Priorité | Statut | Fichier(s) |
|----------------|----------|--------|------------|
| Cibles 1/3/5 pts | ⭐ Haute | ✅ Fait | `touchSystem.ts`, `referee.html` |
| Points Quest automatiques | ⭐ Haute | ✅ Fait | `poolCalculations.ts` |
| Classement Quest complet | ⭐ Haute | ✅ Fait | `poolCalculations.ts` |
| Cartons (Jaune/Rouge/Noir) | ⭐ Haute | ✅ Fait | `cardSystem.ts`, `penalty.types.ts` |
| Escalade cartons FFE | ⭐ Haute | ✅ Fait | `cardSystem.ts` |
| Sortie d'arène (+3 pts) | ⭐ Haute | ✅ Fait | `referee.html` (modal exit) |
| Mort Subite (détection) | ⭐ Haute | ✅ Fait | `suddenDeath.ts` |
| Mort Subite (challenger 10pts) | ⭐ Haute | ✅ Fait | `suddenDeath.ts` |
| Mort Subite (timeout 30s) | ⭐ Haute | ✅ Fait | `suddenDeath.ts` |
| Tirage au sort | ⭐ Haute | ✅ Fait | `suddenDeath.ts` |
| Chrono temps réel 3min | ⭐ Haute | ✅ Fait | `referee.html`, `arena.html` |
| Interface tablette zones | ⭐ Haute | ✅ Fait | `referee.html` (zone-a/b/c) |
| Affichage public live | 🟠 Moyenne | ✅ Fait | `arena.html`, WebSocket |
| Exclusion (carton noir) | 🟠 Moyenne | ✅ Fait | `cardSystem.ts` |
| Mode hors-ligne tablette | 🟠 Moyenne | 🔜 À faire | Service Worker |
| Dashboard classement live | 🟡 Basse | 🔜 À faire | `dashboard.html` |
| Formule ASL Compétition | 🟡 Basse | 🔜 À faire | - |

### 4.12 Fichiers Implémentés (Sprint Sabre Laser)

| Fichier | Description | Lignes |
|---------|-------------|--------|
| `src/shared/types/index.ts` | Types CardGroup, CardReason, MatchMode, TargetZone, Touch | ~350 |
| `src/shared/utils/cardSystem.ts` | Logique cartons FFE avec escalade | ~120 |
| `src/shared/utils/suddenDeath.ts` | Mort subite challenger/timeout | ~100 |
| `src/shared/utils/touchSystem.ts` | Système de touches par zone | ~90 |
| `src/features/penalties/types/penalty.types.ts` | Types Penalty, CardType | ~80 |
| `src/remote/referee.html` | Interface arbitre avec zones A/B/C | ~1000 |

---

## 5. Exigences Techniques

### 5.1 Performance

| Métrique | Exigence | Actuel |
|----------|----------|--------|
| Tireurs par compétition | 200+ | ✅ OK |
| Pistes/Poules simultanées | 10 | ✅ OK |
| Temps de démarrage | < 3s | ✅ ~2s |
| Temps export PDF | < 2s | ✅ ~1s |
| Synchronisation tablette | < 500ms | ⚠️ À tester |

### 5.2 Compatibilité

| Plateforme | Version Minimum | Statut |
|------------|-----------------|--------|
| Windows | 10 (64-bit) | ✅ Supporté |
| macOS | 12 (Monterey), arm64 natif | ✅ Supporté |
| Linux x64 | Ubuntu 20.04+ | ✅ Supporté |
| Linux ARM64 | Raspberry Pi 4+ | ✅ Supporté |

### 5.3 Formats de Fichiers

| Format | Import | Export | Description |
|--------|--------|--------|-------------|
| .fff (FFE) | ✅ | 🔜 | Format Fédération Française |
| .csv | ✅ | ✅ | Universel |
| .xml | ✅ | ✅ | BellePoule legacy |
| .pdf | ❌ | ✅ | Impression/archivage |
| .json | ✅ | ✅ | Sauvegarde/échange |

### 5.4 Mode Hors-Ligne

| Fonctionnalité | Exigence |
|----------------|----------|
| Stockage local | SQLite embarqué |
| Synchronisation | Différée avec résolution conflits |
| Détection réseau | Automatique avec indicateur visuel |
| Queue d'actions | File d'attente des modifications |

---

## 6. Architecture

### 6.1 Stack Technique

```
┌─────────────────────────────────────────────────────────────┐
│                    PRÉSENTATION                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   React 19  │  │  Tailwind   │  │  TypeScript │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│                      LOGIQUE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Electron   │  │  WebSocket  │  │   Express   │          │
│  │     40+     │  │  (Socket.io)│  │   (API)     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│                      DONNÉES                                 │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │   SQLite    │  │  better-sqlite3     │                           │
│  │  (fichier)  │  │  (mémoire)  │                           │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Composants Principaux

| Composant | Fichier | Responsabilité |
|-----------|---------|----------------|
| CompetitionView | CompetitionView.tsx | Orchestration phases |
| PoolView | PoolView.tsx | Gestion d'une poule |
| TableauView | TableauView.tsx | Élimination directe |
| FencerList | FencerList.tsx | Liste des tireurs |
| RemoteScoreManager | RemoteScoreManager.tsx | Saisie distante |

### 6.3 Flux de Données

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Tablette│────▶│ WebSocket│────▶│  Serveur │
│  Arbitre │◀────│  Server  │◀────│  Central │
└──────────┘     └──────────┘     └──────────┘
                                        │
                                        ▼
                                  ┌──────────┐
                                  │  SQLite  │
                                  │   DB     │
                                  └──────────┘
```

---

## 7. Roadmap

### 7.1 Vue d'Ensemble

```
2026
──────────────────────────────────────────────────────────────▶

Q1 2026                    Q2 2026                    Q3 2026
├─────────────────────────┼─────────────────────────┼─────────
│                         │                         │
│  v1.1 - Tablette        │  v1.2 - Stabilité      │  v2.0 - Équipes
│  ┌─────────────────┐    │  ┌─────────────────┐   │  ┌─────────────────┐
│  │ Interface tactile│    │  │ Tests auto 80%  │   │  │ Compét. équipes │
│  │ Documentation    │    │  │ Bugs critiques  │   │  │ Export FFE      │
│  │ Mode hors-ligne  │    │  │ Performance 10p │   │  │ Version web ?   │
│  │ Cartons/Sorties  │    │  │ Mort Subite     │   │  │ Formule ASL     │
│  └─────────────────┘    │  └─────────────────┘   │  └─────────────────┘
│                         │                         │
```

### 7.2 Détail par Version

#### v1.1 - "Tablette First" (Mars 2026)

| Livrable | Description | Owner |
|----------|-------------|-------|
| Interface tactile | Boutons 48px+, zones de touch | Dev |
| Mode arbitre | Plein écran dédié | Dev |
| Cartons | Jaune/Rouge/Noir avec cumul | Dev |
| Sortie d'arène | +3 pts automatique | Dev |
| Hors-ligne | Sync différée | Dev |
| Guide utilisateur | PDF + web | Doc |

#### v1.2 - "Stabilité" (Juin 2026)

| Livrable | Description | Owner |
|----------|-------------|-------|
| Tests unitaires | Couverture 80% | Dev |
| Mort Subite | Détection auto + chrono 30s | Dev |
| Chrono temps réel | Sans arrêt, 3 min | Dev |
| Cibles 1/3/5 pts | Interface saisie rapide | Dev |
| Performance | 10 pistes fluides | Dev |

#### v2.0 - "Équipes" (Septembre 2026)

| Livrable | Description | Owner |
|----------|-------------|-------|
| Compétitions équipes | Matchs par équipe | Dev |
| Formule ASL Compétition | Alternative à Quest | Dev |
| Export FFE officiel | Intégration fédération | Dev |
| Version web (option) | Serveur centralisé | Dev |

---

## 8. Métriques de Succès

### 8.1 KPIs Principaux

| KPI | Cible Q2 2026 | Cible Q4 2026 |
|-----|---------------|---------------|
| Clubs actifs | 5 | 10 |
| Compétitions/mois | 10 | 30 |
| Bugs critiques ouverts | < 3 | 0 |
| Note satisfaction | 4/5 | 4.5/5 |
| Temps moyen saisie score | < 5s | < 3s |

### 8.2 Métriques Techniques

| Métrique | Cible |
|----------|-------|
| Uptime (mode réseau) | 99.5% |
| Crash rate | < 0.1% |
| Temps de sync tablette | < 500ms |
| Couverture tests | > 80% |

---

## 9. Risques & Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Bugs critiques en compétition | Moyen | Élevé | Mode dégradé, tests intensifs |
| Adoption lente | Moyen | Moyen | Documentation, formations clubs |
| Concurrence (Engarde) | Faible | Moyen | Différenciation open source + Quest |
| Perte du mainteneur | Faible | Élevé | Documentation code, contributeurs |
| Changements règles FFE | Faible | Moyen | Architecture modulaire |
| Non-conformité règlement | Moyen | Élevé | Validation par arbitres FFE |

---

## 10. Annexes

### 10.1 Glossaire

| Terme | Définition |
|-------|------------|
| **Poule** | Phase de qualification en round-robin |
| **Tableau** | Phase d'élimination directe |
| **Quest** | Système de points pour Sabre Laser (1-4 pts) |
| **FFE** | Fédération Française d'Escrime |
| **FIE** | Fédération Internationale d'Escrime |
| **Serpentine** | Méthode de répartition équilibrée |
| **Bye** | Exemption quand nombre impair |
| **TD/TR** | Touches Données / Touches Reçues |
| **V/M** | Ratio Victoires / Matchs |
| **Cible A** | Mains, poignets (1 pt) |
| **Cible B** | Bras, jambes (3 pts) |
| **Cible C** | Tête, tronc (5 pts) |
| **Mort Subite** | Mode de départage, seule zone C compte |
| **Carton Jaune** | Avertissement |
| **Carton Rouge** | +1 pt adversaire |
| **Carton Noir** | Exclusion immédiate |

### 10.2 Références

- [GitHub Repository](https://github.com/klinnex/bellepoule-modern)
- [BellePoule Original](http://betton.escrime.free.fr/index.php/bellepoule)
- [Règlement FFE Sabre Laser](https://www.ffescrime.fr/wp-content/uploads/2024/09/Livret2_CombatSportif_v.Sept25-FR.pdf)
- [Règlement FFE](https://www.escrime-ffe.fr/)
- [Règlement FIE](https://fie.org/)

### 10.3 Historique des Versions

| Version PRD | Date | Auteur | Changements |
|-------------|------|--------|-------------|
| 1.0 | 19/02/2026 | Y. Kervella | Version initiale |
| 1.1 | 19/02/2026 | Y. Kervella | Ajout contraintes Sabre Laser FFE |

---

## ✅ Validation

| Rôle | Nom | Date | Signature |
|------|-----|------|-----------|
| Product Owner | Yann Deboeuf | ___ | ___ |
| Tech Lead | ___ | ___ | ___ |
| Arbitre FFE | ___ | ___ | ___ |
| Représentant Clubs | ___ | ___ | ___ |

---

*Document généré le 19 février 2026*  
*BellePoule Modern - Open Source sous licence GPL-3.0*

