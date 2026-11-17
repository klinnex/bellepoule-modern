# Appareils de piste — protocole Cyrano (EFP1 / EFP1.1)

> État (#1720, #1829) : codec, serveur UDP, supervision, simulateur, panneau de configuration,
> raccordement aux arènes, **modes par piste** (appareil maître, afficheur, manuel), bascule en
> manuel si l'appareil tombe, notification BAD MATCH, reprise des arènes au redémarrage (chrono
> compris), saisie de la tablette verrouillée (points et cartons) quand l'appareil maître fait foi,
> cartons sur les feuilles imprimées.
> PREV (touche PREVIOUS de l'appareil ou secours du poste, fenêtre de 3 min), bandeau appareil
> dans la vue arbitre, pistes en base par compétition, profils constructeur, ajout en lot,
> import / export de la liste.
> Validation de fin unifiée : règles uniques dans `src/shared/utils/matchEndValidation.ts`,
> partagées par l'appareil, la tablette et la fin de match d'arène.
> Cartons P (EFP1.1) lus sur l'appareil et repris dans le `DISP` ; test de bout en bout
> (`e2e.test.ts`, UDP réel, lancé avec les tests unitaires en CI).
> **Couche multi-protocole** (§ 2 septies) : modèle commun `src/main/piste/`, pilote Cyrano,
> barrière d'entrée des arènes (`ArenaInputGate`). **Équipes** (`Type=T`, § 2 octies) : relais FIE
> de l'arène `/equipe{N}` sur l'appareil (relais, cumuls, cartons de la rencontre, remplaçant,
> NEXT / PREV, verrou de la tablette équipe).
> Restent : bouton PREV de la tablette, pilotes RS422-FPA / Favero / OPP2-MQTT, équipes au format
> « arène laser », vainqueur imposé en fin de rencontre par équipes, cartons d'appareil en équipes
> (sans motif : non enregistrés comme cartons individuels).

Spécification : [Cyrano 1.1](https://superfencingsystem.com/CyranoProtocol-1-1.pdf)
(11 octobre 2019, rétrocompatible EFP1).

## 1. Protocole en bref

| Élément | Valeur |
|---|---|
| Transport | UDP, port **50100** (paramétrable ; certains appareils utilisent 50101) |
| Adressage | IP fixes, table « IP ↔ piste » côté logiciel |
| Trame | `\|EFP1.1\|COM\|piste\|compé\|…\|%\|<tireur droit>\|%\|<tireur gauche>\|%\|` (~210 caractères max.) |
| Logiciel → appareil | `HELLO` (toutes les 15 s), `DISP` (match à afficher), `ACK` / `NAK` (fin acceptée / refusée) |
| Appareil → logiciel | `INFO` (partiel, complet, incomplet ; chrono au plus 1×/s), `NEXT`, `PREV` |
| États appareil | `F` assaut, `H` halte, `P` pause, `E` fin en attente d'ACK, `W` attente |
| Inversion droite/gauche | faite par l'appareil, qui échange les zones : le logiciel suit l'**Id** du tireur, jamais le nom |
| Fin de match valide | scores différents, ou égalité avec priorité, ou abandon / exclusion d'un tireur |

EFP1.1 ajoute le carton P (champ 12 de chaque zone tireur, 0 à 5) et le chrono au centième.

## 2. Code (`src/main/cyrano/`)

| Fichier | Rôle |
|---|---|
| `codec.ts` | `parseCyrano(raw)` / `buildCyrano(msg)` : 3 zones, champs de fin omis, `\|` et `%` retirés des valeurs (pas d'échappement dans le protocole), troncature aux longueurs maximales de la spécification, carton P omis en EFP1. |
| `names.ts` | `transliterate` (alphabet latin seul), `formatCyranoName(nom, prénom, 10 \| 12 \| 15 \| 20)` → `MARTIN P`, `formatCyranoNat` (3 caractères), `pickCyranoNat(tireur, 'country' \| 'club' \| 'region' \| 'auto')`. |
| `disp.ts` | `buildDisp(match)` : descripteur neutre (phase, poule/tableau, n° de match, tireurs droit/gauche) → champs d'un `DISP`. Laser et CUSTOM : arme non transmise. `EMPTY_DISP` = « aucun match disponible ». |
| `deviceState.ts` | Champs propres au protocole, utilisés par le pilote : Id tireur tronqué à **8 caractères** (`cyranoFencerId` ; les UUID BellePoule en font 36, la correspondance par préfixe est faite par `piste/pisteState.ts`), chrono `m:ss` / `m:ss.cc` → secondes (`parseCyranoStopwatch`), carton P du champ 12 ↔ compteurs jaune / rouge / noir P (`cyranoPCardCounts`, `cyranoPCardField` : 0 / 2 / 4). |
| `driver.ts` | `CyranoPisteDriver` : pilote du modèle commun (§ 2 septies). INFO / NEXT / PREV → `PisteInput` (`cyranoToPisteState` : états, statuts, carton P 0-5 → jaune / rouge / noir P, chrono en secondes, priorité, type, relais ; n° de séquence attribué à la réception) ; `PisteCommand` → DISP / DISP vide / ACK / NAK (`pisteDisplayToDisp`, chrono `m:ss`). |
| `server.ts` | `CyranoServer` : socket `dgram`, table des pistes (`setPistes`), liste blanche d'IP, HELLO toutes les 15 s, version du protocole par piste (`auto` = celle de la dernière trame reçue), supervision, journal borné des trames, événements `info` / `next` / `prev` / `status` / `unknown`, envois `sendDisp` / `sendAck` / `sendNak`. |

Hors protocole (`src/main/piste/`) :

| Fichier | Rôle |
|---|---|
| `types.ts` | Modèle commun : `PisteState`, `PisteInput`, `PisteCommand`, `PisteDisplay`, `PisteLink`, interface `PisteDriver` (§ 2 septies). |
| `pisteState.ts` | État d'appareil rapporté au match : côtés A / B par **Id** (`mapPisteSides`, troncature fournie par le pilote), cartons au format des arènes (`sideCards`, `cardCounts`), validation de fin (`validatePisteEnd`, `pisteEndOutcome`) sur les règles de `shared/utils/matchEndValidation.ts`. |
| `arenaInputGate.ts` | `ArenaInputGate` : barrière d'entrée des arènes (séquence par source). |
| `pisteHub.ts` | `PisteHub` : raccordement aux arènes (voir § 2 bis). |
| `teamRelayPiste.ts` | Relais par équipes sur l'appareil (§ 2 octies). |

### 2 bis. Raccordement aux arènes — mode appareil maître

Les entrées de l'appareil passent par le chemin de la tablette (`arena_control`, pseudo-socket
`cyrano:<piste>`, sans anti-rebond) ; les mises à jour qui en résultent portent `source: 'device'`
et la vue arbitre ouverte sur le même match les recopie (score, cartons, chrono).

| Événement | Effet |
|---|---|
| `INFO` en `F` / `H` / `P` | match démarré sur l'arène ; score et cartons (jaune, rouges) appliqués s'ils changent ; chrono diffusé (`F` en marche, `H` / `P` arrêté) |
| `INFO` en `W` sans le match de l'arène | `DISP` du match courant (appareil redémarré ou reconnecté) |
| `INFO` d'autres tireurs que ceux du match (BAD MATCH) | ignoré ; alerte « BAD MATCH » sur la piste dans le panneau Cyrano, levée dès que l'appareil affiche le bon match |
| `INFO` en `E` | état final appliqué, puis `ACK` et clôture du match ; égalité avec priorité (ou statuts `V` / `D`) → vainqueur prioritaire ; abandon (`A`) / exclusion (`E`) → l'adversaire gagne, abandon ou exclusion marqué ; `NAK` si fin invalide ou BAD MATCH ; END répété après clôture → nouvel `ACK` sans réenregistrement |
| `NEXT` | match suivant seulement si le match de l'arène est terminé (ou absent) ; sinon `DISP` du match courant (pas d'abandon silencieux) |
| `PREV` | rappel du dernier match terminé de l'arène pour correction (`recallPrevMatch`, 3 min après sa fin) : `DISP` avec ses scores et cartons, puis nouvelle validation (`END` → `ACK`) qui le réenregistre ; un match de tableau non commencé repasse en tête de file. Refus (combat en cours, rien à rappeler, délai dépassé) : `DISP` du match courant (ou affichage vide). Sans effet en afficheur |
| Changement de match (file, vue arbitre, DT) | `DISP` ; jamais de `DISP` d'un match terminé |
| Correction de score sur la tablette | `DISP` avec les scores corrigés (pas d'écho pour les scores venus de l'appareil) |

**L'appareil fait foi** (appareil maître et en ligne, décision de l'auteur du ticket) : sur la
tablette, l'ajout de points **et** de cartons (jaune, rouge, noir, P) est bloqué, avec une
notification ; le retrait reste permis pour corriger. Côté serveur, une action de la tablette qui
**ajoute** un carton ou un point est refusée : `update_score` dont les cartons s'allongent
(comptage par type, `cyranoLock.ts`) → ajouts ignorés, retraits gardés (`keepRemovals` : remplacer
un jaune par un rouge garde le retrait du jaune), la tablette reçoit en retour les cartons de
l'arène (`source: 'device'`) ; scores bornés aux scores actuels (`lockedScore`) ; `add_card`
refusé ; carton noir pris en compte envoyé avec la fin de match (`POST /api/matches/:id/finish`,
`blackCardFencer`) → `409 cyrano_master_lock`, la tablette retire alors le carton et le combat
continue. Les entrées
de l'appareil (`cyrano:<piste>`) passent toujours. Appareil hors ligne, piste en afficheur ou en
manuel : saisie libre sur la tablette.

