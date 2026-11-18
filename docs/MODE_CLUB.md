# Mode Club

> Issue #1872. Vie du club hors compétition : membres pré-enregistrés, séances libres,
> combats enchaînés sur les pistes, statistiques par tireur sur séance / mois / trimestre /
> saison. Plusieurs clubs possibles. Données dans `bellepoule.db` (migrations 25 à 34),
> conservées d'une saison à l'autre.

Accès : bouton **Club** de l'en-tête (logo du club s'il est défini) ou section **Clubs** de
l'accueil. Un parcours guidé accompagne la première ouverture.

## 1. Onglets

| Onglet              | Contenu                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Identité**        | Nom, logo, arme par défaut, nombre de pistes, QR des pistes (aussi : crayon de l'en-tête).                                           |
| **Membres**         | Annuaire, cartes de membre.                                                                                                          |
| **Maîtres d'armes** | Encadrement du club : fonction / diplôme, contact, armes enseignées, notes, archivage.                                               |
| **Séances**         | Ouverture du jour, séances préparées (plan de cours, récurrence), séance en cours (pistes, pointage, saisie distante, notes, bilan). |
| **Statistiques**    | Classement du club et fiche membre par période et par catégories d'âge.                                                              |
| **Exercices**       | Bibliothèque d'exercices partagée entre clubs, exportable / importable.                                                              |
| **Inventaire**      | Matériel du club (masques, armes, vestes…), achats, garanties, états, prêts aux tireurs.                                             |

## 2. Membres

- Champs : nom, prénom, licence, sexe, **date de naissance** (ou année seule si importée
  ainsi), latéralité, armes, photo, notes, actif / archivé.
- **Catégorie d'âge** calculée pour la saison en cours (`src/shared/utils/clubAge.ts`) :
  M9 → M20 d'après l'âge atteint l'année de fin de saison (règle FFE), Seniors, vétérans
  V1 → V4 d'après l'âge atteint l'année de début de saison. Sans date : catégorie saisie.
- Liste filtrable par catégorie, triable par nom ou par catégorie.
- Menu **Importer** : fichier FFE `.fff` / XML / TXT, **CSV ou Excel `.xlsx`** (choix des
  personnes, dédoublonnage par licence puis nom, membres existants complétés — licence, sexe,
  date de naissance — sans écrasement), ou photos par licence depuis un ZIP.
- Menu **Exporter** : `.fff` (réimportable), **CSV** (séparateur `;`) ou **Excel**, lignes visibles
  (filtres appliqués). Colonnes d'échange en français : Nom, Prénom, Licence, Sexe, Date de
  naissance, Année de naissance, Armes, Latéralité, Catégorie, Actif, Notes. Un CSV / Excel
  contenant une colonne « Nom » est lu avec ces intitulés ; sinon il est traité comme un fichier FFE.
  Code : `src/shared/utils/clubMembersIO.ts`.
- Archivage (stats conservées) ou effacement définitif (RGPD : présences et combats compris).

### Cartes de membre et QR des pistes

- Carte : logo, nom, prénom, saison, QR `BPC1:M:<code>` et code en clair (10 hexadécimaux).
  Code régénérable (carte perdue : l'ancienne devient invalide).
- **Imprimer les cartes** ouvre la boîte de dialogue d'impression ; l'icône voisine enregistre
  un PDF. Seuls les membres affichés (recherche, filtre) et actifs sont imprimés.
- QR des pistes `BPC1:A:<n>` (2 par A4) : impression ou PDF.

### Maîtres d'armes

- **Ajouter** (à droite du titre) ouvre la fiche vierge ; même fiche pour modifier.
- Fiche : nom, prénom, fonction / diplôme (Maître d'armes, Prévôt, Éducateur…), téléphone,
  e-mail, armes enseignées (vide = toutes), notes, actif / archivé.
- Distincts des membres : pas de carte, pas de pointage, pas de combats ni de statistiques.
- Archivé : plus proposé sur les nouvelles séances, reste affiché sur les séances passées.
- Suppression définitive : retiré de l'encadrement de toutes les séances.

## 3. Séances

| Statut    | Sens                                                           |
| --------- | -------------------------------------------------------------- |
| `planned` | Préparée à l'avance, démarrée plus tard (**Démarrer**).        |
| `open`    | En cours ; plusieurs possibles, fermée sur décision explicite. |
| `closed`  | Terminée ; combats non terminés annulés. Réouverture possible. |

- Ouverture : date (mini-calendrier), intitulé, arme (règles de la saisie distante),
  **catégories d'âge du cours** (de … à …, bornes incluses), **maîtres d'armes** de la séance
  (cartes activables, plusieurs possibles ; modifiables ensuite dans l'éditeur de séance, copiés
  sur chaque séance d'une série). Affichés avec l'intitulé (« Encadrement : … »).
- Préparation : objectifs, plan de cours (exercices avec durée, famille, consignes, 3 images),
  notes ; export PDF, impression, partage du plan (fichier JSON sans date ni présents).
- **Récurrence** (nouvelle séance préparée) : tous les N jours (7 = chaque semaine), N fois ou
  jusqu'à une date, 60 séances au plus. Chaque séance de la série a sa propre copie du plan,
  modifiable d'une semaine à l'autre ; l'éditeur montre les plans des autres séances de la
  série (suivi de l'évolution des exercices).
- **Séances sur jours d'ouverture** (bouton de la liste des séances préparées, « Générer des
  séances ») : sélectionner les jours (lun → dim), une ou plusieurs périodes du / au (**Ajouter une
  période** ; 366 jours au plus par période, 10 périodes au plus, 1 000 séances au plus par
  action), intitulé, catégories d'âge et encadrement. Crée une série de séances **préparées**,
  une par date ; une même date n'est créée qu'une fois ; les dates déjà occupées par une séance
  du club sont ignorées (le résultat l'indique). Pas de jours mémorisés : ils se choisissent à
  chaque génération.
- **Fermeture** (même fenêtre, « Supprimer les séances prévues ») : supprime les séances
  **prévues** sur une ou plusieurs périodes (ex. Toussaint et Noël en une seule action), après
  confirmation. Les séances ouvertes ou closes ne sont jamais supprimées.
  API : `club.generateSessions`, `club.deletePlannedInPeriods` (`club:generateSessions`,
  `club:deletePlannedInPeriods`). Code : `ClubRepo.generateSessions` / `deletePlannedInPeriods`,
  `weekdayDates` (`clubAge.ts`), `ClubScheduleModal.tsx`.
- Listes des séances préparées et passées filtrables par catégorie d'âge.
- **Plusieurs séances ouvertes** : ouvrir, démarrer ou rouvrir une séance ne ferme pas les
  autres. Une séance reste ouverte jusqu'à **Fermer la séance**. L'onglet Séances affiche
  une séance ouverte à la fois (la plus récente par défaut) ; **Changer de séance** bascule
  vers une autre (ouverte, prévue ou passée) sans rien fermer ; **Toutes les séances**
  revient à la liste (séances ouvertes, ouverture, prévues, passées). La saisie distante
  suit la séance affichée (`clubSessionSwitch.ts`).
- **Menu des séances** (en-tête du club, visible depuis tous les onglets) : séances
  ouvertes (**Afficher**, **Fermer la séance**), séances prévues par date (**Ouvrir**) et 5
  dernières séances passées (**Rouvrir**). **Préparer une séance** renvoie à l'onglet
  Séances (`ClubSessionMenu.tsx`).
- Bilan à la fermeture : note sur 5, ce qui a marché, à améliorer, remarque par tireur présent.

### Pointage

Bouton **Pointage (n)** de la séance en cours : fenêtre listant les membres des catégories du
cours (plage début → fin modifiable, retenue pour la séance), recherche, cartes activables,
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
- **Cartes sur la tablette** (`src/remote/js/refereeClubCards.js`) : combat déjà sur la
  piste (scanné ou lancé depuis le poste, `arenaHasMatch`) → vue arbitre directe ; sinon la
  tablette demande la carte du tireur A puis celle du tireur B. Bouton **Cartes** (en-tête,
  et vue du combat à côté de Retour / Lobby) : nouvelle identification (caméra arrière si
  contexte sécurisé : `BarcodeDetector`, sinon `jsQR` servi en `/js/jsQR.js` ; ou code en
  clair saisi). Chaque carte peut être **passée** :
  - deux cartes reconnues : membres pointés, combat enregistré dans la séance et chargé sur
    la piste (un combat prévu non commencé sur cette piste est annulé) ;
  - une ou aucune carte : combat libre avec les noms connus, **non comptabilisé** ;
  - **Arbitrer sans cartes** : la piste garde son combat libre.
- API : `GET /api/club/identify?arena=N` (scan proposé ? nom du club, `hasMatch`), `POST /api/club/identify`
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

### Exemples d'exercices détaillés

Chaque exemple suit les champs de la fiche : titre, famille, durée, catégories d'âge, armes,
consignes. Les consignes se recopient telles quelles dans le champ « consignes ».

#### Exemple 1 : Déplacements et rythme (échauffement)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Échauffement                                 |
| Durée      | 10 min                                       |
| Âges       | Aucune (commun à tous)                       |
| Armes      | Toutes                                       |

Consignes :

1. (2 min) Garde en position, pieds en équerre, genoux fléchis. Pas avant puis pas arrière
   sur la longueur de la salle, 5 allers-retours, dos droit, sans sauter.
2. (4 min) Enchaînement **pas avant, fente, retour en garde**. 3 séries de 10 répétitions,
   lentes puis plus rapides. La fente part du pied arrière, le retour se fait sur la jambe avant.
3. (4 min) Jeu du signal : le maître d'armes crie « avant », « arrière » ou « fente ». L'élève
   réagit sans regarder ses pieds. Le premier qui se trompe sort du jeu pour un tour.

Points de vigilance : regard à hauteur de la cible, pas de pas croisés, épaules détendues.
Variante jeunes (U9 / U11) : remplacer le signal par un jeu « chat et souris » sur un
couloir de 10 m.

#### Exemple 2 : Attaque simple et retour en garde (technique, fleuret)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Technique                                    |
| Durée      | 15 min                                       |
| Âges       | U13, U15, U17                                |
| Armes      | Fleuret (F)                                  |

Consignes :

1. (2 min) Démonstration par le maître d'armes : extension du bras d'abord, fente ensuite,
   pointe à hauteur de plastron. Retour en garde immédiat.
2. (3 min) Par binômes, sans cible : attaque à vide, en gardant le bras tendu.
3. (5 min) Attaque sur plastron fixe. 3 séries de 8 attaques, rôles inversés à chaque série.
4. (5 min) Attaque sur signal : le partenaire lève la main, l'élève attaque dès qu'il la voit.

Critère de réussite : au moins 6 touches sur 8 sur le plastron, retour en garde après chaque
attaque, sans reculer le pied avant.
Erreurs fréquentes : fente avant extension du bras, retour sans reprendre la garde, regard
baissé sur la pointe.

#### Exemple 3 : Parade et riposte (technique, épée)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Technique                                    |
| Durée      | 15 min                                       |
| Âges       | U15, U17, SENIOR                             |
| Armes      | Épée (E)                                     |

Consignes :

1. (3 min) Parade de quarte seule, à vide : la lame reste au-dessus de la main, le poignet
   ne se plie pas.
2. (6 min) Binôme en attaque lente : l'attaquant joue une attaque simple, le défenseur
   pare puis riposte directement (riposte sur la même ligne). 2 séries de 10.
3. (6 min) Même exercice à vitesse normale, puis avec un changement de ligne par
   l'attaquant (haute ou basse) que le défenseur doit suivre avant de riposter.

Critère de réussite : parade propre sur 8 attaques sur 10, sans toucher le bras de l'attaquant
avec la coquille.

#### Exemple 4 : Lecture de la distance (tactique)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Tactique                                     |
| Durée      | 15 min                                       |
| Âges       | U17, SENIOR, V1, V2                          |
| Armes      | Épée (E), fleuret (F), sabre (S)             |

Consignes :

1. (2 min) Rappel : à la distance de fente, la touche part au premier mouvement de l'adversaire.
   Un tireur qui avance sans attaquer donne de la distance à son adversaire.
2. (10 min) Binôme en distance libre, à 4 m environ. Chacun n'attaque que lorsque l'autre
   s'approche. Sur 3 minutes, compter les touches, puis inverser les rôles.
3. (3 min) Bilan oral : quelle distance a été décisive, à quel moment la touche a été donnée
   (avant, pendant ou après un déplacement de l'adversaire).

Remarque : l'exercice est plus utile après une séance de technique. Ne pas le proposer
en début de séance.

#### Exemple 5 : Assaut à thème, 3 touches (assauts)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Assauts                                      |
| Durée      | 20 min                                       |
| Âges       | U11 et plus                                  |
| Armes      | Toutes                                       |

Consignes :

1. (2 min) Règle du jeu : premier à 3 touches, deux minutes maximum par assaut, arbitrage
   du maître d'armes.
2. (12 min) Assauts par binômes, en tournant à chaque nouveau partenaire. Thème annoncé
   avant chaque tour (ex. : « attaques au fer seulement », « défense par parade »).
3. (6 min) Chaque tireur donne à son partenaire un point fort et un point à améliorer, puis
   le maître d'armes ajoute une remarque par tireur.

Adaptation : les tireurs qui débutent jouent un assaut à 2 touches, sans thème imposé.

#### Exemple 6 : Frappes par zones (technique, sabre laser)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Technique                                    |
| Durée      | 12 min                                       |
| Âges       | U13, U15, U17, SENIOR                        |
| Armes      | Sabre laser (L)                              |

Consignes :

1. (2 min) Rappel des zones : A = 1 point, B = 3 points, C = 5 points. Le tireur vise la zone
   annoncée, pas la zone la plus facile.
2. (8 min) Sur tablette ou cible au mur, le maître d'armes annonce une zone à chaque signal.
   Le tireur frappe la zone demandée et reprend sa garde. Une série de 10 frappes, puis
   bilan : nombre de frappes justes, points cumulés.
3. (2 min) Même exercice en se déplaçant d'un pas entre deux frappes.

Critère de réussite : 8 frappes justes sur 10 dans la zone demandée.

#### Exemple 7 : Circuit jambes et gainage (physique)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Physique                                     |
| Durée      | 15 min                                       |
| Âges       | U13 et plus                                  |
| Armes      | Toutes                                       |

Consignes :

1. (2 min) Échauffement articulaire : chevilles, genoux, hanches, épaules, 10 mouvements
   chacun.
2. (10 min) Circuit de 4 postes, 40 secondes par poste, 20 secondes de repos entre deux
   postes, 2 tours :
   - fentes alternées sans appui ;
   - sauts latéraux au-dessus d'une ligne ;
   - gainage planche (position sur les avant-bras) ;
   - pas chassé d'un bout à l'autre de la salle.
3. (3 min) Retour au calme, puis hydratation.

Adaptation : réduire la durée des postes pour les U13 ; pour les V2 et plus, remplacer les
sauts par de la marche rapide.

#### Exemple 8 : Étirements (retour au calme)

| Champ      | Valeur                                       |
| ---------- | -------------------------------------------- |
| Famille    | Retour au calme                              |
| Durée      | 5 min                                        |
| Âges       | Aucune (commun à tous)                       |
| Armes      | Toutes                                       |

Consignes :

1. Quadriceps : debout, talon contre la fesse, 20 secondes par jambe.
2. Ischio-jambiers : jambe tendue, buste penché vers l'avant, 20 secondes par jambe.
3. Mollets : jambe arrière tendue, talon au sol, 20 secondes par jambe.
4. Épaule : bras tendu en travers du corps, tiré vers l'autre épaule, 20 secondes par bras.
5. Poignet et avant-bras : bras tendu, paume vers le haut puis vers le bas, 15 secondes chacun.

Respirer calmement pendant chaque posture, ne pas bouger en rebond.

#### Exemple d'import JSON

Le fichier d'import est un tableau de fiches. Seul le champ `title` est obligatoire ; les
autres sont facultatifs. `minutes` est un nombre entier, `ageCategories` et `weapons` sont des
listes de codes (`U9` … `V4`, `SENIOR` ; `F`, `E`, `S`, `L`, `A`).

```json
[
  {
    "title": "Attaque simple et retour en garde",
    "category": "technique",
    "minutes": 15,
    "details": "Démonstration, attaque à vide, plastron fixe, attaque sur signal.",
    "images": [],
    "ageCategories": ["U13", "U15", "U17"],
    "weapons": ["F"]
  },
  {
    "title": "Déplacements et rythme",
    "category": "warmup",
    "minutes": 10,
    "details": "Pas avant / arrière, fente, retour en garde, jeu du signal.",
    "images": [],
    "ageCategories": [],
    "weapons": []
  }
]
```

Familles acceptées pour `category` : `warmup`, `technique`, `tactics`, `bouts`, `physical`,
`cooldown`, `other`. Un titre et une famille déjà présents sont ignorés à l'import.

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
- **Ajout en série** (nouvelle fiche, carte _Ajouter en série_) : N fiches d'un exemplaire chacune
  (1 à 200), nommées `Nom-01`, `Nom-02`… Numérotation reprise après le plus grand suffixe déjà
  présent (`Plastron-07` existe → `Plastron-08`), aucun doublon de nom (casse ignorée), deux
  chiffres minimum. Le numéro de série n'est pas recopié. Une seule transaction.
- **Colonnes** (bouton **Colonnes**) : afficher ou masquer chaque colonne du tableau du matériel
  (catégorie, arme, marque, modèle, n° de série, taille, couleur, quantité, état, emplacement,
  achat, fournisseur, facture, garantie, notes). Le nom reste affiché. Choix mémorisé sur le poste.
- **Marques** : catalogue propre au club (bouton **Marques** : ajout, renommage, suppression).
  Le champ Marque de la fiche propose ces marques (saisie libre toujours possible). Renommer une
  marque met à jour les fiches ; suppression refusée tant qu'une fiche la porte.
- **Verrou** (bouton **Verrouiller** / **Déverrouiller**) : inventaire en consultation seule. Tant
  qu'il est verrouillé, aucune fiche, prêt, retour, import, catégorie ou marque ne peut être modifié
  (refusé côté base aussi). Consultation et export restent possibles. Le verrou est propre au club.
- **Réformer** retire la fiche des prêts sans l'effacer (historique conservé) ; **Remettre en
  service** l'inverse. Affichage des réformés : carte activable.
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

## 8. Sauvegarde et changement d'ordinateur

- **Sauvegarder le club** (en-tête du club) : fichier `.bpclub` (ZIP) avec tout le club —
  fiche, membres (photos comprises), maîtres d'armes, séances (encadrement compris), présences, combats, inventaire, prêts, catégories,
  marques — et la bibliothèque d'exercices du poste.
- **Charger une sauvegarde** (écran de choix du club) : recrée le club à l'identique sur l'autre
  poste. Club déjà présent (même club, déjà chargé) : confirmation, puis ses données sont
  **remplacées** par celles du fichier. Exercices : ajoutés s'ils manquent, jamais écrasés.
  Salle d'une séance inconnue sur ce poste : retirée de la séance. Tout ou rien (transaction).
- Fichier refusé s'il n'est pas une sauvegarde de club ou s'il vient d'une version plus récente.
- Données personnelles : le fichier n'est pas chiffré, le conserver en lieu sûr (docs/RGPD.md).
- **Synchronisation vers un dossier** (bouton **Synchronisation** de l'en-tête) : le club est
  écrit dans `<dossier>/<club>-<id>.bpclub`, dossier choisi sur le poste (Google Drive, Dropbox…,
  via leur client de bureau). Reprise automatique toutes les 30 s dans les deux sens : un
  changement d'un seul côté l'emporte ; si le fichier **et** le poste ont changé depuis la dernière
  synchro, rien n'est écrasé et deux choix sont proposés (garder le fichier / garder ce poste).
  Plusieurs postes peuvent pointer le même dossier. Dossier absent (disque ou Drive non monté) :
  erreur signalée, rien n'est recréé. Réglages par poste : `<userData>/club-sync.json`.
  Fichier non chiffré (voir ci-dessus).

## 9. Code

| Élément                 | Fichier                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, API IPC `club.*` | `src/shared/types/club.ts`, `src/main/preload.ts`                                                                                                                             |
| Dépôt SQLite            | `src/database/repos/clubRepo.ts` (tables `clubs`, `club_members`, `club_coaches`, `club_sessions`, `club_session_coaches`, `club_attendance`, `club_bouts`, `club_exercises`) |
| Handlers IPC            | `src/main/ipc/clubHandlers.ts`                                                                                                                                                |
| Saisie distante         | `src/main/remote/clubArena.ts`, `src/main/remote/routes/clubRoutes.ts`, `src/remote/js/refereeClubCards.js`                                                                   |
| Utilitaires             | `src/shared/utils/club*.ts` (âge, QR, import, plan, partage, stats, scan)                                                                                                     |
| PDF                     | `src/shared/utils/pdfExport/clubCardsPdf.ts`, `clubPlanPdf.ts`                                                                                                                |
| Inventaire              | `src/database/repos/clubInventoryRepo.ts`, `src/shared/utils/clubInventory.ts`, `src/renderer/components/club/ClubInventoryPanel.tsx` (tables `club_items`, `club_loans`)     |
| Synchronisation dossier | `src/main/clubSync.ts` (décision pure `decideSync`, service), `src/main/ipc/clubSyncHandlers.ts` (IPC `club:sync*`), `src/renderer/components/club/ClubSyncModal.tsx`         |
| Sauvegarde              | `src/database/repos/clubBackupRepo.ts`, `src/main/clubBackupFile.ts`, `src/renderer/components/club/clubBackup.ts` (IPC `club:exportBackup`, `club:importBackup`)             |
| Interface               | `src/renderer/components/club/`                                                                                                                                               |

## Compléments (#1872, retours de séance)

- **Armes des exercices** : `club_exercises.weapons` (migration 40). Liste de codes `E` épée, `F` fleuret, `S` sabre, `L` sabre laser, `A` escrime artistique ; vide = toutes armes. Filtre dans la bibliothèque et le sélecteur d'exercices.
- **Nouveau membre** : fenêtre de création (nom, prénom, licence, date de naissance, latéralité, catégorie d'âge saisie seulement sans date de naissance).
- **Séances passées** : suppression possible (efface aussi les combats de la séance, après confirmation).
- **Contrat de prêt** : bouton « Imprimer le contrat de prêt » sur chaque prêt (`src/shared/utils/clubLoanContract.ts`), zones de signature prêteur / emprunteur.
- **Facture PDF** : import sur la fiche matériel, stocké en data URL dans `club_items.invoice_pdf` (migration 41), 5 Mo maximum.
- **Cartes activables** : les cases à cocher du Mode Club et de la journée multi-épreuves sont des boutons à bascule (`src/renderer/components/common/ToggleChip.tsx`, `aria-pressed`), bleus quand sélectionnés.
- **Mise en page** : « + Nouveau membre » et « Ajouter » (maîtres d'armes) à droite du titre de carte ; libellé « Nombre de pistes » au-dessus du champ ; préparation de séance : répétition sous l'arme et l'intitulé.
