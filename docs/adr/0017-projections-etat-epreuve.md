# ADR-0017 — L'état de l'épreuve devient une projection du moteur

- **Statut** : Proposée
- **Date** : 2026-11-21
- **Tickets** : #1980 (étapes 4 et 5), #1981

## Contexte

Après la chaîne #2050 → #2059 (en revue), les faits les plus fréquents passent par une commande
du contrat ([ADR-0005](0005-journal-un-fait-un-chemin.md)) : pointage, scores (écran, tablettes,
appareils de piste, MCP), retrait et réintégration d'un tireur
([ADR-0016](0016-retrait-reintegration-tireur.md)). Mais l'état de l'épreuve vit toujours dans
`session_state` : un bloc JSON par épreuve, avec trois auteurs.

| Auteur | Écriture |
|---|---|
| Écran | Le bloc entier, 500 ms après chaque changement (`useCompetitionSession.ts`, `db:saveSessionState`, refus si la révision est périmée) |
| Moteur | Fusion d'un morceau (`writeSession`, `engine/commands/sport.ts`), puis signal `session:changed` |
| Écran, séparation des tableaux | Bloc initial de l'épreuve créée (`useSplitGroups.ts:141`) |

Il a cinq lecteurs : l'écran (restauration et relecture), le moteur (`readSession`), les
résultats publics (`remote/routes/resultsRoutes.ts`), l'affectation des arbitres côté tablettes
(`remote/refereeResolver.ts`) et les coordonnées de match pour Cyrano (`cyrano/matchCoords.ts`).

Le bloc mélange quatre natures de données :

| Champ | Nature |
|---|---|
| `pools`, `poolHistory`, `appelHistory`, `tableauMatches`, `currentPoolRound`, `rapieres` | Faits de l'épreuve |
| `overallRanking`, `finalResults`, `consolationBrackets` | Dérivés : calculables à partir des faits |
| `poolPrepParams`, `remoteArenaCount`, `remoteStripStart`, `skipPoolPhase` | Réglages de l'épreuve ou du poste |
| `currentPhase`, `uiState` | État d'interface : onglet affiché, tour consulté |

Conséquences actuelles :