Un `DISP` du match courant porte aussi les cartons déjà donnés (champs jaune / rouge des zones
tireurs, omis à zéro) : sans eux, le premier `INFO` d'un appareil qui reprend un match (PREV,
redémarrage) les effacerait. Pour un match rappelé (PREV) pas encore relancé, il porte aussi le
chrono de fin de match (dernier chrono reçu de l'appareil), également diffusé à la tablette et à
l'écran d'arène ; jamais de chrono dans un `DISP` envoyé en plein combat. À confirmer sur un
appareil réel.

Le `DISP` porte la phase, la poule (numéro de la poule) ou le tableau (`A16`, `A8`…) et le numéro
du match (`matchCoords.ts`). Phase (spéc. § 3) : tour de poules en cours (1, 2…), tableau = nombre
de tours de poules + 1 (`settings.poolRounds`, `uiState.currentPoolRound`). Un match rappelé qui
s'était terminé par un abandon ou une exclusion repart avec le statut du tireur sorti (`A` / `E`,
champs R5 / L5), tant qu'il n'est pas relancé. Sabre laser et armes personnalisées : affichage seul (noms et score),
INFO ignorés, END → `NAK`, NEXT sans effet. Journal des scores : auteur `device` pour les saisies
et fins de match venues de l'appareil (libellé « Appareil de piste »).

