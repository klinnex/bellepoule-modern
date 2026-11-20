---
description: Conduire une épreuve BellePoule — pointage, poules, arbitres, scores, tableau, résultats — nécessite « Autoriser l'écriture »
argument-hint: <titre ou identifiant de l'épreuve> [étape]
---

Conduis une épreuve dans BellePoule Modern avec le serveur MCP `bellepoule` (skill `bellepoule`). Arguments : $ARGUMENTS

1. Retrouve l'épreuve (`list_competitions`) ; si plusieurs correspondent, demande laquelle. Lis son état (`get_competition`, `list_fencers`, `list_matches`) et annonce l'étape en cours.
2. **Pointage** : `list_fencers`, puis `check_in` avec la liste donnée par le DT (identifiants ou dossards). Ne pointe jamais sans liste explicite.
3. **Poules** : `generate_pools` avec `dryRun: true`, montre la répartition (poules, pistes, clubs), puis tirage réel après accord ; `assign_referees` (`dryRun` d'abord).
4. **Scores** : `list_matches` avec `state: "ready"` pour les identifiants ; `record_score` uniquement avec les scores dictés par le DT. Égalité : demander le vainqueur (`winner`). Abandon, forfait, exclusion : `specialStatus` + `winner`. En cas de doute sur une saisie, `dryRun: true` d'abord.
5. **Tableau** : poules terminées (`get_pool_ranking`), demande la petite finale si besoin, `build_bracket` (`dryRun` d'abord), puis scores du tableau comme ci-dessus ; suivi par `get_bracket`.
6. **Résultats** : `export_results` (`xml` pour la fédération, `pdf` pour l'affichage) dans un dossier accessible à l'agent.

Garde-fous : `replace: true` (effacer des poules ou un tableau joués), `stop_remote_server` et `delete_competition` exigent l'accord explicite du DT. Équipes, rapières, tours de poules multiples et « toutes les places » se pilotent à l'écran (`unsupported_format`). Après chaque écriture, l'écran ouvert se met à jour tout seul.
