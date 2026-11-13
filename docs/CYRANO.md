# Appareils de piste — protocole Cyrano (EFP1 / EFP1.1)

> État (#1720) : codec, serveur UDP, supervision, simulateur, panneau de configuration et
> raccordement aux arènes en **mode appareil maître** (score, cartons, chrono, NEXT,
> END → ACK / NAK). Restent : PREV, modes « afficheur » et « manuel » par piste, bandeau
> appareil dans la vue arbitre, cartons P, équipes.

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
| `endValidation.ts` | `validateCyranoEnd(info)` → `{ ok }` ou `{ ok: false, reason }` (`not_ending`, `missing_fencers`, `missing_scores`, `tie_without_priority`) ; `cyranoResult(info)` → scores et vainqueur **par Id**. |
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
| `INFO` d'autres tireurs que ceux du match (BAD MATCH) | ignoré, journalisé |
| `INFO` en `E` | état final appliqué, puis `ACK` et clôture du match ; `NAK` si fin invalide ou BAD MATCH ; END répété après clôture → nouvel `ACK` sans réenregistrement |
| `NEXT` | match suivant seulement si le match de l'arène est terminé (ou absent) ; sinon `DISP` du match courant (pas d'abandon silencieux) |
| Changement de match (file, vue arbitre, DT) | `DISP` ; jamais de `DISP` d'un match terminé |
| Correction de score sur la tablette | `DISP` avec les scores corrigés (pas d'écho pour les scores venus de l'appareil) |

Limites : égalité avec priorité et abandon / exclusion sont acquittés mais seul le score est
enregistré (vainqueur non transmis) ; numéro de match toujours `1` dans le `DISP`.

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
cours : un DISP des mêmes tireurs corrige les scores), passe en W à la réception d'un ACK. Commandes clavier : `next`, `prev`, `begin`, `go`, `halt`, `end`,
`r+` / `l+` / `r-` / `l-` (touches), `yr` / `yl` (jaune), `rr` / `rl` (rouge),
`pr` / `pl` / `pn` (priorité), `ar` / `al` (abandon), `swap` (inversion), `reset`, `show`, `quit`.

Déclarer la piste côté serveur avec l'IP `127.0.0.1` et le port du simulateur (`--port`).

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
   - **Une seule validation de fin** : `endValidation.ts`, `scoreValidation.ts` et le calcul du
     vainqueur de `matchRoutes.ts` fusionnés ; contrôle de la limite de score de l'épreuve.
   - **Reprise de l'état des arènes** au redémarrage (`saveArenaState` est écrit mais jamais relu).
   - **Chrono tenu côté serveur** en individuel, alimenté par la source maîtresse (appareil ou
     tablette) : référence pour la tablette en miroir.
2. Pilote Cyrano en lecture (mode afficheur), supervision dans l'interface.
3. Télécommande : NEXT / PREV via `arenaQueue`, END → ACK / NAK → `matchFinish`, alerte BAD MATCH.
   - PREV suppose une fonction « match précédent », absente de `arenaQueue` aujourd'hui ;
     fenêtre de correction bornée (cf. Engarde : refus au-delà de 3 min ou si le match est verrouillé).
4. Interface : table des pistes enregistrée en base, profils constructeur, format des noms.
   - Actions de secours par piste : ACK forcé, passage en manuel, NEXT envoyé depuis le poste,
     remise à zéro de l'affichage.
   - Ajout de pistes en lot, import / export de la liste, mur de pistes (mini-vues en grille).
   - Écoute limitée à l'interface réseau choisie ; journal des trames exportable et rejouable
     dans le simulateur.
5. Vue arbitre : bandeau appareil, choix de match → DISP.
6. Cartons P, équipes (`Type=T`, relais, remplaçant).

Questions encore ouvertes : rattachement des sous-arènes (`arena3s2`) à un appareil ;
second poste BellePoule en secours (maître / esclave, cf. Fencing Fox).