### Panneau Cyrano (saisie distante)

| Réglage / action | Effet |
|---|---|
| Mode de la piste | `maître` (défaut), `afficheur` ou `manuel` (voir § 2 ter) ; changement pris en compte immédiatement |
| Interface d'écoute | adresse IP locale (ou toutes les interfaces) ; prise en compte au démarrage. Une interface IPv4 choisie écoute en réalité sur toutes les interfaces (sinon les diffusions `x.x.x.255` ne sont pas reçues sous Linux / macOS) : les trames d'IP non déclarées hors de son sous-réseau sont ignorées sans trace |
| Profil (ajout en lot) | `Standard` (50100), `EFP1.1` (50101), `Saint-George SG31 / SG32` (50101, IP `192.168.1.(100 + piste)` pré-remplie) |
| Démarrer avec la saisie distante | serveur Cyrano démarré à chaque lancement de séance, avec la table des pistes mémorisée |
| Secours `ACK` | ACK forcé : débloque un appareil resté en attente d'acquittement |
| Secours `NEXT` | même effet que la touche NEXT de l'appareil (mêmes garde-fous) |
| Secours `PREV` | même effet que la touche PREVIOUS de l'appareil : rappel du dernier match terminé (§ 2 bis) |
| Secours « Resynchroniser » | oublie l'état connu de la piste et renvoie le match de l'arène (ou un affichage vide) |
| Journal des trames | 200 dernières trames ; export texte, une trame par ligne : `horodatage ⇥ IN/OUT ⇥ ip:port ⇥ piste ⇥ trame [⇥ rejet]` |

Réglages mémorisés dans le navigateur de l'application (`localStorage`) : table des pistes
(mode compris), port, interface, options de noms, démarrage automatique.

### 2 ter. Modes par piste (#1829)

| Mode | Sortie vers l'appareil | Entrées de l'appareil | Commandes du poste |
|---|---|---|---|
| `master` (défaut) | DISP, ACK / NAK | INFO, END, NEXT appliqués à l'arène | ACK, NEXT, resynchronisation |
| `display` (afficheur) | DISP | INFO ignorés ; END → NAK ; NEXT sans effet | ACK, resynchronisation (pas NEXT) |
| `manual` | aucune trame | tout ignoré ; END → NAK | ACK seulement |

- **Sabre laser et armes personnalisées** : toujours `display` (décision n°5), quel que soit le mode réglé.
- **Appareil hors ligne** (statut `offline`) : la piste bascule en `manual` pour la suite (plus de DISP
  envoyé à un appareil muet). **Au retour en ligne**, le DISP du match courant est renvoyé.
- **Changement de mode** depuis le panneau : un passage en `manual` coupe les trames, un retour en
  `master` ou `display` renvoie le DISP du match courant.
- **BAD MATCH** : première alerte sur une piste → notification native au DT (un clic ramène la
  fenêtre au premier plan), libellée dans la langue de l'interface. Les alertes suivantes sur la même
  piste ne notifient pas à nouveau ; l'alerte est levée au prochain DISP correct.

### 2 quater. Reprise de l'état des arènes (#1829)

`persistArenaState` sauvegarde chaque arène. Au démarrage de la séance de saisie distante, une
arène sauvegardée **en cours** reprend son match et son score, si ce match n'est pas terminé en base ;
la file DE sauvegardée est rétablie. Le chrono aussi : la dernière valeur envoyée par la tablette
(`update_timer`, `pause_timer`, `reset_timer`) est gardée dans `currentMatch.clockSeconds`,
persistée à chaque pause et au plus toutes les 15 s en marche, puis renvoyée en pause aux écrans
qui rejoignent l'arène. La tablette garde de son côté son propre chrono (#1717).

- **Minute de repos de l'appareil** (état `P`, `arena.resting`) : le décompte reçu est celui du
  repos, il ne remplace pas `clockSeconds` ; le chrono du combat est de nouveau suivi à la fin du
  repos.
- **Tablette sans chrono local** (autre tablette, stockage vidé) : en rouvrant le match, elle
  reprend le chrono renvoyé par le serveur (`serverTimer`, `refereeUpdate.js`), toujours à
  l'arrêt, jamais relancé automatiquement ; son chrono local (`localStorage`, #1717) reste
  prioritaire.
