# ADR-0002 — Quatre couches, un seul sens de dépendance, le domaine pur dans `src/shared/domain`

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #1979

## Contexte

Une règle métier placée dans un écran ne sert qu'à cet écran. Dès que le MCP, les tablettes ou le
mode headless en ont besoin, on la copie, ou bien `main` importe le renderer.
C'est déjà le cas : `src/main/domain/sport.ts` calcule le tableau avec
`renderer/components/tableau/tableauCalculations.ts`, `tableauTypes.ts` et
`renderer/components/competition/competitionDerived.ts`.

État relevé sur `dev` à `53f8c170`, hors tests :

- **13 fichiers** hors renderer importent `src/renderer` :
  - `main/domain/sport.ts` ;
  - 10 fichiers de `features/rapieres` ;
  - 2 fichiers de `features/analytics`.
- **120 fichiers** du renderer appellent `window.electronAPI` directement.

#1979 posait une question : `src/shared/domain`, ou un paquet séparé (`packages/core`) ?

## Décision

On organise le code en couches :

| Couche | Dossier | Contenu | Interdit |
|---|---|---|---|
| Interface | `src/renderer`, `src/features` ([0004](0004-features-couche-interface.md)), `src/remote` | Vues, état d'écran, appels au client d'API | Règle métier, accès direct à la base |
| Moteur | `src/main` | Commandes ([0003](0003-main-domain-couche-application.md)), contrat d'API, serveurs, pilotes | Import de `renderer` ou de `features` |
| Domaine pur | `src/shared/domain` | Règles : tirage, placement, classement, fin de match, cartons, qualification, formule | React, Electron, `src/database`, Node (`fs`, `crypto`…), date système, `Math.random` non injecté |
| Persistance | `src/database` | Dépôts, migrations | Import de `renderer`, `features`, `main` |

Sens des dépendances :

```text
renderer, features ──▶ shared (domain, api, types, utils)
main ─────────────────▶ shared, database
database ─────────────▶ shared/types
shared/domain ────────▶ shared/types (rien d'autre de l'application)
```

- On place le domaine pur dans **`src/shared/domain`**, pas dans `packages/core`.
- Une fonction du domaine reçoit tout ce dont elle a besoin en paramètres : l'heure, le tirage
  aléatoire (graine ou générateur injecté), les réglages. Elle rend une valeur et n'écrit rien.
- `src/shared/utils` reste le lieu des utilitaires. Les règles métier qu'il contient
  (`poolCalculations`, `tableCalculations`, `cardSystem`, `matchEndValidation`, `suddenDeath`…)
  migrent vers `shared/domain` au fil des lots, sans réécriture.
- Une nouvelle règle métier naît dans `src/shared/domain`, jamais dans un composant ou un hook.

## Conséquences

- **Lot 2 de #1979** : la CI fait respecter la règle.
  - ESLint `no-restricted-imports` par dossier. Exception nommée pour `main/domain/sport.ts`
    jusqu'au lot 3.
  - Cliquet `check-quality-ratchet.js` : `rendererImports = 13` et `electronApiCalls = 120`.
    Ces compteurs ne peuvent que baisser.
- **Lot 3** : le tableau part dans `shared/domain/tableau` et le classement dans
  `shared/domain/ranking`. `sport.ts` n'importe plus le renderer.
- `shared/domain` doit rester utilisable dans le navigateur (pages `src/remote` à terme) : pas de
  dépendance Node.
- Un paquet séparé reste possible plus tard : si la règle de dépendance est tenue, extraire
  `shared/domain` est un déplacement de dossier.

## Alternatives écartées

- **`packages/core` (workspace npm)** — demande d'outiller le monorepo : workspaces, build
  séparé, alias Webpack et Vitest, packaging Electron. Le gain, une réutilisation hors Electron,
  n'a aucun client aujourd'hui.
- **Garder les règles dans `shared/utils`** — `utils` mélange formatage, export PDF et règles ;
  on ne peut pas y interdire Node ou le DOM sans casser l'existant.
- **Un domaine dans `src/main`** — le renderer n'y aurait pas accès sans IPC, alors que l'écran a
  besoin des règles pour l'aperçu (formule, tirage simulé).
