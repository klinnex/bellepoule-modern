# ADR-0016 — Retrait et réintégration d'un tireur : `withdrawFencer`, `reinstateFencer`

- **Statut** : Proposée
- **Date** : 2026-11-21
- **Tickets** : #1980, #1981

## Contexte

Abandon, forfait et exclusion (carton noir compris) sont le dernier gros fait d'épreuve écrit par
plusieurs chemins ([ADR-0005](0005-journal-un-fait-un-chemin.md)). Le pointage et les scores
passent déjà par `checkIn` et `recordScore` (#2052, #2055). Le statut d'un tireur retiré, lui,
s'écrit à huit endroits, et aucun ne journalise le fait :

| Origine | Chemin d'écriture | Effet sur les matchs |
|---|---|---|
| Appel : statut choisi dans la liste | `CompetitionView.tsx:376` → `handleFencerForfeit` + `db:updateFencer` | Matchs de poule restants perdus, à l'écran ; DNS si aucun match commencé (`checkInStatusUpdate`) |
| Poule : abandon, forfait, exclusion d'un tireur | `CompetitionPoolCard.tsx:174` → `handleFencerForfeit` + `specialStatusPatch` | Idem |
| Score avec statut du perdant | `recordScore` (`specialStatus`, `sport.ts:426`, `:683`) | Poule : matchs restants perdus. Tableau : vainqueur propagé |
| Tableau : statut spécial d'un match | `TableauView.tsx:229` (`handleSpecialStatus`) | Match perdu, vainqueur propagé, à l'écran |
| Carton noir au tableau | `TableauPhase.tsx:134` → `db:updateFencer` | Aucun, géré à part par la saisie du match |
| Carton noir de la tablette | `matchRoutes.ts:463` → `db.updateFencer` + `remote:fencer_excluded` → `handleFencerForfeit` à l'écran | Matchs restants perdus, à l'écran |
| Exclusion signalée par l'appareil de piste | `applyDeviceExclusion` (`matchFinish.ts:139`) → même suite | Idem |
| Abandon signalé par l'appareil, confirmé par le DT | `proposeAbandonToDT` (`matchFinish.ts:188`) → `useRemoteScoreSync.ts:317` | Idem |

L'annulation suit trois chemins de plus :

- réactivation depuis l'appel : `handleUndoAbandon` (`usePoolManagement.ts:302`) relit
  l'instantané `fencer_abandons` et restaure les matchs à l'écran ;
- annulation du carton noir depuis la tablette : `cancelBlackCard` (`blackCards.ts:84`) écrit le
  statut, puis `handleBlackCardCancelled` (`usePoolManagement.ts:489`) rouvre le match à l'écran ;
- annulation d'une saisie au tableau : retour arrière local (`undo`).

Conséquences :

- la règle « matchs restants perdus » (`applyFencerForfeit`, `poolOrchestration.ts:202`) est
  appliquée par l'écran ou par le moteur selon l'origine. Quand l'écran est fermé, une exclusion
  venue d'une tablette ne touche pas les matchs ;
- l'instantané qui permet l'annulation est écrit par l'écran seul (`saveAbandonSnapshot`). Une
  exclusion venue d'un appareil, écran fermé, ne s'annule pas proprement ;
- le journal ne sait pas qu'un tireur est sorti : `getMatchHistory` et la reconstruction de
  l'état restent faux, et le contrat le signale depuis #2055 ;
- sans relecture, l'écran et les tablettes écrivent l'état de session chacun de leur côté. C'est
  la course déjà corrigée pour les scores.

[ADR-0008](0008-nommage-contrat.md) interdit un `updateFencer(patch)` qui toucherait le statut,
et demande une commande par intention métier.

## Décision

### Deux commandes du contrat

- **`withdrawFencer`** retire un tireur de l'épreuve.
  - Entrée : `{ competitionId, fencerId, reason, blackCard?, matchId?, dryRun?, expectedRevision?, commandId? }`.
  - `reason` vaut `abandon`, `forfait` ou `exclusion` (statuts `ABANDONED`, `FORFAIT`, `EXCLUDED`).
  - `blackCard` vaut par défaut `false` et ne sert qu'avec `exclusion` : il pose le motif
    `black_card` du rapport fédéral.
  - `matchId` désigne le match où le retrait a lieu (carton, abandon sur la piste) ; il est
    facultatif pour un retrait décidé à l'appel.
  - Outil MCP : `withdraw_fencer`.
- **`reinstateFencer`** annule un retrait.
  - Entrée : `{ competitionId, fencerId, dryRun?, expectedRevision?, commandId? }`.
  - Le tireur retrouve son statut d'avant le retrait, et ses matchs leur état d'avant, lus dans
    l'instantané.
  - Outil MCP : `reinstate_fencer`.
- Les deux sorties sont strictes (`z.object`) : statut posé, matchs modifiés (identifiants),
  révision.
- `checkIn` ne change pas. Il refuse toujours de toucher un tireur retiré (`canToggleCheckIn`) :
  réactiver un tireur retiré, c'est `reinstateFencer`.

### Une seule règle, appliquée par le moteur

- On déplace la règle dans `shared/domain/fencers` (fonction pure `planWithdrawal`) : à partir
  de l'état de l'épreuve, elle calcule les matchs touchés, le statut et le motif.
  - **Appel**, poules non lancées : le statut seul.
  - **Poules** : tous les matchs non joués du tireur sont perdus (`applyFencerForfeit`). Motif
    DNS si aucun de ses matchs n'a commencé (`checkInForfeitReason`). Classements recalculés.
  - **Tableau** : le match en cours du tireur est perdu, l'adversaire gagne et passe au tour
    suivant (`propagateWinners`). Cela vaut aussi pour les tableaux de classement (« toutes les
    places ») et les barrages. Les matchs déjà joués ne changent pas. Si l'adversaire de ce
    match n'est pas encore connu : refus (`match_not_ready`), le DT pose le retrait quand le
    match est formé.
  - **Tableau terminé** : refus (`tableau_complete`, catégorie `rule`).
- La commande écrit dans **une** transaction ([ADR-0006](0006-expected-revision.md)) :
  - le statut et le motif du tireur ;
  - l'instantané (table `fencer_abandons`, déjà existante : pas de migration,
    [ADR-0011](0011-migrations-schema-3-0.md)) ;
  - les matchs (base et état de session) ;
  - le journal.
