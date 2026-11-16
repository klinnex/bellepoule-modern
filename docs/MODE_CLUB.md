# Mode Club

> Issue #1872. Vie du club hors compétition : membres pré-enregistrés, séances libres,
> combats enchaînés sur les pistes, statistiques par tireur sur séance / mois / trimestre /
> saison. Plusieurs clubs possibles. Données dans `bellepoule.db` (migrations 25 à 32),
> conservées d'une saison à l'autre.

Accès : bouton **Club** de l'en-tête (logo du club s'il est défini) ou section **Clubs** de
l'accueil. Un parcours guidé accompagne la première ouverture.

## 1. Onglets

| Onglet | Contenu |
|---|---|
| **Membres** | Identité du club (nom, logo, arme par défaut, nombre de pistes), annuaire, cartes de membre, QR des pistes. |
| **Séances** | Ouverture du jour, séances préparées (plan de cours, récurrence), séance en cours (pistes, pointage, saisie distante, notes, bilan). |
| **Statistiques** | Classement du club et fiche membre par période et par catégories d'âge. |
| **Exercices** | Bibliothèque d'exercices partagée entre clubs, exportable / importable. |

## 2. Membres

- Champs : nom, prénom, licence, sexe, **date de naissance** (ou année seule si importée
  ainsi), latéralité, armes, photo, notes, actif / archivé.
- **Catégorie d'âge** calculée pour la saison en cours (`src/shared/utils/clubAge.ts`) :
  M9 → M20 d'après l'âge atteint l'année de fin de saison (règle FFE), Seniors, vétérans
  V1 → V4 d'après l'âge atteint l'année de début de saison. Sans date : catégorie saisie.
- Liste filtrable par catégorie, triable par nom ou par catégorie.
- Import FFE `.fff` / XML / CSV : choix des personnes, dédoublonnage par licence puis nom,
  membres existants complétés (licence, sexe, date de naissance) sans écrasement.
  Photos par licence depuis un ZIP.
- Archivage (stats conservées) ou effacement définitif (RGPD : présences et combats compris).

### Cartes de membre et QR des pistes

