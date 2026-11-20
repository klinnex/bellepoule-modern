# ADR-0009 — Un catalogue unique des codes d'erreur

- **Statut** : Acceptée (arbitrage du 2026-11-20)
- **Date** : 2026-11-20
- **Tickets** : #1981, #2020

## Contexte

Deux classes d'erreur existent aujourd'hui :

- **`ApiError`** (`shared/api/client.ts`) : `{ code, message, data? }`. Son type `ApiErrorCode`
  déclare `invalid_input | unknown_operation | internal | (string & {})`, c'est-à-dire n'importe
  quelle chaîne.
- **`DomainError`** (`main/domain/context.ts`) : `code: string`. Environ 25 codes sont levés dans
  `src/main` (`competition_not_found`, `score_above_max`, `tie_at_max`, `winner_required`…).
  Aucune liste ne les recense.

Les clients ne peuvent pas savoir quels codes traiter :

- l'écran, pour afficher un message traduit ;
- le MCP, pour qu'un agent sache s'il doit corriger son entrée ou relire l'état.

Un code renommé casse un client sans que la CI le voie.

## Décision

- On déclare un catalogue dans **`src/shared/api/errors.ts`** :
  - un objet `ERRORS` donne, pour chaque code, sa catégorie et sa description ;
  - le type `ApiErrorCode` est dérivé de ce catalogue (`keyof typeof ERRORS`), sans
    `(string & {})`.
- Les codes sont en snake_case, stables et en anglais. Le message reste en français, destiné à
  l'opérateur ou à l'agent.
- Les catégories :

| Catégorie | Sens pour le client | Codes |
|---|---|---|
| `transport` | Appel mal formé : corriger l'appel | `invalid_input`, `unknown_operation` |
| `not_found` | Objet absent : relire les identifiants | `competition_not_found`, `match_not_found`… (`<objet>_not_found`) |
| `conflict` | État changé : relire puis renvoyer | `revision_conflict`, `bracket_exists`, `next_match_played` |
| `rule` | Règle métier refusée : corriger la demande | `score_above_max`, `tie_at_max`, `winner_required`, `pools_not_complete`… |
| `permission` | Droit manquant (#1981, rôles) | `permission_denied` |
| `internal` | Panne, journalisée | `internal`, `write_failed` |

- `DomainError` (devenue `CommandError`, [ADR-0003](0003-main-domain-couche-application.md))
  prend un `ApiErrorCode` : un code absent du catalogue ne compile pas.
- Quand `data` existe, il est typé par code dans le catalogue. Exemple : `revision_conflict`
  porte `{ revision, missing }`.
- Un test parcourt les `throw` de `src/main` et échoue sur un code hors catalogue.
- Retirer ou renommer un code est un **changement cassant** : on le note dans les notes de
  version et dans `docs/API_CONTRACT.md`.

## Conséquences

- `docs/API_CONTRACT.md` liste le catalogue. Ce peut être une partie générée par le script de
  `docs:mcp`.
- L'écran traduit les codes de catégorie `rule` et `conflict` (clés i18n `apiError.<code>`). Il
  peut afficher les autres en message brut.
- Les codes propres à l'export de fichiers (`invalid_path`, `invalid_extension`,
  `unsupported_format`, `pdf_unavailable`) entrent dans le catalogue tels quels, en catégorie
  `rule`.

## Alternatives écartées

- **Codes HTTP (400, 404, 409)** : ils sont trop grossiers pour un agent, qui doit distinguer
  `tie_at_max` de `winner_required`. Et l'IPC n'est pas du HTTP.
- **Une classe d'erreur par code** : l'IPC perd les classes (d'où `ApiEnvelope`), seul le code
  traverse.
- **Laisser `string`** : c'est la situation actuelle, où rien ne protège les clients.