- `recordScore` garde `specialStatus`. Un score saisi avec le statut du perdant (« 3-1, abandon »)
  appelle la même fonction du domaine, dans la même transaction. Un geste de l'arbitre reste une
  commande : `ScoreRecorded` et `FencerWithdrawn` partagent un `commandId`
  ([ADR-0007](0007-format-evenement.md)).
- `reinstateFencer` lit l'instantané, rend le statut et les matchs, recalcule les classements,
  puis supprime l'instantané. Elle refuse quand :
  - il n'y a pas d'instantané (`withdrawal_not_found`, catégorie `not_found`) ;
  - un match en aval a été joué depuis : tour suivant du tableau, tableau tiré après des poules
    corrigées (`next_match_played`, catégorie `conflict`).

### Événements

On ajoute deux types à l'union du journal ([ADR-0007](0007-format-evenement.md)), au passé :

- `FencerWithdrawn { fencerId, reason, blackCard, matchId | null, forfeitedMatchIds }` ;
- `FencerReinstated { fencerId, restoredStatus, restoredMatchIds }`.

Les événements ne portent que des identifiants (RGPD).

### Tous les chemins passent par les commandes

- **Écran** : l'appel, la poule, le tableau et le carton noir au tableau appellent
  `withdrawFencer`. La réactivation depuis l'appel appelle `reinstateFencer`. L'écran relit la
  session (`session:changed`) et n'applique plus `handleFencerForfeit` ni `handleUndoAbandon`
  lui-même. Le succès ne s'affiche qu'après la réponse. La confirmation (« N matchs perdus »)
  s'appuie sur `dryRun`.
- **Serveur distant et appareils de piste** : le carton noir de la tablette, l'exclusion de
  l'appareil et l'abandon confirmé par le DT appellent `withdrawFencer` par
  `invokeCommandSync`, avec la source `tablet` ou `cyrano`. `remote:fencer_excluded` ne sert plus
  qu'à prévenir l'écran ; il n'écrit plus rien.
- **Annulation du carton noir** : `reinstateFencer` rend le statut et les matchs. Rouvrir le match
  interrompu au score atteint reste l'affaire du serveur distant : c'est un état d'arène, pas un
  fait de l'épreuve.

### Ordre

On suit l'ordre d'[ADR-0005](0005-journal-un-fait-un-chemin.md) : pas de journal partiel.

1. Domaine et commandes, outils MCP, tests sur base réelle.
2. Écran : appel, poule, tableau, réactivation.
3. Serveur distant et appareils : carton noir, exclusion, abandon confirmé, annulation du carton.

Les trois PR sont empilées et mergées ensemble, comme celles des scores (#2054, #2055). Les
événements `FencerWithdrawn` et `FencerReinstated` n'existent dans une version publiée qu'une
fois tous les chemins passés par les commandes.

## Conséquences

- `handleFencerForfeit`, `handleUndoAbandon`, `handleBlackCardCancelled` et `specialStatusPatch`
  sortent de l'écran. `checkInStatusUpdate` et `applyFencerForfeit` rejoignent
  `shared/domain/fencers`.
- Le compteur `electronApiCalls` baisse : `saveAbandonSnapshot`, `getAbandonSnapshot` et les
  `updateFencer` de statut disparaissent du renderer.
- Le catalogue des erreurs ([ADR-0009](0009-codes-erreur.md)) gagne `tableau_complete`,
  `withdrawal_not_found` et `fencer_not_found`.
- Une exclusion venue d'une tablette ou d'un appareil touche les matchs même écran fermé, et
  s'annule sans l'écran.
- Restent hors de cette ADR :
  - l'élimination à la fin d'un tour de poules (`ELIMINATED`, `useCompetitionNavigation.ts:281`),
    qui relève d'une future commande de clôture de tour ;
  - les épreuves par équipes (modèle de relais) : `unsupported_format`, comme `recordScore` ;
  - la correction d'une poule après le tirage du tableau (#1996), qui garde son propre chemin.
- `getMatchHistory` et `docs/API_CONTRACT.md` retirent les statuts spéciaux de la liste « pas
  encore journalisés » dans la PR de l'étape 3.

## Alternatives écartées

- **Une seule commande `setFencerStatus` avec le statut cible** : elle colle à l'appel actuel de
  l'écran. Mais la réintégration deviendrait un cas caché dans le statut cible, alors que sa
  règle (instantané, refus si l'aval a été joué) et son événement diffèrent.
- **Retirer `specialStatus` de `recordScore`** : le client enchaînerait `recordScore` puis
  `withdrawFencer`. Deux transactions : un échec entre les deux laisserait un score sans statut.
- **Retrait limité aux poules** : le tableau garderait une saisie locale, donc un fait à deux
  chemins, ce qu'interdit ADR-0005.
- **Une commande `cancelBlackCard`** : c'est une réintégration particulière. La réouverture du
  match relève de l'arène, pas de l'épreuve.
- **Garder l'instantané dans l'écran** : une exclusion venue de la piste, écran fermé, ne
  s'annulerait plus.
