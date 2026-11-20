# ADR-0010 — Un seul bus : le journal d'un côté, les signaux de changement de l'autre

- **Statut** : Proposée
- **Date** : 2026-11-20
- **Tickets** : #1980, #1981, #2020, #2023

## Contexte

Trois notions portent aujourd'hui le nom d'« événement » :

| Nom | Où | Nature |
|---|---|---|
| `CompetitionEvent` | `database/repos/eventLogRepo.ts`, `shared/api/contract.ts` | Fait métier **persisté** dans le journal |
| `CompetitionEventPayload` | `main/api/events.ts` | Message du bus en mémoire : `{ type, competitionId?, revision? }` |
| Canal `competition:event` | `main/ipc/dbHandlers.ts:20-25` (`emitCompetitionEvent`) | Envoi IPC direct à chaque fenêtre (`fencers:changed`, `matches:changed`, événements d'écran MCP) |

`emitCompetitionEvent` fait les deux à la fois : il publie sur le bus et il envoie sur
`competition:event`. L'abonnement `onCompetitionEvents` du contrat mélange donc :

- des signaux d'invalidation (« les tireurs ont changé ») ;
- un signal de journal (`journal:appended` + révision).

Un client ne sait pas lequel des deux fait foi.

## Décision

- On réserve le mot **événement** au journal : `JournalEvent` ([ADR-0007](0007-format-evenement.md)).
- Le bus en mémoire (`main/api/events.ts`) transporte des **signaux**, typés dans le contrat :

```ts
type ChangeSignal =
  | { kind: 'changed'; scope: 'fencers' | 'matches' | 'session' | 'referees' | …; competitionId?: string }
  | { kind: 'journal'; competitionId: string; revision: number };
```

- `CompetitionEventPayload` devient `ChangeSignal`, et `publishCompetitionEvent` devient
  `publishChange`.
- Deux abonnements dans le contrat :
  - `onCompetitionChanges` pour les signaux `changed`, qui servent à relire les données ;
  - `onJournalAppended` pour la révision, qui sert à relire le journal avec
    `getCompetitionEvents` depuis la dernière révision connue.
  
  `onCompetitionEvents` est retiré.
- **Un seul émetteur** : le bus. L'envoi IPC `competition:event` devient un abonné du bus dans
  l'adaptateur IPC. Il n'est plus appelé directement par les handlers. Il disparaît quand plus
  aucun écran ne l'écoute, c'est-à-dire quand le renderer passe par `client.subscribe` (#1981).
- Les signaux d'écran du MCP (`McpScreenEvent` : ouvrir un écran, mettre en surbrillance) ne
  sont pas des changements de données. Ils ont leur propre abonnement (`onScreenRequest`) et
  sortent de `CompetitionEventType`.
- Le contenu d'un signal ne fait jamais foi : le client relit par une requête. Seul le journal
  est une source de vérité.

## Conséquences

- La PR qui applique cette ADR renomme sans changer le comportement. Elle se fait avec le lot 3
  de #1979, quand les types d'événements passent dans le contrat.
- `docs/API_CONTRACT.md` et `docs/SOCKET_EVENTS.md` sont mis à jour. Le WebSocket des tablettes
  relaie les mêmes signaux (#1981, lot 3).
- Le cliquet `electronApiCalls` ([ADR-0002](0002-couches-et-dependances.md)) compte aussi les
  `onCompetitionEvent` du préload : ils baissent avec la migration des écrans.

## Alternatives écartées

- **Diffuser les événements du journal eux-mêmes sur le bus** : chaque abonné recevrait des
  charges utiles qu'il doit savoir appliquer, alors que la projection n'existe pas encore
  (#1980, étape 3). Un signal + relecture est plus simple et reste correct.
- **Garder `onCompetitionEvents` et documenter le mélange** : le nom resterait en collision avec
  le journal, et les clients continueraient de deviner.
