# ADR-0014 — Un seul moteur d'affectation des arbitres, appelé par une commande

- **Statut** : Acceptée (principe : 2026-11-20) ; détails à valider en revue
- **Date** : 2026-11-20
- **Tickets** : #1959, #1958, #1714, #1979

## Contexte

L'inventaire du renderer (`ARCHITECTURE.md` § 9.4) relève **quatre** façons d'affecter un
arbitre :

| Moteur | Où | Utilisé par | Neutralité |
|---|---|---|---|
| Couplage optimal (hongrois), créneaux, diagnostic des manques (#1959) | `shared/utils/refereeMatching.ts`, `shared/utils/refereeAutoAssign.ts` | `RefereeManager.tsx` (bouton « Affecter ») | club, nationalité, ligue ; verrous ; arbitres occupés dans la journée |
| Glouton « le moins chargé » | `shared/utils/refereeStats.autoAssignReferees` | remplissage automatique de `usePoolViewActions.ts` et `useTableauViewScoring.ts` | club seulement |
| Glouton « premier neutre » | `main/domain/sport.ts` (`chooseNeutralReferee`, `assignPoolReferees`) | MCP (`assign_referees`) | club seulement |
| Classe de rotation | `shared/services/refereeManager.ts` (`assignRefereesToMatches`) | plus aucun appelant hors de ses tests ; la classe ne sert plus qu'au rapport de rotation | — |

S'y ajoutent trois défauts :

- Le conflit de club est recodé dans `RefereeManager.tsx` (`getConflictWarning`), alors que
  `refereeMatching.neutralityConflicts` existe.
- Les réglages de neutralité et de rotation (nationalité, ligue, équilibrage, matchs consécutifs,
  repos) sont un `useState` de l'écran. Ils ne sont pas enregistrés, et le MCP les ignore.
- L'écriture se fait match par match (`db.updateMatch`) depuis l'écran. Les erreurs sont
  ignorées et l'écriture n'est pas atomique.

Selon que le DT clique, remplit automatiquement ou passe par l'agent, une même poule reçoit donc
un arbitre différent.

## Décision

- **Un seul moteur** : `refereeMatching` + `refereeAutoAssign`.
  - Il part dans `shared/domain/referees/` au lot 3 de #1979, sans changement de comportement.
  - C'est l'unique fonction qui choisit un arbitre.
- Le **conflit de neutralité** ne se calcule que par `neutralityConflicts` : avertissement de
  l'écran, diagnostic et contrôle du moteur.
- **Retraits** :
  - `refereeStats.autoAssignReferees` : le remplissage automatique appelle le moteur unique.
  - `chooseNeutralReferee` / `assignPoolReferees` de `sport.ts` : la commande MCP appelle le
    moteur unique, une poule valant un créneau.
  - `RefereeManager.assignRefereesToMatches` et ses tests : supprimés. La classe garde le rapport
    de rotation (fatigue, statistiques) et part dans `shared/domain/referees/rotationReport.ts`.
- **Réglages enregistrés** : neutralité (club, nationalité, ligue), équilibrage, matchs
  consécutifs et repos minimal deviennent des réglages de l'épreuve, lus par le moteur.
  - Ils sont rangés dans `competitions.settings.refereeing` : c'est un JSON existant, donc pas de
    migration.
  - Ce n'est pas un réglage de formule ([ADR-0012](0012-formule-domaine.md) ne s'applique pas).
  - Défaut : `DEFAULT_NEUTRALITY` et `DEFAULT_MATCHING_WEIGHTS`.
- **Une commande** `assignReferees` dans le contrat ([ADR-0008](0008-nommage-contrat.md)).
  - Entrée : `{ competitionId, scope: 'pools' | 'tableauRound', round?, replace?, dryRun, expectedRevision }`.
  - Sortie : affectations, manques expliqués (condition de Hall), conflits.
  - Elle écrit toutes les affectations **dans une transaction**.
  - Les verrous manuels et les arbitres occupés ailleurs dans la journée (#1714) sont lus par le
    moteur, pas fournis par l'écran.
  - L'affectation manuelle d'un arbitre est une seconde commande, `assignReferee`
    (`{ matchId | poolId, refereeId }`). Elle passe le même contrôle de neutralité, qui avertit
    sans bloquer.
- L'outil MCP `assign_referees`, aujourd'hui écrit à la main dans `mcpSportTools.ts`, sera
  généré depuis `assignReferees` (`scope: 'pools'` par défaut). Il garde le même nom, et rien ne
  change pour les agents.

## Conséquences

- **Ordre** :
  1. lot 3 : déplacement dans `shared/domain/referees` ;
  2. commande `assignReferees` + retrait des gloutons ;
  3. écran branché sur la commande.
  
  #1959 (encore ouvert) se termine par l'étape 2.
- Le MCP gagne la neutralité nationalité et ligue, les verrous et les arbitres occupés : c'est
  un changement de résultat **voulu**, à signaler dans les notes de version 3.0.
- Le remplissage automatique (scores de test) gagne la même neutralité. Il peut laisser des matchs
  sans arbitre quand le couplage est impossible, et il affiche alors le diagnostic.
- Le journal des affectations (`RefereeAssigned`) attend [ADR-0007](0007-format-evenement.md) et
  le dégel de #1980 ([ADR-0005](0005-journal-un-fait-un-chemin.md) : un seul chemin d'abord).
- Le planning (#1958) appelle le même moteur, créneau par créneau.

## Alternatives écartées

- **Garder le glouton pour le remplissage automatique** : ce sont deux résultats pour une même
  question. Le gain de vitesse est nul à l'échelle d'une épreuve (quelques centaines de matchs au
  plus).
- **Laisser les réglages de neutralité dans l'écran** : le MCP, le planning et un second poste
  affecteraient sans eux.
- **Une table dédiée aux réglages d'arbitrage** : elle exigerait une migration
  ([ADR-0011](0011-migrations-schema-3-0.md)) pour un objet plat, propre à l'épreuve, que
  `settings` porte déjà.
