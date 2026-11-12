# Journée multi-épreuves

> Demande [#1714](https://github.com/klinnex/bellepoule-modern/issues/1714). Lot 1 : journée + arbitres partagés.

Plusieurs épreuves dans la même salle, le même jour, partagent les pistes et les arbitres.
Une **journée** regroupe ces épreuves sur un même poste (même base `bellepoule.db`).

## Ouvrir

Liste des compétitions → bouton **Journées**.

## Journée

| Champ | Rôle |
|---|---|
| Nom, date | Identification |
| Pistes de la salle | Nombre de pistes (registre partagé : lot suivant) |
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

## Pas encore fait

- Registre de pistes partagé (piste libérée par une épreuve → disponible pour les autres).
- Affichage public commun (kiosk de la journée).
- Pilotage de chaque épreuve depuis un poste différent.
