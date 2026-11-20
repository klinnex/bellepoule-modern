# Contrat d'API unique (#1981)

Chaque opération est décrite **une seule fois** dans `src/shared/api/contract.ts` (schémas zod).
L'IPC Electron et les outils MCP en sont dérivés ; le WebSocket suivra (lot 3).

## Déclarer une opération

```ts
// src/shared/api/contract.ts
recordScore: command({
  description: '…',
  input: z.object({ competitionId: Id, matchId: Id, scoreA: z.number().int(), … }),
  output: z.looseObject({ dryRun: z.boolean(), kind: z.enum(['pool', 'bracket']) }),
  permission: 'score:write',
  mcp: { name: 'record_score', title: 'Saisir un score', idempotent: true },
}),
```

- `command` : écriture ; `query` : lecture ; `subscription` : flux d'événements.
- `mcp` (facultatif) : outil MCP généré. Commande → outil d'écriture (si « Autoriser l'écriture »),
  requête → outil de lecture. Schéma JSON tiré de zod ; `npm run docs:mcp` le documente.
- Implémentation : `handlers` dans `src/main/engine/api/engine.ts` (appel à `src/main/engine/commands`).

## Transports

| Transport | Fichier | Entrée |
|---|---|---|
| IPC | `src/main/engine/api/ipcAdapter.ts` | `api:invoke`, `api:subscribe` / `api:unsubscribe`, événements `api:event` |
| MCP | `src/main/engine/api/mcpAdapter.ts` | `tools/call` |

Même validation partout. Erreur : `ApiError { code, message }`.

| Code | Cas |
|---|---|
| `invalid_input` | entrée refusée par le schéma (`Entrée invalide pour « op » — champ : …`) |
| `unknown_operation` | opération absente du contrat, ou abonnement appelé en commande |
| code métier | `DomainError` du domaine (`competition_not_found`, `score_above_max`…) |
| `internal` | autre erreur (journalisée) |

En MCP, le message devient `message (code)` dans un résultat `isError`.

## Écran

```ts
const client = useBpmClient();           // src/renderer/api/BpmClientContext.tsx
await client.call('checkIn', { competitionId, fencers: ids, present: true });
const cards = await client.query('getMatchCards', { matchId });
const off = client.subscribe('onCompetitionEvents', { competitionId }, e => …);
```

`BpmClientProvider` (monté dans `index.tsx`) fournit `IpcClient`. Hors React : `defaultBpmClient`.
Ne plus ajouter d'appel direct à `window.electronAPI` pour une opération du contrat.

## Opérations

| Opération | Nature | MCP |
|---|---|---|
| `checkIn` | commande | `check_in` |
| `recordScore` | commande | `record_score` |
| `setRefereeingSettings` | commande (`referees:write`) — réglages d'affectation, fusion côté moteur ([ADR-0014](adr/0014-affectation-arbitres-moteur-unique.md)) | `set_refereeing_settings` |
| `assignReferees` | commande (`referees:write`) — arbitres des poules par le moteur unique | `assign_referees` |
| `assignReferee` | commande (`referees:write`) — arbitre d'une poule à la main, neutralité signalée | `assign_referee` |
| `getMatchCards` | requête | — |
| `getCardsByMatchIds` | requête | — |
| `getCompetitionEvents` | requête | `get_competition_events` |
| `getMatchHistory` | requête | — |
| `onCompetitionEvents` | abonnement | — |

Lots suivants : migration de l'écran par domaine (2), `WsClient` + adaptateur WebSocket (3),
`PlatformServices` (4), pages distantes (5).

## Journal des événements par épreuve (#1980)

Table `competition_events` (migration 46, format [ADR-0007](adr/0007-format-evenement.md)) :
`event_id` (UUID, clé, stable entre postes), `command_id` (commun aux événements d'une commande),
`competition_id`, `revision` (ordre local, croissant par épreuve, unique avec l'épreuve), `type`
(fait au passé), `schema_version`, `payload` (JSON, identifiants seulement), `author`, `source`
(`screen`, `mcp`, `tablet`, `cyrano`, `opp2`, `engine`), `at`. Ajout seul
(`src/database/repos/eventLogRepo.ts`). Les tables actuelles et `session_state` restent la
lecture : le journal s'écrit **en plus**, dans la même transaction (`src/main/engine/commands/eventLog.ts`).

Types et charges : **`src/shared/api/events.ts`** (union zod `JournalEventBodySchema`, constantes
`JOURNAL_EVENT`). Le moteur n'écrit que ces types ; `getCompetitionEvents` / `getMatchHistory` rendent
des `JournalEvent` typés (`eventId`, `commandId`, `revision`, `schemaVersion`, `author`, `source`, `at`).
Faire évoluer une charge : nouvelle `schemaVersion` + nouveau membre de l'union ; un événement stocké
ne se réécrit jamais.

**Idempotence** : toute commande accepte `commandId` (choisi par l'appelant, UUID). Rejouée avec le
même identifiant (renvoi après une coupure), elle n'écrit rien et est refusée par
`command_already_applied`, `data: { revision, commandId }` — à traiter comme un succès. Sans
`commandId`, le moteur en génère un par commande.

| Commande | Événements |
|---|---|
| `checkIn` | `FencerCheckedIn` / `FencerCheckedOut` (un par tireur modifié) |
| `recordScore` (poule) | `ScoreRecorded`, puis `PoolCompleted` si la poule se termine |
| `recordScore` (tableau) | `ScoreRecorded`, `TableauMatchDecided`, `TableauCompleted` en fin de tableau |

- Source : `CommandContext.actor` (IPC : `screen` ; MCP : `mcp`, auteur `agent` ; défaut `engine`).
- Une commande qui écrit rend `revision` et diffuse `{ type: 'journal:appended', competitionId, revision }`
  aux abonnés `onCompetitionEvents`. `dryRun` n'écrit rien.
- `expectedRevision` (optionnel) : révision périmée → `ApiError` `revision_conflict`,
  `data: { revision, missing }` (200 événements manquants au plus ; au-delà, `getCompetitionEvents`).
  Contrôle, écritures et ajout au journal forment **une seule transaction** (`runCommand`,
  [ADR-0006](adr/0006-expected-revision.md)) : aucune écriture ne s'intercale, un refus ou une erreur
  annule tout. Une commande est donc **synchrone** (un `await` est refusé). Portée : seules les
  commandes du contrat sont détectées ; les écritures de l'écran et des tablettes qui n'y passent pas
  encore ne changent pas la révision (#1980, « un fait, un chemin »).
- Resynchronisation : `getCompetitionEvents { competitionId, since }`. Audit d'un match :
  `getMatchHistory { competitionId, matchId }`.
- Purge RGPD et archive `.bpm` : suivent `competition_id` comme les autres tables.

Étapes suivantes : tablettes et Cyrano par les commandes (2), écran par commandes (3),
mise à jour par diffusion (4), `session_state` en cache reconstruit (5).
