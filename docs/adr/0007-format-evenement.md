# ADR-0007 — Format d'événement du journal et migration 46

- **Statut** : Acceptée pour les principes (2026-11-20) ; Proposée pour le schéma détaillé
- **Date** : 2026-11-20
- **Tickets** : #1980, #1981, #1982, #2023

## Contexte

La migration 45 crée la table suivante :

```sql
competition_events (competition_id, revision, type, payload, author, source, at,
                    PRIMARY KEY (competition_id, revision))
```

Ce format présente cinq manques :

- **Pas d'identifiant d'événement.** La clé `(competition_id, revision)` est locale à un moteur
  et ne survit pas à la fusion de deux journaux (deux postes, #1982).
- **Pas d'identifiant de commande.** On ne peut ni regrouper les événements d'une même commande,
  ni annuler une commande, ni rejouer une commande sans doublon (idempotence).
- **Pas de version de charge utile.** Une charge qui évolue rend les anciens événements
  illisibles.
- **Types non typés.** Les types sont des chaînes déclarées dans `main` (`EVENT`,
  `main/domain/eventLog.ts:10-17`). Le contrat les expose en
  `type: string, payload: record<string, unknown>` : la commande est typée, l'événement ne l'est
  pas.
- **Diffusion limitée.** La migration 45 n'a été publiée que dans des pré-versions `dev`
  (`v2.0.1-dev.1968`, `v3.0.0-dev.1969` et suivantes), pas en stable (`main`).

## Décision

### Principes (acceptés)

- Un événement est un **fait accompli**, nommé au passé en PascalCase : `FencerCheckedIn`,
  `ScoreRecorded`, `PoolCompleted`.
- Sa charge utile porte des **identifiants seulement**, jamais de nom ni de donnée personnelle
  (RGPD, #1882).
- Les types et les charges sont **déclarés dans le contrat**, sous la forme d'une union zod
  discriminée sur `type`. Le moteur n'a pas de liste de chaînes à lui.
- Chaque événement porte `event_id`, `command_id` et `schema_version`.
- La **migration 46** applique ce format **avant la sortie de la 3.0**, après l'acceptation de
  cette ADR.

### Schéma (proposé)

```sql
-- Migration 46 : recrée la table (changement de clé primaire), recopie la 45
CREATE TABLE competition_events_v46 (
  event_id       TEXT PRIMARY KEY,          -- UUID v4, unique entre postes
  competition_id TEXT NOT NULL,
  revision       INTEGER NOT NULL,          -- ordre local, croissant par épreuve
  command_id     TEXT NOT NULL,             -- commune aux événements d'une commande
  type           TEXT NOT NULL,             -- PascalCase, au passé
  schema_version INTEGER NOT NULL DEFAULT 1,-- version de la charge de CE type
  payload        TEXT NOT NULL,             -- JSON, identifiants seulement
  author         TEXT,
  source         TEXT NOT NULL,             -- screen | mcp | tablet | cyrano | opp2 | engine
  at             TEXT NOT NULL,             -- ISO 8601 UTC
  UNIQUE (competition_id, revision)
);
CREATE INDEX idx_competition_events_command ON competition_events_v46 (command_id);
```

Les lignes de la migration 45 sont recopiées ainsi :

- `event_id` : un UUID neuf ;
- `command_id` : identique pour les lignes de même `(competition_id, at, source)`, qui
  proviennent d'un même `append` ;
- `schema_version = 1`.

Ensuite, l'ancienne table est supprimée et la nouvelle prend son nom.

Côté contrat, dans un nouveau fichier `src/shared/api/events.ts` importé par `contract.ts` :

```ts
export const JournalEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FencerCheckedIn'), schemaVersion: z.literal(1),
             payload: z.object({ fencerId: z.string() }) }),
  z.object({ type: z.literal('ScoreRecorded'), schemaVersion: z.literal(1),
             payload: z.object({ matchId: z.string(), scoreA: z.number(), scoreB: z.number(),
                                 winnerId: z.string().nullable() }) }),
  // …un membre par type
]);
```

Chaque événement exposé par `getCompetitionEvents` / `getMatchHistory` porte aussi `eventId`,
`commandId`, `revision`, `author`, `source` et `at`.

- **Idempotence** : une commande peut recevoir un `commandId` facultatif. Si le journal contient
  déjà ce `commandId`, le moteur rend la révision existante sans réécrire.
  - Le champ s'ajoute au contrat **dans la PR de la migration 46**.
  - Sans `commandId` fourni, le moteur en génère un.
- **Évolution d'une charge** : on incrémente `schema_version` et on ajoute un membre à l'union.
  Un lecteur sait lire toutes les versions d'un type. On ne réécrit jamais un événement stocké.
- `source` gagne `opp2` (#1960).

## Conséquences

- La migration 46 est la seule migration autorisée avant la 3.0 sans nouvelle ADR
  ([ADR-0011](0011-migrations-schema-3-0.md)). Elle est testée sur une base qui contient déjà
  des événements de la 45.
- `EVENT` (`main/domain/eventLog.ts`) disparaît : le moteur importe les types du contrat.
- `CompetitionEvent` (journal) devient `JournalEvent`, ce qui lève la collision de noms
  ([ADR-0010](0010-bus-evenements.md)).
- La fusion de journaux entre postes (#1982) reste à décider. `event_id` la rend possible, mais
  elle ne la règle pas.
- Les étapes 2 à 5 de #1980 restent gelées jusqu'à la migration 46 et au lot 3 de #1979.

## Alternatives écartées

- **Ajouter les colonnes par `ALTER TABLE` en gardant la clé `(competition_id, revision)`** —
  `event_id` ne serait pas la clé, et la fusion entre postes resterait bloquée par la clé locale.
- **Modifier la migration 45** — elle a déjà tourné sur les bases des pré-versions `dev`. Une
  migration publiée ne se modifie pas.
- **Horodatage hybride ou horloge vectorielle à la place de `revision`** — à décider avec #1982,
  pas avant. `revision` reste l'ordre local, simple et suffisant pour un seul poste.
- **Charge utile complète (noms, état après)** — elle violerait le RGPD (purge). Et l'événement
  dupliquerait l'état au lieu de le décrire.
