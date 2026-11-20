# ADR-0006 — `expectedRevision` : contrôle dans la transaction, portée documentée

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #1980, #2023

## Contexte

Les commandes du contrat acceptent `expectedRevision`. Le contrat promet à l'agent un
« refus `revision_conflict` si une autre écriture est passée entre-temps »
(`shared/api/contract.ts:65-72`).

Cette promesse a deux défauts.

1. **Portée** : le journal ne voit que les écritures passées par le contrat
   ([ADR-0005](0005-journal-un-fait-un-chemin.md)). Un score saisi à l'écran ou sur une tablette
   ne change pas la révision : l'agent écrase sans être prévenu.
2. **Atomicité** :
   - `checkRevision` (`main/api/engine.ts:131-147`) lit la révision **avant** le handler ;
   - `EventLogRepo.append` (`database/repos/eventLogRepo.ts:81`) ouvre sa propre transaction
     **après**.
   
   Le contrôle n'est juste que parce que les handlers sont synchrones. Le premier `await` placé
   entre les deux rouvre la course.

Il existe aussi un second compteur, `session_state.revision` (`main/domain/sport.ts:128`), sans
lien avec la révision du journal.

## Décision

- On **garde** `expectedRevision` : c'est le mécanisme de concurrence optimiste du contrat, pour
  le MCP, puis pour le client WebSocket (#1981, lot 3).
- Le contrôle passe **dans la transaction** qui écrit les tables et le journal. Dans l'ordre :
  1. on ouvre la transaction ;
  2. on lit la révision ;
  3. on compare ;
  4. on exécute la commande et on appelle `append` ;
  5. on valide.
  
  Le moteur expose pour cela `runCommand(ctx, competitionId, expected, fn)`. Les handlers ne
  lisent plus la révision eux-mêmes.
- Un handler de commande ne fait **aucun `await`** entre l'ouverture et la validation de la
  transaction. Une entrée-sortie asynchrone (fichier, réseau) se fait avant ou après.
- Description honnête dans le contrat :

  > Révision attendue du journal de l'épreuve. Refus « revision_conflict » si une autre
  > commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le
  > contrat (écran, tablettes) ne sont pas détectées.

  La dernière phrase disparaît quand [ADR-0005](0005-journal-un-fait-un-chemin.md) est
  appliquée aux scores.
- `session_state.revision` reste un compteur **d'écran** (version de l'état de session, pour la
  synchronisation des fenêtres). Il ne sert jamais au contrôle de concurrence du contrat. Il
  disparaît quand l'état de session sera une projection du journal (#1980, étape 3).

## Conséquences

- Rattrapage permis pendant le lot 1 (petite PR) :
  - contrôle dans la transaction ;
  - nouvelle description ;
  - test qui simule une écriture concurrente entre lecture et ajout.
- Le refus garde sa forme : `ApiError('revision_conflict', …, { revision, missing })`
  ([ADR-0009](0009-codes-erreur.md)).

## Alternatives écartées

- **Retirer `expectedRevision` jusqu'à l'unification des chemins** — on casserait un champ déjà
  documenté pour le MCP, et il faudrait le réintroduire ensuite.
- **Verrou applicatif (mutex par épreuve)** — inutile tant que SQLite et `better-sqlite3`
  sérialisent les transactions dans un seul processus. La transaction suffit.
- **Fusionner `session_state.revision` et la révision du journal** — l'état de session n'est
  pas encore une projection du journal. Les fusionner lierait le compteur d'écran aux
  événements, avant [ADR-0007](0007-format-evenement.md).
