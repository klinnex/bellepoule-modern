# Appareils de piste — protocole Cyrano (EFP1 / EFP1.1)

> État : **socle livré** (#1720, étape 1). Le codec, le serveur UDP, la supervision et le
> simulateur existent ; le raccordement aux arènes (`/arene{N}`), la télécommande
> (NEXT / PREV / END → ACK / NAK) et l'interface de configuration arrivent dans les étapes suivantes.

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
| `names.ts` | `transliterate` (alphabet latin seul), `formatCyranoName(nom, prénom, 10 \| 12 \| 15 \| 20)` → `MARTIN P`, `formatCyranoNat` (3 caractères). |
| `disp.ts` | `buildDisp(match)` : descripteur neutre (phase, poule/tableau, n° de match, tireurs droit/gauche) → champs d'un `DISP`. Laser et CUSTOM : arme non transmise. `EMPTY_DISP` = « aucun match disponible ». |
| `endValidation.ts` | `validateCyranoEnd(info)` → `{ ok }` ou `{ ok: false, reason }` (`not_ending`, `missing_fencers`, `missing_scores`, `tie_without_priority`) ; `cyranoResult(info)` → scores et vainqueur **par Id**. |
| `server.ts` | `CyranoServer` : socket `dgram`, table des pistes (`setPistes`), liste blanche d'IP, HELLO toutes les 15 s, version du protocole par piste (`auto` = celle de la dernière trame reçue), supervision, journal borné des trames, événements `info` / `next` / `prev` / `status` / `unknown`, envois `sendDisp` / `sendAck` / `sendNak`. |

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

Le simulateur répond aux HELLO par un INFO complet, installe les DISP en état W, passe en W à
la réception d'un ACK. Commandes clavier : `next`, `prev`, `begin`, `go`, `halt`, `end`,
`r+` / `l+` / `r-` / `l-` (touches), `yr` / `yl` (jaune), `rr` / `rl` (rouge),
`pr` / `pl` / `pn` (priorité), `ar` / `al` (abandon), `swap` (inversion), `reset`, `show`, `quit`.

Déclarer la piste côté serveur avec l'IP `127.0.0.1` et le port du simulateur (`--port`).

## 4. Suite prévue (#1720)

1. Socle arènes : source d'entrée et numéro de séquence (`ArenaInputGate`), validation unifiée.
2. Pilote Cyrano en lecture (mode afficheur), supervision dans l'interface.
3. Télécommande : NEXT / PREV via `arenaQueue`, END → ACK / NAK → `matchFinish`, alerte BAD MATCH.
4. Interface : table des pistes enregistrée en base, profils constructeur, format des noms.
5. Vue arbitre : bandeau appareil, choix de match → DISP.
6. Cartons P, équipes (`Type=T`, relais, remplaçant).
