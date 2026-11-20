# Appareils de piste OPP2 (JSON sur MQTT) — #1960

OPP2 (OpenPiste Protocol, niveau 2) : protocole ouvert, JSON sur MQTT 3.1.1.
Spécification : <https://github.com/OpenPiste/protocols> (`docs/level2.md`, version `1.0`).
Le pilote OPP2 s'ajoute au pilote Cyrano ([CYRANO.md](CYRANO.md)) : mêmes arènes, même
`PisteHub`, même validation de fin de match. Les deux protocoles fonctionnent en même temps.

```
Appareil Cyrano ──UDP 50100──▶ CyranoPisteDriver ─┐
Appareil OPP2 ──MQTT──▶ broker intégré ──▶ Opp2PisteDriver ─┴▶ MultiPisteDriver ──▶ PisteHub ──▶ arènes
```

## Code (`src/main/opp2/`)

| Fichier                   | Rôle                                                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mqttPacket.ts`           | Codec MQTT 3.1.1 (CONNECT … DISCONNECT), découpage du flux TCP, jokers `+` / `#`.                                                                                                                                                                     |
| `mqttBroker.ts`           | Broker intégré, dans le processus main : messages retenus, dernière volonté, QoS 0 / 1 (QoS 2 accepté en entrée), keepalive. Sessions toujours propres. Crochets `authenticate` / `authorizePublish`. BellePoule s'y branche sans socket (`Opp2Bus`). |
| `mqttClient.ts`           | Client MQTT minimal : appareil simulé des tests, futur raccordement à un broker externe.                                                                                                                                                              |
| `codec.ts`                | Sujets `openpiste/{piste}/{rôle}/{message}`, construction des messages `software/*`.                                                                                                                                                                  |
| `driver.ts`               | `Opp2PisteDriver` : implémente `PisteDriver`.                                                                                                                                                                                                         |
| `../piste/multiDriver.ts` | `MultiPisteDriver` : plusieurs pilotes derrière un seul `PisteHub`. Une piste appartient au premier pilote qui la déclare : un même n° de piste ne peut pas être Cyrano et OPP2.                                                                      |

Pas de dépendance npm ajoutée.

## Correspondance avec le modèle commun

| Modèle commun                                                                 | Sens       | Message OPP2                                                                             |
| ----------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `display` : tireurs, arbitre                                                  | → appareil | `software/fencers`                                                                       |
| `display` : arme, type, épreuve, phase, poule / tableau, n° de match, période | → appareil | `software/match`                                                                         |
| `display` : score et cartons repris                                           | → appareil | `software/score`                                                                         |
| `display` : chrono d'un match rappelé                                         | → appareil | `software/clock` (toujours `running: false`)                                             |
| `clear`                                                                       | → appareil | `software/fencers` vide                                                                  |
| `ack` / `nak`                                                                 | → appareil | `software/control` `ACK` / `NAK`                                                         |
| Présence de BellePoule                                                        | → tous     | `software/connection` (retenu) au démarrage, `online: false` à l'arrêt                   |
| `state` : état F / H / P / W / E                                              | ← appareil | `apparatus/state`                                                                        |
| `state` : scores, statuts, cartons, priorité                                  | ← appareil | `apparatus/score` (`black_card` → exclusion, `DNS` → abandon)                            |
| `state` : chrono                                                              | ← appareil | `apparatus/clock`                                                                        |
| `state` : lampes                                                              | ← appareil | `apparatus/lights`                                                                       |
| `state` : cartons P                                                           | ← appareil | `apparatus/uw2f` (ordinal 0 à 5, même lecture que Cyrano)                                |
| `state` : interventions médicales                                             | ← appareil | `apparatus/medical` (chaque début compte une intervention)                               |
| `state` : Id des tireurs, inversion gaucher                                   | ← appareil | `apparatus/fencers`                                                                      |
| `state` : remplaçant                                                          | ← appareil | `apparatus/control` `RESERVE`                                                            |
| `next` / `prev`                                                               | ← appareil | `apparatus/control` `NEXT` / `PREV`                                                      |
| Fin proposée                                                                  | ← appareil | `apparatus/control` `END` et `apparatus/state` `E` : une seule fin transmise au PisteHub |
| Liaison en ligne / hors ligne                                                 | ← broker   | `apparatus/connection` (dernière volonté)                                                |

- L'appareil publie son état par morceaux : le pilote tient l'état complet de chaque piste et le
  transmet entier au `PisteHub` à chaque changement.
- `apparatus/score` ne porte pas les Id : le pilote reprend ceux du dernier affichage envoyé,
  puis ceux d'`apparatus/fencers`. Le PisteHub rapproche les côtés par Id : une inversion faite
  par l'arbitre est suivie ; un Id inconnu donne BAD MATCH et la fin reçoit `NAK`.
- Id OPP2 complets (aucune troncature, contrairement aux 8 caractères de Cyrano).
- Nation : code CIO à 3 lettres seulement ; un club ou une ligue part dans `club_abbr`.
- Doublons QoS 1 : `seq` déjà vu pour un émetteur (piste + rôle) → message écarté. `seq` plus
  petit avec `ts` plus récent → redémarrage de l'appareil, compteur repris (spéc. § 27).
- Reprise après coupure : au démarrage du pilote, les messages retenus de l'appareil (`state`,
  `score`, `clock`…) sont relus ; au retour en ligne, le PisteHub renvoie le match courant.
- Télécommande : `remote/control` `BEGIN` / `HALT` / `RESET` / `VALIDATE` sont destinés à
  l'appareil et ignorés par BellePoule.
- Messages sans équivalent dans le modèle commun, ignorés : `blade_contact`, `video_review`,
  `scoresheet/*`.

## IPC (`window.electronAPI.opp2`)

| Canal                                        | Rôle                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `opp2:start({ port? })`                      | Démarre le broker (port 1883 par défaut) et le pilote.                                           |
| `opp2:stop`                                  | Annonce le départ de BellePoule, arrête le broker.                                               |
| `opp2:isRunning`                             | Broker démarré ?                                                                                 |
| `opp2:setPistes([{ piste, arena?, mode? }])` | Table des pistes OPP2 (`master` / `display` / `manual`).                                         |
| `opp2:getStatus`                             | Broker, clients connectés, pistes (liaison, appareil, firmware), pistes vues mais non déclarées. |

Le `PisteHub` reste branché tant que Cyrano ou OPP2 est en service.

## Tests

- `mqttPacket.test.ts`, `mqttBroker.test.ts` : codec, retenus, dernière volonté, authentification,
  droits de publication.
- `driver.test.ts` : conversions, doublons, fin unique, affichage, inversion gaucher, reprise,
  routage Cyrano + OPP2.
- `e2e.test.ts` : broker TCP réel, appareil simulé sur la piste 3, piste Cyrano déclarée à côté :
  affichage, touches, `END` → `ACK`, `NEXT`, égalité → `NAK`, coupure, retour en ligne.

## Reste à faire (#1960)

1. Écran : colonne **Protocole** dans la table des appareils, réglages du broker, persistance de
   la table des pistes OPP2.
2. `software/record` (liste des matchs de la piste, résultats confirmés), `software/uw2f`.
3. Simulateur et télécommande web en mode OPP2 (`npm run cyrano:sim`, `cyrano:remote`).
4. Demande de vidéo, motifs de cartons saisis par la feuille de match (`scoresheet/event`).
5. Sécurité : TLS (8883), identifiants par appareil, droits par rôle (crochets du broker déjà en
   place), broker externe (client `mqttClient.ts` à brancher sur `Opp2Bus`), appairage par
   certificat (spéc. § 30.5).
