# ADR-0008 — Nommage et forme des opérations du contrat

- **Statut** : Proposée
- **Date** : 2026-11-20
- **Tickets** : #1981, #2020

## Contexte

Le contrat (`src/shared/api/contract.ts`, #2020) compte 7 opérations. Les commandes sont
nommées comme des intentions (`checkIn`, `recordScore`). Les risques viennent de la suite :

- **Pente du CRUD.** 120 fichiers du renderer appellent encore `window.electronAPI`
  directement, et restent à migrer (#1981, lots 2 à 5). La pente naturelle serait de recopier `DatabaseManager` méthode par méthode
  (`updateFencer`, `updateMatch`). On obtiendrait des commandes sans règle, qui contournent le
  domaine.
- **Sorties ouvertes.** `recordScore` rend un `z.looseObject` (`contract.ts:140`) : le contrat
  ne fait pas foi sur la réponse.
- **Collision de noms.** `CompetitionEvent` désigne à la fois le journal, le bus et le canal
  `competition:event` ([ADR-0010](0010-bus-evenements.md)).

## Décision

### Noms

| Sorte | Forme | Exemples |
|---|---|---|
| Commande | Verbe à l'impératif + objet, camelCase | `checkIn`, `recordScore`, `generatePools`, `generateTableau`, `assignReferee` |
| Requête | `get…` pour un objet, `list…` pour une collection | `getMatchCards`, `listMatches`, `getCompetitionEvents` |
| Abonnement | `on…` + ce qui change | `onCompetitionChanges`, `onJournalAppended` |
| Outil MCP | Même nom en snake_case | `check_in`, `record_score` |
| Événement | Fait au passé, PascalCase ([ADR-0007](0007-format-evenement.md)) | `FencerCheckedIn` |

### Forme

- Une commande exprime **une intention métier**, pas une écriture de table.
  - Pas de commande générique `updateFencer(patch)`. On écrit `checkIn`, `setFencerStatus`,
    `renameFencer`… selon le besoin réel.
  - Le patch libre n'existe que pour les données sans règle, regroupées dans une commande
    explicitement nommée (`updateFencerDetails`), et il ne touche jamais un champ qui porte une
    règle (statut, classement, score).
- Toute commande qui porte sur une épreuve prend `competitionId`, `dryRun` (si l'effet est
  simulable) et `expectedRevision`.
- Toute sortie est **stricte** : `z.object`, jamais `z.looseObject` ni `z.unknown`. `recordScore`
  est corrigée (rattrapage #2020).
- Les requêtes ne renvoient que des identifiants et des valeurs du domaine. Une ligne SQL brute
  n'est pas une sortie.
- Une opération n'existe que si un client en a besoin aujourd'hui (écran, MCP ou tablette).
- Toute nouvelle opération est ajoutée à `docs/API_CONTRACT.md` dans la même PR.

## Conséquences

- Le lot 2 de #1981 se limite à terminer les opérations existantes : pointage individuel,
  lecture des cartons.
- Les opérations nouvelles (`generatePools`, `generateTableau`…) attendent cette ADR et le lot 4
  de #1979.
- Les outils MCP générés changent de nom si une opération est renommée. Avant la 3.0, aucun nom
  publié en stable n'est touché.
- L'abonnement `onCompetitionEvents` est renommé selon [ADR-0010](0010-bus-evenements.md).

## Alternatives écartées

- **Un contrat calqué sur `DatabaseManager`** : migration rapide, mais chaque règle reste dans
  l'écran ([ADR-0002](0002-couches-et-dependances.md)) et le MCP reçoit un accès brut aux tables.
- **Noms REST (`fencers.update`)** : ils orientent vers le CRUD, et le MCP les présente mal à un
  agent, qui comprend mieux une intention.
