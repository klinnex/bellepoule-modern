# Journée multi-épreuves

> Demande [#1714](https://github.com/klinnex/bellepoule-modern/issues/1714). Lot 1 : journée + arbitres partagés. Lot 2 : pistes partagées + kiosk journée.

Plusieurs épreuves dans la même salle, le même jour, partagent les pistes et les arbitres.
Une **journée** regroupe ces épreuves sur un même poste (même base `bellepoule.db`).

## Ouvrir

Liste des compétitions → bouton **Journées**.

## Journée

| Champ | Rôle |
|---|---|
| Nom, date | Identification |
| Pistes de la salle | Nombre de pistes ; table des appareils Cyrano partagée par les épreuves (voir CYRANO.md § 2 quinquies) |
| Épreuves | Cases à cocher. Une épreuve appartient à une seule journée |

Supprimer une journée conserve les épreuves et leurs arbitres (liens retirés).

## Arbitres de la journée

- Saisis **une fois**, avec leurs **armes d'arbitrage** (fleuret, épée, sabre, sabre laser).
  Aucune arme cochée = toutes armes.
- Reportés dans chaque épreuve de leur arme : au rattachement de l'épreuve, ou via
  **Reporter dans les épreuves**.
  - fiche déjà liée → mise à jour (nom, club, licence, niveau) ;
  - fiche homonyme non liée (saisie avant la journée) → reprise et liée ;
  - sinon → créée, **non pointée** (pointage par épreuve, comme une saisie manuelle).
  - Aucune fiche supprimée : les affectations existantes restent.
- Lien technique : `referees.day_referee_id` → `event_day_referees.id`.

## Statut commun et conflits

Occupation calculée sur toutes les épreuves de la journée (rafraîchie toutes les 10 s) :

- poule **non terminée** dont l'arbitre (principal ou secondaire) est lié ;
- match de tableau **en cours** dont l'arbitre est lié.

Statut : **Libre**, ou **Piste X · Épreuve (Poule/Match N)**.

| Conflit | Condition |
|---|---|
| Plusieurs épreuves | Occupé dans au moins deux épreuves |
| Plusieurs pistes | Occupé sur au moins deux pistes d'une même épreuve |
| Arme | Affecté à une épreuve d'une arme non cochée |

Dans **Arbitres** de l'épreuve, un arbitre occupé dans une autre épreuve de la journée
porte la mention **Occupé ailleurs : …**.

## Données

Migration 22 :

- `event_days` (`id`, `name`, `date`, `strip_count`)
- `event_day_referees` (`id`, `event_day_id`, `first_name`, `last_name`, `club`, `license`, `category`, `weapons` = `"F,E"`)
- `competitions.event_day_id`, `referees.day_referee_id`

IPC : `window.electronAPI.eventDay.*` (`src/main/ipc/eventDayHandlers.ts`), dépôt
`src/database/repos/eventDayRepo.ts`, règles pures `src/shared/utils/eventDay.ts`.

## Pistes de la journée

L'onglet **Pistes** dans la fenêtre Journées affiche l'état de chaque piste numérotée (1 à N,
N = nombre de pistes de la salle), rafraîchi toutes les 5 s.

**Saisie distante ouverte** (au moins une épreuve) — temps réel, lu sur les serveurs distants
des épreuves (#1878) :

- **occupée** : une épreuve a une affectation en cours sur la piste (match non terminé, ou
  match suivant en file) ;
- **libre** : la piste est proposée au **travail en attente** des épreuves : poule sans piste,
  poule ou match de tableau en file derrière une piste occupée. Liste triée : travail sans piste,
  puis poules, puis les plus petits tableaux. **Affecter** installe la poule (tous ses matchs
  restants) ou le match sur la piste ; une piste occupée n'est jamais interrompue.
- **Affecter automatiquement les pistes libérées** (case, par journée) : toutes les 5 s, chaque
  piste libre reçoit la première proposition autorisée.
- **Réservation** par piste : épreuves autorisées, poules oui / non, tableau oui / non et
  « tableau de N et moins » (piste de finale). Par défaut tout est autorisé. Le clic et
  l'affectation automatique respectent la réservation.

Sans saisie distante ouverte : occupation prévue en base (poules en cours), sans proposition.

**Poule sans piste.** Quand une épreuve a plus de poules que de pistes dans sa plage (piste de
départ à piste de fin, hors pistes indisponibles), les poules en trop attendent une piste : le
serveur ne les place plus sur une piste masquée (sous la piste de départ), qui peut être celle
d'une autre épreuve de la journée. La saisie distante envoie le plan des pistes au serveur
avant de démarrer la séance. Ces poules sont proposées aux pistes libres de la journée.

**Piste hors de la plage de l'épreuve.** Une épreuve peut recevoir n'importe quelle piste de la
salle, sauf celles marquées indisponibles dans son plan des pistes (`canHostStrip`). À
l'affectation (`hostStrip`, `src/main/remote/arenaSetup.ts`) :

- piste au-delà de sa dernière arène : les arènes manquantes sont créées sans toucher aux
  existantes ; elles héritent du mot de passe de la dernière arène ; la séance est élargie ;
- piste sous sa piste de départ : le plan des pistes est élargi, la piste devient visible sur le
  kiosque et le tableau de bord de l'épreuve.

La plage de pistes saisie dans l'onglet Saisie distante de l'épreuve n'est pas modifiée : le DT
l'ajuste s'il veut retrouver la piste dans la grille des pistes de l'épreuve. La tablette de la
piste doit ouvrir l'adresse du serveur de l'épreuve qui la reçoit (un serveur par épreuve).

Une piste occupée affiche le détail lu en base (poule ou match en cours) quand il concerne
l'épreuve qui l'occupe, sinon le titre de l'épreuve.

Une poule déplacée garde sa piste quand le renderer renvoie la répartition des poules
(surcharge par match, `forcedPoolArena`). Tablettes et écrans restent ceux de l'épreuve (un
serveur par épreuve) ; les appareils Cyrano suivent l'épreuve de l'affectation (CYRANO.md § 2
quinquies).

Données : migration 37, `event_day_strip_rules` (`event_day_id`, `strip`, `rule` JSON) et
`event_days.auto_assign`. IPC : `eventDay.getStripBoard`, `assignStrip`, `setStripRule`,
`setAutoAssign` (`src/main/ipc/dayStripHandlers.ts`) ; logique `src/main/remote/dayStripBoard.ts`
et `stripHandover.ts` ; règles pures `src/shared/utils/stripRules.ts`.

IPC (occupation en base) : `window.electronAPI.eventDay.getStripOccupation(dayId)`.

## Kiosk journée

Page d'affichage public accessible à `/journee` sur le serveur distant (sans session requise).
Affiche :

- Nom et date de la journée.
- Liste des épreuves rattachées (titre + arme).
- Grille des pistes : libre ou occupée (poule/match + épreuve).

Rafraîchissement automatique toutes les 10 s.

API : `GET /api/journee-status` → `{ day, strips, competitions }`.

## Pas encore fait

- Pilotage de chaque épreuve depuis un poste différent (multi-poste réseau).
