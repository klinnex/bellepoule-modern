# ADR-0003 — `src/main/domain` devient la couche d'application `src/main/engine/commands`

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #1979 (lot 3), #1880, #1981

## Contexte

`src/main/domain` est né avec le MCP (#1880). Il contient `sport.ts`, `checkIn.ts`,
`competitions.ts`, `exportResults.ts`, `settings.ts`, `files.ts`, `sessionView.ts` et
`eventLog.ts`. Ces fichiers :

- lisent et écrivent la base via `DomainContext.db` (`context.ts`, qui dépend de
  `DatabaseManager`) ;
- écrivent le journal ;
- lisent le système de fichiers (`files.ts`) ;
- importent le renderer (`sport.ts`).

Ce sont des **cas d'usage**, pas un domaine pur. Le nom entre en conflit avec
[ADR-0002](0002-couches-et-dependances.md) : on ne peut pas interdire la base dans « le domaine »
si un dossier `domain` en dépend.

## Décision

- On réserve le mot **domaine** au code pur de `src/shared/domain`.
- Au **lot 3 de #1979**, on renomme `src/main/domain` en **`src/main/engine/commands`**.
  - `DomainContext` devient `CommandContext`, et `DomainError` devient `CommandError`.
    Ses codes suivent [ADR-0009](0009-codes-erreur.md).
  - `src/main/api` devient `src/main/engine/api` (moteur du contrat, adaptateurs).
- Une commande :
  1. valide l'état ;
  2. appelle des fonctions de `shared/domain` ;
  3. écrit (tables et journal) dans **une** transaction ;
  4. rend un résultat.
  
  Elle ne contient pas la règle elle-même.
- Le renommage se fait **en une seule PR**, sans changement de comportement. Les imports sont
  mis à jour mécaniquement.

## Conséquences

- La règle ESLint « pas de `react`/`electron`/`database` » vise `src/shared/domain`, pas
  `src/main/engine/commands`.
- `CLAUDE.md`, `docs/API_CONTRACT.md` et `docs/MCP.md` sont mis à jour dans la PR du renommage.
- Les PR ouvertes qui touchent `src/main/domain` à ce moment-là devront être rebasées. Le
  renommage se fait donc pendant le gel de #1980, #1981 et #2013.
- Jusqu'au lot 3, `src/main/domain` garde son nom. On n'y ajoute pas de nouvelle règle : une
  règle nouvelle va dans `shared/domain`, et la commande l'appelle.

## Alternatives écartées

- **Garder `src/main/domain`** — deux « domaines » de natures opposées, et une règle de
  dépendance impossible à écrire simplement.
- **`src/main/application`** — terme juste mais abstrait. `engine/commands` désigne ce que le
  code fait et s'aligne sur le vocabulaire du contrat (`command`, `query`).
- **Renommer tout de suite (lot 1)** — conflits avec les rattrapages en cours (pointage,
  révision) ; on renomme quand ces PR sont mergées.