- **`reset_scores`** efface `clockSeconds` avec les scores (en mémoire et dans l'état sauvegardé).

### 2 quinquies. Pistes partagées entre épreuves (#1878)

Journée multi-épreuves : un serveur distant par épreuve, un seul serveur Cyrano. L'arène N de
chaque épreuve est la piste physique N. `PisteHub` reçoit **tous** les serveurs distants et route
chaque piste vers l'épreuve de son **affectation en cours** (`hasArenaAssignment` : match non
terminé sur l'arène, ou match suivant en file) :

| Situation | Épreuve suivie |
|---|---|
| Une seule épreuve a une affectation sur la piste | celle-ci |
| Plusieurs | la dernière suivie (la piste reste prise jusqu'à la fin de son affectation), sinon celle en combat |
| Aucune | la dernière suivie : rien n'est envoyé à l'appareil jusqu'à la prochaine affectation |

- Les mises à jour d'arène d'une autre épreuve que celle suivie n'atteignent pas l'appareil ; les
  INFO / END / NEXT / PREV de l'appareil vont à l'épreuve suivie.
- Changement d'épreuve : état connu de l'appareil oublié, nouveau DISP avec l'arme et le champ
  Compe de la nouvelle épreuve (8 premiers caractères de l'identifiant de compétition).
- NEXT reste dans la file de la piste pour l'épreuve suivie ; jamais de saut d'une épreuve à l'autre.
- La liaison de l'appareil (`arena.cyrano` : mode, en ligne) suit la piste : retirée de l'arène
  de l'ancienne épreuve, publiée sur celle de la nouvelle, et republiée dès qu'elle manque
  (arènes recréées au démarrage d'une séance). Bandeau appareil et verrou de la tablette en
  dépendent.
- **Table des pistes de la salle** : une épreuve rattachée à une journée lit et écrit la table
  de la journée (clé `day:<id>` dans `cyrano_pistes`), partagée par toutes ses épreuves ; tant
  qu'elle est vide, la table propre de l'épreuve est reprise. Le panneau l'indique et signale
  les pistes suivies par une autre épreuve (`cyrano:getPistesScope`, `cyrano:getRoutes`).

### 2 sexies. Cartons sur les feuilles imprimées (#1829)

Les cartons enregistrés (table `match_cards`, y compris `p-red` / `p-black` lus sur l'appareil)
figurent sur les feuilles imprimées ou exportées en PDF, par tireur. Même décompte sur les deux
feuilles (`cardsSummaryHTML`, `poolPdf.ts`) : libellés traduits (`pdf.card_*` : Blanc, Jaune,
Rouge, Noir, Jaune P, Rouge P, Noir P), nombre si plus d'un (« Rouge ×2 »), et **cartons P à
part** des cartons de faute, comme le veut le règlement FIE (t.124.3.e).

| Feuille | Lecture | Rendu |
|---|---|---|
| Feuille de poule (impression d'une poule, impression ou PDF de toutes) | `withMatchCards` (`renderer/services/poolCards.ts`) : cartons des matchs terminés joints aux matchs (`db.getCards`) | `poolCardsSectionHTML` : section « Cartons » (élément `cards` des modèles, imprimée même avec un modèle antérieur), une ligne par tireur sanctionné, colonnes « Cartons » et « Cartons P (non-combativité) » |
| Feuille de match de tableau (feuilles d'arbitrage) | `loadDECards` (`tableauDialogState.ts`) : une requête (`db.getCardsByMatchIds`) ; un match saisi à distance est relu sous son id composite `<compétition>-<match>` | colonne « Cartons » entre score et signature, sur la ligne de chaque tireur : cartons de faute, puis cartons P dessous ; vide (à remplir à la main) sans carton enregistré |

### 2 septies. Couche multi-protocole (#1829)

```
appareil ──trames──▶ pilote (CyranoPisteDriver, …) ──PisteInput──▶ ArenaInputGate ──▶ PisteHub ──▶ arènes
appareil ◀─trames─── pilote ◀──────────────PisteCommand─────────────────────────── PisteHub
```

- **`PisteState`** : état normalisé d'un appareil — état (`fencing` / `halt` / `pause` / `waiting` /
  `ending`), chrono en secondes, priorité (`none` / `right` / `left`), type (`individual` / `team`),
  n° de période ou de relais ; par côté (droite / gauche) : Id, nom, nation, score, cartons
  (jaune, rouges, jaune / rouge / noir P), statut (`normal` / `victory` / `defeat` / `abandon` /
  `exclusion`), lumières, médical, remplaçant.
- **`PisteInput`** : `state` | `next` | `prev`, avec la source (pilote + piste) et un **numéro de
  séquence** strictement croissant par piste. Cyrano ne numérote pas ses trames : le pilote
  numérote à la réception (aucun rejet possible en Cyrano, comportement inchangé).
- **`PisteCommand`** : `display` (match ou relais à afficher : type, relais, arme, scores et
  cartons repris, chrono d'un match rappelé, épreuve), `clear`, `ack`, `nak`.
- **`PisteDriver`** : statuts de liaison (`getStatuses`, `findPiste`, `findAllByArena`, événement
  `status`), émission des entrées (événement `input`), `send(piste, commande)`, `fencerId(id)`
  (Id tel que l'appareil le renverra, ex. 8 caractères en Cyrano), capacités déclarées (noms,
  télécommande, ACK, chrono, cartons P, équipes). Le PisteHub ne manipule plus de `CyranoMessage`.
- **`ArenaInputGate`** (manque n°1) : barrière par arène. Une entrée d'appareil dont le numéro
  n'est pas supérieur au dernier accepté pour la même source sur la même arène (double, désordre,
  numéro illisible) est rejetée avant l'arène, journalisée (`logger.warn`) et gardée dans un journal
  borné (`getRejections`). Les entrées de la tablette passent sans contrôle (chemin `arena_control`
  inchangé). Une piste passée hors ligne est oubliée (`forget`) : un appareil redémarré peut
  reprendre sa numérotation. **Avec Cyrano, elle ne rejette rien** : le protocole ne numérote
  pas ses trames, le pilote numérote à la réception (toujours croissant) ; un INFO dupliqué ou
  désordonné sur le réseau n'est pas détecté. C'est le socle des protocoles numérotés à venir.
- Nouveau pilote (RS422-FPA, Favero série, OPP2/MQTT) : implémenter `PisteDriver`, le passer au
  `PisteHub` (`main.ts`). Un seul pilote par hub pour l'instant ; le pseudo-socket des entrées
  d'appareil reste `cyrano:<piste>` (verrou appareil maître, `cyranoLock.ts`).

### 2 octies. Équipes — relais FIE (`Type=T`, #1829)

Existant : l'arène équipe `/equipe{N}` (`teamArena.ts`, #1086 / #1240) tient en direct une
rencontre en **relais FIE** (9 relais de 3 contre 3, paliers de 5 jusqu'à 45, `teamRelayLive.ts`)
ou au format « arène laser ». L'ordre des relais vient de `generateRelayOrder` (rotation diagonale,
chaque titulaire rencontre chaque titulaire adverse une fois) ; les remplaçants sont déclarés dans
l'équipe (`isReserve`). La tablette saisit les touches du relais en cours, le chrono, les cartons ;
« relais suivant » enregistre le relais (`advanceTeamBout`).

Raccordement : une piste rattachée à l'arène N suit l'arène équipe `N` quand une rencontre en
relais FIE y a un **relais en cours** (même critère pour le routage et le traitement des
entrées) ; sinon l'arène individuelle `arena{N}`. Une rencontre terminée encore assignée ne
reçoit END répété et PREV que si l'arène individuelle N n'a aucune affectation. Toute
modification de l'arène équipe (tablette, DT, appareil) prévient le hub (`cyranoTeamHook`).

| Sens | Effet |
|---|---|
| DISP | `Type=T`, `Round` = n° du relais (1 à 9), zones tireur = tireurs du relais en cours (Id, nom en base, nation = équipe ; pays si compétition internationale ou source « pays »), **scores cumulés** de l'équipe ; cartons déjà reçus par chacun des deux tireurs **dans la rencontre** (ils se cumulent d'un relais à l'autre : dernier relais tiré vu par l'appareil et cartons de la tablette, par type le plus grand compte) ; Phase, PoulTab et Match renseignés comme en individuel (obligatoires, spéc. § 3) : poule et rang de la rencontre dans la poule, ou `A<tour>` et position + 1 pour une rencontre de tableau. Rencontre terminée ou retirée : DISP vide (sans effacer un match individuel affiché entre-temps) |
| INFO actif | score cumulé → score du relais en cours (cumul − relais terminés). Mêmes bornes que la tablette : un cumul inférieur aux relais terminés ou au-delà du palier du relais (`relayCapFor` : n × 5, plafonné à 45) est ignoré, tracé, et le cumul de l'arène renvoyé ; cartons de l'appareil reportés au relais en cours (`deviceCards`, état en mémoire : l'appareil ne donne pas le motif) ; chrono du relais (3 min − temps restant) |
| END d'un relais intermédiaire | correct (égalité comprise) : ACK, relais enregistré, puis DISP du relais suivant avec les cumuls (l'appareil ne remet pas les scores à zéro au BEGIN). END répété (ACK perdu) : nouvel ACK. Tireur en abandon (`A`) ou exclusion (`E`) : la fin d'un relais intermédiaire reste correcte (spéc. § 4) → ACK, relais enregistré, et **notification au DT** (piste, relais, tireur : suite à décider, rien n'est perdu en silence) ; cumul au-delà du palier : NAK |
| END du dernier relais | règles de fin individuelles (`validatePisteEnd`) ; vainqueur imposé (priorité à égalité, abandon, exclusion) → NAK tracé : le modèle d'équipe déduit le vainqueur du cumul, à saisir par le DT |
| END après la fin de la rencontre | répétition du dernier relais acquitté : ACK ; sinon NAK (jamais sans réponse) |
| Remplaçant (`R11` / `L11` = `R`) | équipes seulement (en individuel : refusé, tracé) ; la demande peut être annulée pendant le relais où elle est posée (spéc. § 4) : elle est prise en compte **à la fin acquittée du relais**, si elle est toujours posée. Le remplaçant de l'équipe prend alors la place du tireur de la zone dans ses relais suivants non tirés (`team_bouts` mis à jour). Refusé et tracé : pas de remplaçant, remplaçant déjà présent dans la rencontre, plus de relais pour ce tireur |
| NEXT | ne saute jamais un relais : relais en cours renvoyé ; rencontre terminée → DISP vide (rencontre suivante assignée par le DT) |
| PREV | rappel du relais précédent (repasse en cours avec son score) si le relais en cours n'a pas commencé, ou après la fin de la rencontre ; la rencontre est recalculée en base (`reopenTeamBout` : statut en cours, vainqueur effacé, scores et relais courant). Sinon relais en cours renvoyé. Nouvel END → réenregistré |
| BAD MATCH | tireurs d'un autre relais : alerte (`equipe{N}`), END → NAK |

Modes : afficheur → DISP seul, END → NAK ; arme laser → affichage seul ; format « arène laser »
non raccordé (assauts indépendants, pas de relais).

**Verrou de la tablette équipe** (même décision qu'en individuel) : le hub publie le mode et la
liaison de l'appareil sur l'arène équipe (`cyrano`). Appareil maître et en ligne → la tablette ne
peut ni ajouter de touche ou de carton (équipe ou tireur), ni passer au relais suivant, ni remettre
le relais à zéro : refus côté serveur (`team_touch` > 0, `team_card`, `team_fencer_card`,
`team_reset_bout`, `team_advance_bout` → état renvoyé, trace) et côté tablette (bandeau,
notification). Retrait d'une touche toujours permis (bouton −1, `team_touch` -1) ; il est renvoyé
à l'appareil par un DISP.

### Supervision

| Statut | Condition |
|---|---|
| `never` | aucune trame reçue depuis la déclaration |
| `online` | dernière trame < 20 s (l'appareil répond à chaque HELLO) |
| `stale` | entre 20 s et 40 s |
| `offline` | > 40 s (délai au-delà duquel l'appareil se considère lui-même déconnecté) |

### Sécurité réseau

UDP sur le LAN, sans chiffrement ni jeton : seules les trames des **IP déclarées** sont traitées.
Les autres sont journalisées (`rejected: 'unknown_ip'`) et signalées par l'événement `unknown`
(aide à la découverte), sans effet. Trames illisibles ou > 512 octets : ignorées.
Un datagramme peut contenir plusieurs trames collées (`…%||EFP1.1|INFO|…`, Saint-George SG32) :
elles sont traitées dans l'ordre, la dernière fait foi (`splitCyranoFrames`).

### Saint-George SG31 / SG32

Constaté en salle (12 SG32) : IP fixe `192.168.1.(100 + piste)`, écoute sur **50101**, INFO émis
depuis 50101 en **diffusion** vers `192.168.1.255:50100` toutes les 2 à 4 s (aucune IP de serveur
à régler sur l'appareil). Côté poste : port UDP 50100, IP dans `192.168.1.0/24` hors 101 à 112,
profil `Saint-George`, numéro de piste BellePoule = numéro de l'appareil. La télécommande n'agit que
si elle est appairée à l'appareil (socle de charge) ; BEGIN fait passer de `W` à `H` (spéc. § 4).

### Pare-feu

Le port UDP 50100 doit être ouvert **en entrée** sur le poste BellePoule :

- Windows : accepter l'invite du pare-feu au premier lancement, ou ajouter une règle entrante UDP 50100 pour BellePoule Modern.
- macOS : Réglages Système → Réseau → Coupe-feu → autoriser BellePoule Modern.
- Linux : par exemple `sudo ufw allow 50100/udp`.

### 2 nonies. Conformité à la spécification Cyrano 1.1

Revue du 17 novembre 2026 (spécification du 11 octobre 2019), contrôlée par les tests et par une
validation à l'écran avec quatre appareils simulés.

| Point de la spécification | État |
|---|---|
| § 2 UDP, port 50100 modifiable, IP fixes, table IP ↔ piste | conforme |
| § 3 HELLO toutes les 15 s, champs obligatoires seuls | conforme |
| § 3 Champ Compe (obligatoire) | conforme : épreuve suivie par la piste (8 premiers caractères de son identifiant), reprise par les HELLO / ACK / NAK qui suivent le DISP |
| § 3 Champ Phase | conforme : tour de poules en cours ; tableau = dernier tour de poules + 1 |
| § 3 Chrono (champ 10) | conforme : centièmes obligatoires sous 10 s en EFP1.1, absents en EFP1 |
| § 3 Longueurs maximales, syntaxe à deux niveaux, zones omises | conforme (`codec.ts`) |
| § 3 Identification des tireurs par Id, inversion droite / gauche | conforme (Id tronqué à 8 caractères, correspondance par préfixe) |
| § 3 Statut R5 / L5 lu seulement en fin de match | conforme ; renvoyé avec un match rappelé |
| § 3 Carton P (R12 / L12, EFP1.1) | conforme, lu et repris dans le DISP |
| § 1 Compatibilité EFP1 / EFP1.1 | conforme : version imposée par piste, ou `auto` (version de la dernière trame reçue ; tant que l'appareil n'a rien répondu, le HELLO alterne EFP1.1 / EFP1) |
| § 4 END : fin correcte → ACK, incorrecte → NAK | conforme (individuel) |
| § 4 Équipes : fin d'un relais intermédiaire toujours correcte | conforme, y compris avec abandon ou exclusion (DT prévenu) |
| § 4 Remplaçant : équipes seulement, annulable pendant le relais | conforme (pris en compte à la fin du relais) |
| § 5 Messages perdus (END ou ACK répété) | conforme : nouvel ACK, rien de réenregistré |

Écarts assumés :

| Écart | Raison |
|---|---|
| NEXT sur un match chargé mais non terminé : le match courant est renvoyé, pas le suivant | jamais d'abandon silencieux d'un assaut (question ouverte n°3 de #1829) |
| PREV refusé au-delà de 3 minutes après la fin du match, ou si le match suivant a commencé | fenêtre de correction bornée (#1829, manque n°4) |
| Équipes, dernier relais : fin à vainqueur imposé (priorité, abandon, exclusion) → NAK | le modèle d'équipe déduit le vainqueur du cumul ; la spécification la tient pour correcte |
| Correction depuis la tablette pendant le combat : envoyée par DISP | un appareil conforme **ignore** un DISP reçu en état actif (§ 4). La correction n'atteint donc un tel appareil qu'en attente (match rappelé, avant BEGIN) ; en plein combat, l'état suivant de l'appareil rétablit son score. Le simulateur applique ce DISP (hors spécification). À vérifier sur un SG32 réel |
| Compteur d'interventions médicales (R10 / L10) | lu, non exploité |

## 3. Simulateur d'appareil

```bash
npm run cyrano:sim -- --server 127.0.0.1 --server-port 50100 --port 50101 --piste 1 --protocol EFP1.1
```

Le simulateur répond aux HELLO par un INFO complet, installe les DISP en état W (match en
cours : un DISP des mêmes tireurs corrige les scores), passe en W à la réception d'un ACK.
Ses commandes reprennent la télécommande WSG des Saint-Georges SG31 / SG32 :

| Groupe | Commandes (console) | Touche de la télécommande |
|---|---|---|
| Chrono | `stopgo` (`go`, `halt`), `pause`, `reset`, `round+` / `round-`, `clock+` / `clock-`, `init+` / `init-` | STOP/GO, PAUSE (minute de repos, état `P`), RESET (temps de la période), ROUND ∧∨, jaune CLOCK ∧∨ (±1 s), rouge RESET ∧∨ (durée ±1 min) |
| Arme | `weapon`, `epee` / `foil` / `sabre` | touche arme, jaune + PAUSE / RESET / STOP/GO |
| Priorité | `prio`, `pn` ; `pr` / `pl` (essais) | ⚄ (tirage au sort), jaune P RESET |
| Score | `r+` `r-` `l+` `l-`, `yr` `yl` / `yr-` `yl-`, `rr` `rl` / `rr-` `rl-`, `swap`, `zero`, `cards0` | ∧ ∨, jaune ∧∨ (carton jaune), rouge ∧∨ (carton rouge), ⟷, 0:0, jaune CARDS RESET |
| Bloc PC | `next`, `prev`, `begin`, `end` (`validate`), `ar` / `al`, `er` / `el`, `resr` / `resl`, `mr` / `ml` | vert NEXT, PREVIOUS, BEGIN, VALIDATE ; jaune ABANDON, RESERVE ; rouge EXPULSION, assistance médicale |
| Appareil | `raz`, `show`, `quit` | extinction / rallumage |

- Chrono à 0:00 : GO refusé (comme l'appareil). `pause` lance la minute de repos ; à sa fin,
  le temps de la période revient et la période passe à la suivante ; `reset` l'écourte.
- `reset` ne remet que le chrono ; `raz` efface tout (tireurs, scores, cartons, chrono).
- NAK (fin refusée) : l'appareil revient en halte, l'arbitre corrige puis valide à nouveau
  (spéc. § 4). Un DISP des mêmes tireurs reçu en plein combat corrige les scores : c'est une
  facilité du simulateur, un appareil conforme l'ignore.
- Équipes (DISP `Type=T`) : `Round` = n° du relais fixé par le logiciel (`round+` / `round-`
  refusés), scores cumulés repris de chaque DISP de relais, `resr` / `resl` = demande d'entrée du
  remplaçant (champ 11 = `R`, effacé au DISP du relais suivant) ; `snapshot()` expose `team` et
  `relay`.
- Une commande impossible dans l'état courant est refusée avec sa raison (même règle pour la
  télécommande web, qui grise le bouton).

Déclarer la piste côté serveur avec l'IP `127.0.0.1` et le port du simulateur (`--port`).

### Télécommande web (plusieurs pistes)

```bash
npm run cyrano:remote          # 3 pistes par défaut, page http://127.0.0.1:5099
npm run cyrano:remote -- --count 16   # pistes 1 à 16 : 127.0.0.N, port 50100 + N
npm run cyrano:remote -- --pistes 1@127.0.0.1:50101,2@127.0.0.2:50102 --server-port 50100
```

Une carte par piste : état de l'appareil, chrono, période et durée, tireurs gauche (rouge) /
droite (vert), boutons groupés comme sur la télécommande (bloc PC, chrono, arme, score, cartons,
priorité), libellés colorés selon la touche de mode, et journal des trames (HELLO masqués).
Au-delà de 4 pistes, les cartes s'ouvrent repliées sur une ligne (état, chrono, tireurs et score) ;
un clic sur l'en-tête déplie la télécommande, boutons « Tout déplier / Tout replier » en haut.
La table des pistes correspondante peut être déclarée d'un coup depuis la console DevTools de
l'application :

```js
const pistes = Array.from({ length: 16 }, (_, k) => ({ piste: String(k + 1), ip: `127.0.0.${k + 1}`,
  port: 50101 + k, arena: k + 1, protocol: 'auto', mode: 'master' }));
localStorage.setItem('bellepoule-cyrano-pistes', JSON.stringify(pistes)); // panneau Cyrano
await window.electronAPI.cyrano.setPistes(pistes);                         // serveur
``` Mêmes appareils simulés que la console
(`scripts/lib/cyranoDevice.js`). Ne pas lancer en même temps un simulateur console sur les mêmes ports.

Plusieurs simulateurs sur un même poste : le logiciel identifie une piste par son **IP**, donc
une adresse de bouclage par simulateur (`--bind`). Sous Linux, toute la plage `127.0.0.0/8`
répond sans configuration ; sous macOS : `sudo ifconfig lo0 alias 127.0.0.2`.

```bash
npm run cyrano:sim -- --piste 1 --bind 127.0.0.1 --port 50101
npm run cyrano:sim -- --piste 2 --bind 127.0.0.2 --port 50102
npm run cyrano:sim -- --piste 3 --bind 127.0.0.3 --port 50103
```

## 4. Décisions (#1720)

| Sujet | Décision |
|---|---|
| Mode par défaut d'une piste avec appareil | **Appareil maître** : score, cartons et chrono viennent de l'appareil ; tablette en miroir ; END sur l'appareil → ACK / NAK. Modes « afficheur » et « manuel » disponibles par piste. |
| Champ « nation » (3 caractères) | **Réglage par compétition** : pays, club ou ligue ; `auto` = pays si compétition internationale, club sinon (`pickCyranoNat`). |
| Correction de score en mode maître | **Arbitre et DT** depuis la tablette ; la correction est renvoyée à l'appareil par un DISP avec scores. |
| Sabre laser et armes personnalisées | **Affichage seul** : DISP noms + score, champ arme vide, pas de télécommande. |

## 5. Suite prévue (#1720)

1. Socle arènes : source d'entrée et numéro de séquence (`ArenaInputGate`, fait #1829), validation unifiée.
   - **Couche multi-protocole** (fait, #1829, § 2 septies) : modèle d'état de piste commun
     (`PisteState`, `PisteInput`, `PisteCommand`) et pilotes déclarant leurs capacités
     (noms, télécommande, ACK, chrono, cartons P, équipes). `CyranoPisteDriver` est le premier
     pilote ; RS422-FPA, Favero série (lecture seule) et OPP2/MQTT suivront sans toucher aux arènes.
   - **Une seule validation de fin** (fait, #1829) : `shared/utils/matchEndValidation.ts`
     (`validateMatchEnd`, `decideMatchWinner`, `resolveScoreLimit`, `passivityWinner`,
     `crossedSabreBreak`) utilisé par `piste/pisteState.ts` (fin d'appareil), `matchRoutes.ts`, `matchFinish.ts` et
     `arenaOps.ts` ; `scoreValidation.ts` (jamais appelé) supprimé. Pause sabre à 8 touches :
     règle fournie, non branchée (périodes de la tablette au temps).
   - **Reprise de l'état des arènes** au redémarrage (`saveArenaState` est écrit mais jamais relu).
   - **Chrono tenu côté serveur** en individuel, alimenté par la source maîtresse (appareil ou
     tablette) : référence pour la tablette en miroir.
2. Pilote Cyrano en lecture (mode afficheur), supervision dans l'interface.
3. Télécommande : NEXT / PREV via `arenaQueue`, END → ACK / NAK → `matchFinish`, alerte BAD MATCH.
   - PREV : rappel du match précédent (`recallPrevMatch`, #1852), fenêtre de correction de 3 min
     (cf. Engarde), relié à la touche PREVIOUS de l'appareil.
4. Interface : table des pistes enregistrée en base, profils constructeur, format des noms.
   - Actions de secours par piste : ACK forcé, passage en manuel, NEXT envoyé depuis le poste,
     remise à zéro de l'affichage.
   - Ajout de pistes en lot, import / export de la liste, mur de pistes (mini-vues en grille).
   - Écoute limitée à l'interface réseau choisie ; journal des trames exportable et rejouable
     dans le simulateur.
5. Vue arbitre : bandeau appareil, choix de match → DISP.
6. Cartons P, équipes (`Type=T`, relais, remplaçant) — faits (#1829), sauf format « arène laser ».

Suivi de #1829 : modes, bascule hors ligne, notification BAD MATCH et reprise des arènes livrés ;
PREV (appareil et poste ; pas encore de bouton sur la tablette), bandeau arbitre, table des pistes en
base, profils constructeur, ajout en lot et import / export livrés ; les extensions restent ouvertes.

Livré ensuite (#1829) : cartons de la feuille de poule et de la feuille de match de tableau
imprimées, **cartons P à part** (t.124.3.e, § 2 sexies) ; reprise du chrono au redémarrage
(§ 2 quater) ; **rapport d'exclusion pré-rempli**
pour la FFE (carton noir, annexe 14 : Résultats → Export → « Rapport FFE (carton noir) »).

Questions encore ouvertes : rattachement des sous-arènes (`arena3s2`) à un appareil ;
second poste BellePoule en secours (maître / esclave, cf. Fencing Fox).
