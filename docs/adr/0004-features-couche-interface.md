# ADR-0004 — `src/features` est une couche d'interface

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #1979 (lots 2, 3 et 5)

## Contexte

`src/features` mélange deux natures de code :

- **Des règles pures importées par `main` et `shared`** (4 fichiers, hors tests) :
  - `main/remote/teamArena.ts` et `main/remote/teamRelayDevice.ts` importent
    `features/teams/utils` (`teamCalculations`, `laserArenaCalculations`, `teamRelayLive`) ;
  - `shared/utils/pdfExport/teamPdf.ts` importe `features/teams/types` ;
  - `shared/utils/cardSystem.ts` importe `features/penalties/types`.
- **De l'interface React** :
  - 10 fichiers de `features/rapieres` importent `renderer/components/Toast` et d'autres
    composants ;
  - 2 fichiers de `features/analytics` importent le renderer ;
  - plus les stores Zustand de chaque module.

Le ticket #1979 voulait interdire à `src/features` d'importer le renderer. Mais la moitié de
`features` est de l'interface : l'interdiction obligerait à tout déplacer d'un coup. Le lot 5
(« rapières, XS ») était donc sous-estimé.

## Décision

- On classe `src/features` comme **couche d'interface**, au même rang que `src/renderer` :
  - elle peut importer le renderer, `shared` et ses propres modules ;
  - **`main`, `shared` et `database` n'importent plus `features`**.
- Les règles pures de `features` partent dans `src/shared/domain` (lot 3) :
  - `features/teams/utils` (`teamCalculations`, `teamCardEscalation`, `teamRelayLive`,
    `laserArena*`), `teams/types` et `teams/services/teamBracketService` vont dans
    `shared/domain/teams` ;
  - `features/penalties/types` et `penalties/utils/penaltyUtils` vont dans
    `shared/domain/penalties`.
- Les stores et les composants restent dans `features`.
- **Lot 5** : rapières et analytics.
  - Les notifications sont injectées dans les hooks (un paramètre `notify`), au lieu d'un import
    de `Toast`.
  - Les composants restent dans `features`.

## Conséquences

- La règle ESLint du lot 2 :
  - `src/main`, `src/shared` et `src/database` n'importent ni `src/renderer` ni `src/features` ;
  - `src/features` n'est **pas** visé par l'interdiction d'importer le renderer.
- Le compteur `rendererImports` (13) mesure les imports **interdits**. Les 12 imports de
  `features` vers le renderer sortent donc du compteur : après le lot 2, il vaut 1
  (`sport.ts`), puis 0 au lot 3.
  - Un second compteur, `featuresImports`, mesure les imports de `features` depuis
    `main`/`shared`/`database` (aujourd'hui 4 fichiers). Il suit le même cliquet, jusqu'à 0 au
    lot 3.
- Le mot « feature » ne garantit plus rien sur la pureté du code : une règle trouvée dans
  `features` est une dette à déplacer.

## Alternatives écartées

- **Interdire à `features` d'importer le renderer** — on déplace 12 fichiers d'interface sans
  gain fonctionnel, ou on maintient une liste d'exceptions qui ne baisse jamais.
- **Supprimer `src/features` et tout ranger dans `renderer` + `shared/domain`** — c'est juste
  sur le fond, mais c'est un déplacement massif pendant la 3.0. Ce sera possible plus tard, par
  module, quand un module est retouché.
