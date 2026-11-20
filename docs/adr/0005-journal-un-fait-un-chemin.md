# ADR-0005 — Journal : un fait, un chemin

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #1980, #1981, #2020, #2023

## Contexte

La migration 45 (#2023) crée le journal `competition_events`. Seules deux commandes du contrat
l'alimentent : `checkIn` et `recordScore` (MCP, `main/domain/sport.ts`). Or les mêmes faits
s'écrivent aussi par d'autres chemins, qui ne journalisent rien.

| Fait | Chemin journalisé | Chemins non journalisés |
|---|---|---|
| Pointage | `checkIn` : tout pointer ou tout dépointer (`useFencerManagement.ts:208`) | Clic sur un tireur : `db:updateFencer` (`useFencerManagement.ts:130`, `useCompetitionSessionSync.ts:233-241`) |
| Score | `recordScore` (MCP) | Écran (`session_state`), tablettes (`arenaControl`, `matchFinish`), Cyrano/OPP2 (`pisteHub`) |

Conséquences actuelles :

- `getMatchHistory` (« chaque modification ») est faux ;
- le journal ne permet pas de reconstruire l'état ;
- `expectedRevision` ne détecte pas les écritures de l'écran
  ([ADR-0006](0006-expected-revision.md)).

Il existe aussi deux règles de pointage :

- le moteur ne touche pas un tireur `ABANDONED`, `EXCLUDED` ou `FORFAIT` ;
- le basculement de l'écran passe à `CHECKED_IN` tout statut différent de `CHECKED_IN`.

## Décision

- **Un fait n'a qu'un chemin d'écriture : la commande du contrat.** Écran, tablettes, MCP et
  appareils de piste appellent cette commande. Aucun d'eux n'écrit le fait directement en base.
- **Avant de journaliser un nouveau type de fait, on fait passer tous ses chemins d'écriture par
  la commande.** Pas de journal partiel : un fait est journalisé partout ou nulle part.
- La règle (qui peut être pointé, quel score est valide) vit dans `shared/domain` et n'est
  appliquée que par la commande. L'écran ne la recode pas.
- L'écran n'affiche un succès qu'**après** la réponse de la commande. En cas d'`ApiError`, il
  affiche l'erreur et relit l'état. Pas de mise à jour optimiste sans retour arrière.
- Ordre de rattrapage :
  1. **Pointage** :
     - le clic individuel et `setFencersStatus` passent par `checkIn` ;
     - une seule règle s'applique pour les statuts spéciaux (celle du moteur) ;
     - l'écran respecte le refus.
  2. **Cartons en lecture** : `tableauDialogState.ts:78` et `blackCardReport.ts:69` passent par
     `getMatchCards` / `getCardsByMatchIds`.
  3. **Scores** : écran, tablettes, puis appareils de piste passent par `recordScore`. Cette
     étape relève de #1980, et elle est gelée jusqu'au lot 3 de #1979.

## Conséquences

- Tant qu'un fait a plusieurs chemins, sa documentation dans le contrat le dit. Par exemple,
  `getMatchHistory` précise « écritures passées par le contrat seulement ».
- Aucun nouveau type d'événement n'est ajouté avant que ses chemins soient unifiés et que
  [ADR-0007](0007-format-evenement.md) soit appliquée (migration 46).
- Les scores des tablettes et de Cyrano passent par le moteur. La latence reste locale (même
  processus) ; ce sont la file hors ligne des tablettes et l'accusé de réception (ACK/NAK)
  Cyrano qui doivent attendre la réponse de la commande.

## Alternatives écartées

- **Journaliser chaque chemin séparément (un `recordEvents` dans chaque handler)** — la même
  règle et le même événement seraient produits à quatre endroits, avec quatre façons de diverger.
- **Journal par déclencheurs SQL** — il capterait les écritures, mais pas l'intention (qui,
  pourquoi, quelle commande), et lierait le format d'événement au schéma des tables.
