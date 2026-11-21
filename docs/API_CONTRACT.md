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
| `generatePools` | commande — tirage par le moteur, ou composition préparée par le DT (`composition`), tour courant ; `PoolsGenerated` ([ADR-0017](adr/0017-projections-etat-epreuve.md)) | `generate_pools` |
| `addPoolFencer` | commande — tireur ajouté à une poule lancée, un match contre chacun ; `PoolFencerAdded` | `add_pool_fencer` |
| `closePoolRound` | commande — clôture du tour : qualifiés, éliminés, tour archivé avec son appel ; `PoolRoundClosed` | `close_pool_round` |
| `generateTableau` | commande — tableau planifié par le moteur, ou placement calculé par l'écran (`composition`) ; `TableauGenerated` | `build_bracket` (nom 2.0 conservé) |
| `withdrawFencer` | commande — abandon, forfait, exclusion (carton noir) selon la phase ([ADR-0016](adr/0016-retrait-reintegration-tireur.md)) | `withdraw_fencer` |
| `reinstateFencer` | commande — annule un retrait depuis l'instantané | `reinstate_fencer` |
| `setRefereeingSettings` | commande (`referees:write`) — réglages d'affectation, fusion côté moteur ([ADR-0014](adr/0014-affectation-arbitres-moteur-unique.md)) | `set_refereeing_settings` |
| `assignReferees` | commande (`referees:write`) — arbitres des poules par le moteur unique | `assign_referees` |
| `assignReferee` | commande (`referees:write`) — arbitre d'une poule à la main, neutralité signalée | `assign_referee` |
| `getMatchCards` | requête | — |
| `getCardsByMatchIds` | requête | — |
| `getCompetitionEvents` | requête | `get_competition_events` |
| `getCompetitionState` | requête — état de l'épreuve tenu par le moteur, révision du journal ([ADR-0017](adr/0017-projections-etat-epreuve.md)) | — |
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
| `recordScore` avec `specialStatus` | en plus `FencerWithdrawn` (même `commandId`) |
| `generatePools` | `PoolsGenerated` (tour, poules, tireurs, pistes, ordre des matchs : rejouable sans graine) |
| `addPoolFencer` | `PoolFencerAdded` (poule, tireur, matchs ajoutés dans l'ordre) |
| `closePoolRound` | `PoolRoundClosed` (tour, qualifiés dans l'ordre, éliminés, nombre de qualifiés) |
| `generateTableau` | `TableauGenerated` (taille, petite finale, « toutes les places », placement complet) |
| `withdrawFencer` | `FencerWithdrawn` ; au tableau, `TableauMatchDecided` (et `TableauCompleted`) |
| `reinstateFencer` | `FencerReinstated` |

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

**Un fait, un chemin** ([ADR-0005](adr/0005-journal-un-fait-un-chemin.md)) : le pointage de l'écran
(bouton « Pointer », tout pointer / dépointer) passe uniquement par `checkIn` ; règle unique des statuts
spéciaux (`canToggleCheckIn`, `shared/domain/fencers`) ; succès affiché après la réponse. Les cartons
se lisent par `getMatchCards` / `getCardsByMatchIds`.

Scores : `recordScore` couvre tous les formats individuels (tours multiples, rapières, « toutes les
places ») ; les équipes gardent leur modèle de relais. Une seule écriture pour :

- l'écran : saisie en poule et au tableau (tableaux de classement compris) par `useRecordScore`,
  après écriture de la sauvegarde en attente ; l'écran relit la session (`session:changed`) ;
- les tablettes : fin de match (`finishArenaMatch`, fin hors arène) et feuille de poule, par
  `recordFinishedScore` (`src/main/remote/scoreCommand.ts`, `invokeCommandSync`) ; l'événement
  `match:finished` porte `recorded: true` et l'écran n'applique plus le score lui-même ;
- les appareils de piste (Cyrano, OPP2), par la même fin de match (source `cyrano`). L'ACK
  attend la commande : le score est contrôlé par `recordScore` en simulation (`checkArenaFinish`)
  et un refus (score maximal dépassé, égalité impossible…) vaut NAK, l'arbitre corrige puis
  valide à nouveau.

Journal des scores (`score_audit_log`) inchangé pour l'utilisateur : `ui`, nom de l'arbitre avec
l'adresse de la tablette, `device`, `mcp`. Le journal d'épreuve ne porte que l'identifiant de
l'arbitre (RGPD).

Restent sur le chemin historique (saisie locale de l'écran, ou écriture directe du serveur) : épreuves
par équipes, tableaux séparés après les poules, égalité sans vainqueur sur la feuille de poule, scores en cours et synchronisation hors ligne des
tablettes (`updateMatchScore`).

Retrait d'un tireur ([ADR-0016](adr/0016-retrait-reintegration-tireur.md)) : étape 1 faite, règle
unique `planWithdrawal` / `planReinstatement` (`shared/domain/fencers/withdrawal.ts`), commandes
`withdrawFencer` / `reinstateFencer`, instantané `fencer_abandons` tenu par le moteur.
Étape 2 faite : à l'écran, sortie médicale, forfait et réactivation depuis l'appel, statut changé
dans la fiche du tireur, abandon / forfait / exclusion (carton noir) d'un match de poule (par
`recordScore`, `blackCard` compris) et retrait au tableau passent par les commandes
(`useFencerWithdrawal`) ; repli local seulement hors moteur (`unsupported_format`, `unavailable`).
Étape 3 faite : carton noir de la tablette (fin de match, fin hors arène) et exclusion signalée
par l'appareil (statut E) passent par `recordScore` avec `specialStatus: 'exclusion'` et
`blackCard` (score et retrait sous une commande, contrôle avant l'ACK compris) ; abandon de
l'appareil confirmé par le DT par `withdrawFencer` ; abandon / forfait / exclusion sur la feuille
de poule par `recordScore` ; annulation du carton noir par `reinstateFencer`
(`reinstateByCommand`), le match interrompu étant rouvert par l'arène. `remote:fencer_excluded` et
`remote:fencer_reinstated` portent `recorded` : l'écran relit au lieu d'appliquer. Les trois PR
se mergent ensemble.

Projections ([ADR-0017](adr/0017-projections-etat-epreuve.md)) : étape 4a faite. L'écran lit
l'état par `getCompetitionState` et le relit quand `journal:appended` annonce une révision plus
récente que la sienne (ou sur `session:changed`, pour les écritures du moteur pas encore
journalisées) ; relectures coalescées, une seule par rafale. Étape 4b, palier « tirage » fait :
« Lancer les poules » envoie la composition préparée à `generatePools` (identifiants, pistes et
ordre des matchs conservés, tours multiples et rapières compris, vagues remises à zéro) ; le
moteur écrit tables, état et `PoolsGenerated`. La préparation (tirages, ajustements, annulation)
reste un brouillon de l'écran. Palier « composition » fait : un tireur ajouté à une poule lancée
passe par `addPoolFencer` (`PoolFencerAdded`). Palier « clôture de tour » fait : « Tour suivant »
passe par `closePoolRound` (simulation pour la confirmation, puis commande ; `PoolRoundClosed`).
Palier « tableau » fait : le tableau calculé à l'écran (`planTableau`, classement d'entrée de la
vue) part au moteur avec son placement complet (`generateTableau`, `TableauGenerated`) ; tableaux
séparés après les poules : tableau local. Palier « correction » fait : un score de poule corrigé
après le tirage passe par `recordScore` avec `correction { reason, rebuildTableau }` (motif au
journal des scores, `ScoreRecorded.correction`, tableau gardé ou retiré dans la même commande).
Restent : rapières ; état d'interface hors du bloc ; 4c ; 5.
