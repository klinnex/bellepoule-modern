# Appareils de piste — protocole Cyrano (EFP1 / EFP1.1)

> État (#1720, #1829) : codec, serveur UDP, supervision, simulateur, panneau de configuration,
> raccordement aux arènes, **modes par piste** (appareil maître, afficheur, manuel), bascule en
> manuel si l'appareil tombe, notification BAD MATCH, reprise des arènes au redémarrage.
> PREV (touche PREVIOUS de l'appareil ou secours du poste, fenêtre de 3 min), bandeau appareil
> dans la vue arbitre, pistes en base par compétition, profils constructeur, ajout en lot,
> import / export de la liste.
> Validation de fin unifiée : règles uniques dans `src/shared/utils/matchEndValidation.ts`,
> partagées par l'appareil, la tablette et la fin de match d'arène.
> Restent : bouton PREV de la tablette, cartons P, équipes, couche multi-protocole, test de bout
> en bout en CI.

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
| `endValidation.ts` | Adaptateur vers `shared/utils/matchEndValidation.ts` (#1829). `validateCyranoEnd(info)` → `{ ok }` ou `{ ok: false, reason }` (`not_ending`, `missing_fencers`, `missing_scores`, `tie_without_priority`) ; `cyranoEndOutcome(info, côtés)` → vainqueur imposé par l'appareil (abandon, exclusion, V / D ou priorité à égalité), rapporté aux tireurs A / B par **Id**. |
| `deviceState.ts` | Lecture d'un `INFO` rapportée au match de l'arène : Id tireur tronqué à **8 caractères** par le protocole (les UUID BellePoule en font 36) → correspondance par préfixe parmi les deux tireurs du match (`resolveCyranoSide`, `mapCyranoSides`) ; cartons (`cyranoCards`) ; chrono `m:ss` / `m:ss.cc` → secondes. |
| `pisteHub.ts` | `PisteHub` : raccordement aux arènes (voir § 2 bis). |
| `server.ts` | `CyranoServer` : socket `dgram`, table des pistes (`setPistes`), liste blanche d'IP, HELLO toutes les 15 s, version du protocole par piste (`auto` = celle de la dernière trame reçue), supervision, journal borné des trames, événements `info` / `next` / `prev` / `status` / `unknown`, envois `sendDisp` / `sendAck` / `sendNak`. |

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

Un `DISP` du match courant porte aussi les cartons déjà donnés (champs jaune / rouge des zones
tireurs, omis à zéro) : sans eux, le premier `INFO` d'un appareil qui reprend un match (PREV,
redémarrage) les effacerait. Pour un match rappelé (PREV) pas encore relancé, il porte aussi le
chrono de fin de match (dernier chrono reçu de l'appareil), également diffusé à la tablette et à
l'écran d'arène ; jamais de chrono dans un `DISP` envoyé en plein combat. À confirmer sur un
appareil réel.

Le `DISP` porte la phase, la poule (numéro de la poule) ou le tableau (`A16`, `A8`…) et le numéro
du match (`matchCoords.ts`). Sabre laser et armes personnalisées : affichage seul (noms et score),
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
la file DE sauvegardée est rétablie. Le chrono n'est pas restauré.

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

1. Socle arènes : source d'entrée et numéro de séquence (`ArenaInputGate`), validation unifiée.
   - **Couche multi-protocole avant tout raccordement** : modèle d'état de piste commun
     (`PisteState`, `PisteInput`, `PisteCommand`) et pilotes déclarant leurs capacités
     (noms, télécommande, ACK, chrono, cartons P, équipes). `CyranoServer` devient le premier
     pilote ; RS422-FPA, Favero série (lecture seule) et OPP2/MQTT suivront sans toucher aux arènes.
   - **Une seule validation de fin** (fait, #1829) : `shared/utils/matchEndValidation.ts`
     (`validateMatchEnd`, `decideMatchWinner`, `resolveScoreLimit`, `passivityWinner`,
     `crossedSabreBreak`) utilisé par `endValidation.ts`, `matchRoutes.ts`, `matchFinish.ts` et
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
6. Cartons P, équipes (`Type=T`, relais, remplaçant).

Suivi de #1829 : modes, bascule hors ligne, notification BAD MATCH et reprise des arènes livrés ;
PREV (appareil et poste ; pas encore de bouton sur la tablette), bandeau arbitre, table des pistes en
base, profils constructeur, ajout en lot et import / export livrés ; les extensions restent ouvertes.

Questions encore ouvertes : rattachement des sous-arènes (`arena3s2`) à un appareil ;
second poste BellePoule en secours (maître / esclave, cf. Fencing Fox).
