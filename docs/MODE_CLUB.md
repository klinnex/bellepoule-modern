# Mode Club

> Issue #1872. Vie du club hors compétition : membres pré-enregistrés, séances libres,
> combats enchaînés sur les pistes, statistiques par tireur sur séance / mois / trimestre /
> saison. Plusieurs clubs possibles. Données dans `bellepoule.db` (migrations 25 à 34),
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
| **Inventaire** | Matériel du club (masques, armes, vestes…), achats, garanties, états, prêts aux tireurs. |

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

## 7. Inventaire

Matériel possédé par le club, suivi par **fiche** (un modèle, `quantity` exemplaires) et par
**prêts** à un tireur du club.

- **Catégories** : les standard (arme, lame, masque, veste, plastron, gant, culotte, câble,
  électrique, sac, autre) plus celles créées par le club (bouton **Catégories** : ajout, renommage,
  suppression). Une catégorie du club apparaît dans les menus de la fiche et du filtre, et est
  propre au club ; elle ne peut pas être supprimée tant qu'une fiche l'utilise.
- **Fiche** : nom, catégorie, arme, marque, modèle, numéro de série, taille, couleur, quantité,
  **date d'achat**, **prix unitaire** (€), fournisseur, référence de facture, **fin de garantie**,
  **état** (neuf, bon, usé, abîmé, hors service), **emplacement** de rangement, notes.
  Contrôles : nom requis, dates AAAA-MM-JJ, garantie non antérieure à l'achat, prix 0 à 10 M€,
  quantité 1 à 999.
- **Marques** : catalogue propre au club (bouton **Marques** : ajout, renommage, suppression).
  Le champ Marque de la fiche propose ces marques (saisie libre toujours possible). Renommer une
  marque met à jour les fiches ; suppression refusée tant qu'une fiche la porte.
- **Verrou** (bouton **Verrouiller** / **Déverrouiller**) : inventaire en consultation seule. Tant
  qu'il est verrouillé, aucune fiche, prêt, retour, import, catégorie ou marque ne peut être modifié
  (refusé côté base aussi). Consultation et export restent possibles. Le verrou est propre au club.
- **Réformer** retire la fiche des prêts sans l'effacer (historique conservé) ; **Remettre en
  service** l'inverse. Affichage des réformés : case à cocher.
- **Prêter** : choix du tireur (membres actifs du club uniquement), quantité (dans la limite des
  disponibles), retour prévu facultatif (date future), état au départ, remarque. La modale affiche
  ce que le tireur détient déjà.
- **Enregistrer le retour** : date de retour (maintenant par défaut), **état au retour**, qui
  devient l'état de la fiche, remarque. Un retour ne peut pas précéder le prêt.
- **Prêts en retard** : prêt en cours dont la date de retour prévue est dépassée (badge, compteur).
- **Alertes garantie** : garanties qui expirent dans les 90 jours.
- **Synthèse** : exemplaires, exemplaires prêtés, valeur d'achat (prix × quantité, hors réformés),
  prêts en retard, alertes garantie.
- **Refus** : suppression d'une fiche tant qu'un exemplaire est prêté ; quantité réduite sous le
  nombre prêté ; prêt d'un matériel réformé, d'un tireur archivé ou d'un autre club.
- **Historique** : prêts rendus (repliable). Un prêt rendu peut être supprimé (correction de saisie).
- **Export CSV ou Excel** : lignes visibles (filtres appliqués). CSV à séparateur `;` (tableur
  français) ; Excel `.xlsx` une feuille.
- **Import CSV ou Excel** : colonne « Nom » obligatoire, autres colonnes reconnues par leur intitulé
  (sans accents ni casse, ordre libre). Catégorie, arme, état : libellés français ou codes internes.
  Dates AAAA-MM-JJ, jj/mm/aaaa ou date Excel. Prix « 12,5 » ou « 12.5 ». « Réformé » : oui / non.
  Un aperçu indique le nombre de fiches et les lignes en erreur (ignorées) avant l'import ; une fiche
  dont le n° de série existe déjà dans le club est ignorée. 2 000 lignes maximum. Les colonnes
  « Exemplaires prêtés » sont informatives (les prêts ne s'importent pas).
  En-têtes d'échange en français, quelle que soit la langue de l'interface.
- **Effacement RGPD d'un tireur** : son identité est retirée de ses prêts ; un matériel encore
  prêté reste compté (« Tireur effacé »). **Effacement d'un club** : matériel et prêts supprimés.

Dépôt : `src/database/repos/clubInventoryRepo.ts` (tables `club_items`, `club_loans`, migration 34).
Catégories : table `club_item_categories` (migration 35), clé d'affectation `custom:<id>`.
Marques : table `club_item_brands` ; verrou : colonne `clubs.inventory_locked` (migration 36).
Règles pures (validation, retards, garanties, synthèse, CSV) : `src/shared/utils/clubInventory.ts`.
Interface : `src/renderer/components/club/ClubInventoryPanel.tsx`, `ClubItemEditor.tsx`,
`ClubLoanModal.tsx`. API IPC : `club.listItems`, `createItem`, `updateItem`, `deleteItem`,
`listLoans`, `lendItem`, `returnLoan`, `deleteLoan`.

## 8. Code

| Élément | Fichier |
|---|---|
| Types, API IPC `club.*` | `src/shared/types/club.ts`, `src/main/preload.ts` |
| Dépôt SQLite | `src/database/repos/clubRepo.ts` (tables `clubs`, `club_members`, `club_sessions`, `club_attendance`, `club_bouts`, `club_exercises`) |
| Handlers IPC | `src/main/ipc/clubHandlers.ts` |
| Saisie distante | `src/main/remote/clubArena.ts`, `src/main/remote/routes/clubRoutes.ts`, `src/remote/js/refereeClubCards.js` |
| Utilitaires | `src/shared/utils/club*.ts` (âge, QR, import, plan, partage, stats, scan) |
| PDF | `src/shared/utils/pdfExport/clubCardsPdf.ts`, `clubPlanPdf.ts` |
| Inventaire | `src/database/repos/clubInventoryRepo.ts`, `src/shared/utils/clubInventory.ts`, `src/renderer/components/club/ClubInventoryPanel.tsx` (tables `club_items`, `club_loans`) |
| Interface | `src/renderer/components/club/` |