- Carte : logo, nom, prénom, saison, QR `BPC1:M:<code>` et code en clair (10 hexadécimaux).
  Code régénérable (carte perdue : l'ancienne devient invalide).
- **Imprimer les cartes** ouvre la boîte de dialogue d'impression ; l'icône voisine enregistre
  un PDF. Seuls les membres affichés (recherche, filtre) et actifs sont imprimés.
- QR des pistes `BPC1:A:<n>` (2 par A4) : impression ou PDF.

## 3. Séances

| Statut | Sens |
|---|---|
| `planned` | Préparée à l'avance, démarrée plus tard (**Démarrer**). |
| `open` | En cours ; une seule par club. |
| `closed` | Terminée ; combats non terminés annulés. Réouverture possible. |

- Ouverture : date (mini-calendrier), intitulé, arme (règles de la saisie distante),
  **catégories d'âge du cours** (de … à …, bornes incluses).
- Préparation : objectifs, plan de cours (exercices avec durée, famille, consignes, 3 images),
  notes ; export PDF, impression, partage du plan (fichier JSON sans date ni présents).
- **Récurrence** (nouvelle séance préparée) : tous les N jours (7 = chaque semaine), N fois ou
  jusqu'à une date, 60 séances au plus. Chaque séance de la série a sa propre copie du plan,
  modifiable d'une semaine à l'autre ; l'éditeur montre les plans des autres séances de la
  série (suivi de l'évolution des exercices).
- Listes des séances préparées et passées filtrables par catégorie d'âge.
- Bilan à la fermeture : note sur 5, ce qui a marché, à améliorer, remarque par tireur présent.

### Pointage

Bouton **Pointage (n)** de la séance en cours : fenêtre listant les membres des catégories du
cours (plage début → fin modifiable, retenue pour la séance), recherche, cases à cocher,
**Tout cocher**. Les membres déjà pointés restent visibles hors de la plage.

## 4. Pistes et combats

- Appariement manuel sur chaque piste libre parmi les présents, ou **Scanner** : webcam du
  poste, QR de la piste puis cartes des deux tireurs (pointés présents au passage).
- Score saisi par le maître d'armes, ou sur une tablette arbitre (saisie distante).
- Combat enregistré (`club_bouts`) : séance, piste, tireurs, scores, vainqueur, durée,
  mode de saisie (`master`, `referee`, `self`), horodatage.

### Saisie distante en séance

- **Activer la saisie distante** démarre le serveur du mode entraînement (HTTPS) sur
  l'**interface réseau** choisie (mémorisée, partagée avec le mode entraînement), une arène
  par piste, aux règles de l'arme de la séance.
- **Lobby des pistes** (`/entrainement-lobby`) : lien et QR à scanner par les tablettes, qui
  choisissent une piste libre (même lobby que le mode entraînement).
- Les combats lancés depuis le poste sont envoyés à la tablette de leur piste ; le score
  validé revient dans la séance (rafraîchie toutes les 5 s).
- **Cartes sur la tablette** (`src/remote/js/refereeClubCards.js`) : à l'arrivée sur la piste,
  la tablette demande la carte du tireur A puis celle du tireur B (caméra arrière :
  `BarcodeDetector`, sinon `jsQR` servi en `/js/jsQR.js` ; ou code en clair saisi).
  Chaque carte peut être **passée** :
  - deux cartes reconnues : membres pointés, combat enregistré dans la séance et chargé sur
    la piste (un combat prévu non commencé sur cette piste est annulé) ;
  - une ou aucune carte : combat libre avec les noms connus, **non comptabilisé** ;
  - **Arbitrer sans cartes** : la piste garde son combat libre.
  Bouton **Cartes** de la vue arbitre : nouvelle identification.
- API : `GET /api/club/identify` (scan proposé ? nom du club), `POST /api/club/identify`
  `{ arena, codeA, codeB }` (codes `null` = passés ; limite de débit de la saisie des scores).
  Erreurs : `no_session`, `no_arena`, `busy`, `unknown_card` (+ `side`), `same_member`.
  La séance est reliée par `club.linkRemote(sessionId)` ; fermer la séance la délie.

## 5. Statistiques

- Portée : saison sportive (1er septembre → 31 août), trimestre, mois, séance, tout ;
  plage de **catégories d'âge** (classement limité aux membres de ces catégories, séances
  proposées limitées aux cours de ces catégories).
- Par tireur : combats, V / D / nuls, % de victoires, TD / TR / indice, séances,
  progression (jour, mois, trimestre, saison), face-à-face, remarques reçues.

## 6. Bibliothèque d'exercices

Titre, famille (échauffement, technique, tactique, assauts, physique, retour au calme, autre),
durée, consignes, images, **catégories d'âge visées** (aucune = commun à tous). Filtre par
famille et par catégorie (une catégorie montre aussi les exercices communs). Dans le plan d'une
séance, **Depuis la bibliothèque** propose les exercices des catégories du cours et les
exercices communs. Export / import JSON (doublons titre + famille ignorés).

## 7. Code

| Élément | Fichier |
|---|---|
| Types, API IPC `club.*` | `src/shared/types/club.ts`, `src/main/preload.ts` |
| Dépôt SQLite | `src/database/repos/clubRepo.ts` (tables `clubs`, `club_members`, `club_sessions`, `club_attendance`, `club_bouts`, `club_exercises`) |
| Handlers IPC | `src/main/ipc/clubHandlers.ts` |
| Saisie distante | `src/main/remote/clubArena.ts`, `src/main/remote/routes/clubRoutes.ts`, `src/remote/js/refereeClubCards.js` |
| Utilitaires | `src/shared/utils/club*.ts` (âge, QR, import, plan, partage, stats, scan) |
| PDF | `src/shared/utils/pdfExport/clubCardsPdf.ts`, `clubPlanPdf.ts` |
| Interface | `src/renderer/components/club/` |
