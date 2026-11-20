# ADR-0012 — Formule : modèle dans `shared/domain/formula`, validée par le moteur à chaque écriture

- **Statut** : Proposée
- **Date** : 2026-11-20
- **Tickets** : #2013, #2022, #1948

## Contexte

L'étape A de #2013 (#2022) a ajouté :

- **`renderer/components/formula/formulaDraft.ts`**. Ce fichier contient :
  - le modèle d'édition de la formule ;
  - l'ajout et le retrait de tour, avec décalage des qualifiés ;
  - les règles du Tour Quest ;
  - la conversion en réglages plats (`draftToSettings`).
  
  Ce sont des règles pures, placées dans le renderer.
- **Les plafonds** `MAX_POOL_ROUNDS = 5` et `DEFAULT_POOL_SIZE_MIN/MAX = 5/7`, dupliqués dans
  `useCompetitionSession.ts:148-149`.
- **`poolSizeMin` / `poolSizeMax`**, ajoutés aux réglages plats (`shared/types/index.ts:683-684`).
  Ce sont précisément ceux que l'étape C de #2013 veut rendre dérivés de la formule.

S'y ajoutent trois problèmes de cohérence :

- **Validation à la création seulement.** `validateCompetitionSettings`
  (`database/validation.ts:179`) ne s'exécute qu'à la création (`competitionRepo.ts:13`).
  `updateCompetition` (`competitionRepo.ts:74`) ne valide rien. Seul l'écran protège la formule ;
  le MCP ou une restauration `.bpm` peuvent écrire n'importe quoi.
- **Trois sources pour la taille de poule** : la formule, `poolPrepParams` en session, et un
  `useEffect` qui recopie l'une dans l'autre (`useCompetitionCore.ts:158-174`).
- **Défauts dispersés.** Création et repli sont deux fonctions
  (`shared/utils/defaultCompetitionSettings.ts`).

## Décision

- Le modèle de formule vit dans **`src/shared/domain/formula/`** :
  - le brouillon (`FormulaDraft`) ;
  - les opérations de la frise ;
  - la cohérence (`formulaCoherence`) ;
  - la conversion vers les réglages ;
  - les plafonds et les valeurs par défaut (une seule déclaration).
  
  `formulaDraft.ts` y est déplacé au **lot 3 de #1979**, sans changement de comportement.
- **Une seule fonction de validation** de la formule, dans le domaine
  (`validateFormulaSettings`). Elle est appelée par le moteur **à chaque écriture** de réglages :
  - à la création ;
  - à la modification ;
  - à l'import `.bpm` et au mode headless.
  
  L'écran l'appelle pour afficher les erreurs, mais n'est plus le seul garde-fou.
- **Rattrapage, avant la commande dédiée** : `competitionRepo.updateCompetition` appelle
  `validateCompetitionSettings` quand `settings` est modifié. Le contrôle est déplacé dans le
  moteur quand la commande `updateCompetitionSettings` existe
  ([ADR-0008](0008-nommage-contrat.md)).
- **La taille de poule a une seule source : la formule.** `poolPrepParams` en est dérivé à
  l'ouverture de la préparation des poules ; il n'est pas recopié par un `useEffect`.
  - L'opérateur peut ajuster la taille pour un tirage donné. Cet ajustement est une valeur
    d'écran, il ne réécrit pas la formule.
- **Plus de nouveau réglage plat** dans `CompetitionSettings` pour la formule.
  - `poolSizeMin` / `poolSizeMax` restent jusqu'à l'étape C de #2013, qui les dérive de la
    formule par phase.
  - Les défauts de création et de repli convergent dans `shared/domain/formula/defaults.ts` : une
    fonction, un paramètre `mode: 'create' | 'fallback'`.

## Conséquences

- L'étape B de #2013 (et suivantes) reste gelée jusqu'au déplacement (lot 3) et à la
  convergence des poules (lot 4).
- La validation à la modification peut refuser des épreuves 2.0 dont les réglages sont hors
  bornes.
  - Le rattrapage valide **seulement les champs modifiés** ;
  - un test couvre une épreuve migrée avec des réglages anciens.
- `defaultRanking` 0 → 9999 et la 3ᵉ place d'« À la carte » à `true` : les défauts sont alignés
  dans la PR de convergence, avec un test qui fige les valeurs actuelles avant le changement.

## Alternatives écartées

- **Laisser `formulaDraft.ts` dans le renderer jusqu'à l'étape C** : l'étape C le réécrirait
  dans le renderer, et le MCP ne pourrait pas éditer une formule.
- **Valider dans `database/validation.ts` pour toujours** : la persistance ne doit pas porter de
  règle métier ([ADR-0002](0002-couches-et-dependances.md)). C'est acceptable comme rattrapage,
  pas comme cible.
