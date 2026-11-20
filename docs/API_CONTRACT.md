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
- Implémentation : `handlers` dans `src/main/api/engine.ts` (appel à `src/main/domain`).

## Transports

| Transport | Fichier | Entrée |
|---|---|---|
| IPC | `src/main/api/ipcAdapter.ts` | `api:invoke`, `api:subscribe` / `api:unsubscribe`, événements `api:event` |
| MCP | `src/main/api/mcpAdapter.ts` | `tools/call` |

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

## Opérations pilotes (lot 1)

| Opération | Nature | MCP |
|---|---|---|
| `checkIn` | commande | `check_in` |
| `recordScore` | commande | `record_score` |
| `getMatchCards` | requête | — |
| `getCardsByMatchIds` | requête | — |
| `onCompetitionEvents` | abonnement | — |

Lots suivants : migration de l'écran par domaine (2), `WsClient` + adaptateur WebSocket (3),
`PlatformServices` (4), pages distantes (5).