- Une modification de l'écran qui n'est pas un score (onglet, préparation des poules) est écartée
  sans message si un score arrive de la piste pendant la demi-seconde de sauvegarde différée
  (#2055, « risque restant »).
- Plusieurs faits s'écrivent encore dans le bloc par l'écran, sans commande ni événement :
  - tirage des poules (le moteur a `generatePools`, sans événement) ;
  - composition des poules (ajout, déplacement d'un tireur) ;
  - clôture d'un tour et éliminés (`useCompetitionNavigation.ts:281`) ;
  - génération du tableau (le moteur a `buildBracket`, sans événement) ;
  - correction d'une poule après le tirage du tableau (#1996) ;
  - vagues des rapières.
- Le journal ne permet pas de reconstruire l'état : il lui manque ces faits. Le critère
  d'acceptation de #1980 (« reconstruire les projections depuis le journal redonne les mêmes
  tables ») est hors de portée.
- Les dérivés ne sont pas déterministes : un tableau de classement reçoit un identifiant qui
  contient l'heure (`buildConsolationBracket`, `cons-${firstPlace}-${now}`). Recalculer ne
  redonne pas le même état.
- Un onglet changé sur un poste est enregistré dans l'état partagé de l'épreuve.

## Décision

### 1. `session_state` devient un cache du moteur

- Seul le moteur écrit `session_state`. C'est la projection de l'état de l'épreuve, tenue à jour
  par chaque commande dans sa transaction (`writeSession`).
- L'écran ne l'écrit plus jamais. `db:saveSessionState` et `db:saveSessionStateSync` sortent du
  préload à la fin de l'étape 4.
- La séparation des tableaux crée la nouvelle épreuve par une commande du moteur.
- Le cache peut être jeté : la commande de maintenance **`rebuildCompetitionState`** le
  reconstruit à partir des tables et du journal (outil MCP d'administration, test).
- On garde la table `session_state` : pas de migration
  ([ADR-0011](0011-migrations-schema-3-0.md)). Les lecteurs actuels (résultats publics,
  arbitres, Cyrano) ne changent pas.

### 2. L'écran lit la projection après un signal

- On ajoute une requête du contrat **`getCompetitionState { competitionId }`**. Elle rend
  `{ revision, state }`, en sortie stricte ([ADR-0008](0008-nommage-contrat.md)) :
  - `revision` est la révision du journal ;
  - `state` contient poules, tours, tableau, tableaux de classement, classements et phase de
    l'épreuve.
- L'écran tient une copie **en lecture seule**. Toute modification passe par une commande.
- Quand le signal de journal annonce une révision plus récente que la sienne
  ([ADR-0010](0010-bus-evenements.md), `onJournalAppended`), l'écran relit `getCompetitionState`.
  Les signaux rapprochés sont regroupés : une seule relecture par rafale, pour la dernière
  révision.
- Le client n'applique aucun événement lui-même : une seule logique, celle du moteur.
- Avant que l'ADR-0010 soit appliquée, le signal `journal:appended` existant joue ce rôle.

### 3. Le journal devient la source de vérité, par paliers

- Un fait est **rejouable** quand son événement suffit à reconstruire sa part de l'état.
- Une fonction pure de `shared/domain`, **`projectCompetition(events)`**, rejoue le journal. Le
  moteur l'utilise pour `rebuildCompetitionState` et pour le test de rejeu. Les clients ne
  l'utilisent pas.
- **Rejouables aujourd'hui** :
  - `FencerCheckedIn`, `FencerCheckedOut` ;
  - `ScoreRecorded`, `TableauMatchDecided` ;
  - `FencerWithdrawn`, `FencerReinstated`.
- **Paliers suivants** : un fait passe à la fois par sa commande et par son événement, dans la
  même PR ([ADR-0005](0005-journal-un-fait-un-chemin.md)).

| Fait | Commande | Événement |
|---|---|---|
| Tirage des poules | `generatePools` (existe, sans événement) | `PoolsGenerated` : tour, poules, tireurs, pistes, ordre des matchs ; le tirage complet, pas la graine |
| Composition d'une poule | `movePoolFencer`, `addPoolFencer` | `PoolFencerMoved`, `PoolFencerAdded` |
| Clôture d'un tour | `closePoolRound` | `PoolRoundClosed` : qualifiés, éliminés (statut `ELIMINATED`) |
| Génération du tableau | `generateTableau` (ex-`buildBracket`) | `TableauGenerated` : taille, placement complet, petite finale, « toutes les places » |
| Correction après tirage (#1996) | `recordScore` avec motif de correction | `ScoreRecorded` avec `correction` |
| Vagues des rapières | `launchRapieresWave` | `RapieresWaveLaunched` |

- **Les dérivés ne sont pas journalisés.** Classements, classement final, tableaux de classement
  et poules terminées se recalculent. Leur calcul est déterministe : pas d'heure ni de hasard
  dans un identifiant ou un ordre. L'identifiant d'un tableau de classement découle de son
  parent et de son tour. `PoolCompleted` et `TableauCompleted` restent des signaux du journal,
  ignorés au rejeu.
- Un **test de rejeu** joue une épreuve complète par les commandes, puis compare
  `projectCompetition(journal)` à la projection. Il couvre chaque palier dès son arrivée.
- Tant qu'un fait n'est pas rejouable, les tables font foi pour lui. `rebuildCompetitionState`
  part alors des tables pour ce fait.
- Une épreuve créée avant le premier palier (journal incomplet) se reconstruit à partir des
  tables. Le rejeu complet ne vaut que pour une épreuve dont le journal commence par
  `PoolsGenerated` ou par un tableau sans poules.

### 4. L'état d'interface sort de la projection

- L'onglet affiché et le tour consulté deviennent des préférences de l'écran, par poste et par
  épreuve. Ils ne quittent pas le poste.
- La **phase de l'épreuve** (appel, poules, tableau, résultats) se déduit des faits : poules
  tirées, tableau généré, tableau terminé. Ce n'est plus un champ écrit.
- `poolPrepParams` (taille des poules) devient un réglage de l'épreuve, écrit par une commande de
  réglage. `skipPoolPhase` devient un fait : le tableau est généré sans poules.
- `remoteArenaCount` et `remoteStripStart` rejoignent le plan des pistes
  ([ADR-0015](0015-plan-des-pistes-moteur.md), migration 47).

### Ordre

| Étape | Contenu |
|---|---|
| 4a | `getCompetitionState`. L'écran relit la projection sur signal de journal. Il écrit encore le bloc pour les faits pas encore passés par une commande |
| 4b | Un palier par PR : tirage, composition, clôture de tour, tableau, correction, rapières. Chacun avec sa commande, son événement et son test de rejeu. L'état d'interface sort du bloc |
| 4c | L'écran n'écrit plus `session_state` : `saveSessionState` sort du préload, `useCompetitionSession` ne fait plus que lire. Le « risque restant » de #2055 disparaît |
| 5 | `rebuildCompetitionState`, `projectCompetition`, test de rejeu complet. Le journal fait foi pour les faits rejouables |

## Conséquences

- Le cliquet `electronApiCalls` baisse à l'étape 4c : sauvegarde et relecture du bloc
  disparaissent du renderer.
- Performance : `getCompetitionState` rend le bloc d'une épreuve, comme la relecture actuelle,
  mais une seule fois par rafale. Le banc d'essai `tournament.bench.ts` sert de référence, et une
  épreuve de 300 tireurs sert de borne.
- Les nouveaux événements suivent l'[ADR-0007](0007-format-evenement.md) : identifiants
  seulement (RGPD), `schemaVersion` 1. Ils entrent au catalogue des erreurs et au contrat dans la
  même PR que leur commande.
- `docs/API_CONTRACT.md` tient la liste des faits rejouables et des paliers restants. Le contrat
  documente `getCompetitionState`.
- Réponses aux questions de #1980 :
  - la révision reste **par épreuve** ([ADR-0006](0006-expected-revision.md)) ;
  - aucun compactage du journal avant la 3.0 ;
  - le journal suit l'épreuve dans l'archive `.bpm`, comme les autres tables (`competition_id`).
- Hors de cette ADR :
  - les épreuves par équipes, qui ont leur modèle de relais ;
  - les tableaux séparés après les poules, au-delà de la création de l'épreuve séparée ;
  - l'annulation ciblée (`UndoLast`), qui viendra quand tous les faits seront rejouables.

## Alternatives écartées

- **Supprimer `session_state`** : tous les lecteurs (résultats publics, arbitres, Cyrano, MCP)
  seraient réécrits, avec une migration, pour un gain nul tant que le cache est tenu par le seul
  moteur.
- **Appliquer les événements côté client avec un réducteur partagé** : la même logique tournerait
  deux fois, et un écart entre les deux ne se verrait pas. L'ADR-0010 a déjà choisi « signal +
  relecture ».
- **Garder les tables comme vérité, journal pour l'audit seulement** : pas d'événements à
  construire, mais le critère de reconstruction de #1980 est abandonné, ainsi que la reprise sur
  une autre machine à partir du journal.
- **Garder l'onglet et le tour consulté dans la projection** : un poste changerait l'onglet
  affiché sur les autres postes, et chaque clic deviendrait une écriture concurrente.
- **Journaliser les dérivés (classements, tableaux de classement)** : le journal enfle, et deux
  vérités divergent dès qu'une règle de classement change.
