---
name: bellepoule
description: Interroger et, sur autorisation, piloter BellePoule Modern (logiciel de compétition d'escrime) via son serveur MCP local — état d'une journée ou d'une salle (retards de poules, pistes libres, arbitres disponibles, conflits, tablettes, appareils Cyrano), préparation d'une journée depuis des fichiers de tireurs et d'arbitres, pointage, poules, scores, tableau, export des résultats, salles et pistes. À utiliser dès qu'il est question d'escrime, de compétition, d'épreuve, de poules, de tableau, de pointage, de DT (directoire technique) ou de BellePoule, même sans nommer le MCP.
---

# BellePoule Modern

Le serveur MCP `bellepoule` lit la base du poste du directoire technique (DT). Si le DT a coché « Autoriser l'écriture » (ou lancé `--mcp-write`), il peut aussi préparer une journée (`import_day`), créer une épreuve (`create_competition`), importer des tireurs et des arbitres (`import_fencers`, `import_referees`), pointer (`check_in`), puis conduire l'épreuve : poules (`generate_pools`, `assign_referees`), scores (`record_score`), tableau (`build_bracket`), résultats (`export_results`). Référence complète : `docs/MCP.md` du dépôt.

## Vocabulaire

| Terme | Sens |
|---|---|
| Épreuve / compétition | Une arme (`E` épée, `F` fleuret, `S` sabre), un sexe (`M`, `F`, `X` mixte), une catégorie (`U9`…`U20`, `SEN`, `V1`…`V4`) |
| Journée | Plusieurs épreuves dans la même salle, arbitres et pistes partagés (`day_overview`) |
| Salle | Pistes déclarées une fois (`list_venues`) ; la salle par défaut fournit ses pistes aux journées |
| Pointage | Appel des tireurs présents (`check_in`) ; seuls les pointés sont tirés en poules |
| Poule | Tous contre tous ; classement par V/M (victoires / matchs), puis indice (TD − TR), puis touches données |
| Tableau | Élimination directe (tableau de 64, 32… finale), petite finale facultative |
| Piste / arène | Aire de combat ; la tablette d'arbitre et l'écran d'arène y sont rattachés |
| DT | Directoire technique : l'opérateur qui décide |

Statuts tireur : `CHECKED_IN` pointé, `NOT_CHECKED_IN` absent, `ABANDONED` abandon, `EXCLUDED` exclu (carton noir), `FORFAIT` forfait.

## Déroulé type (lecture)
1. `list_competitions` (ou `day_overview` sans argument pour les journées).
2. Puis l'outil ciblé : `get_pool_ranking`, `get_bracket`, `list_fencers`, `list_matches`, `list_referees`, `day_overview` avec `dayId`, `strip_occupation`, `server_status`, `cyrano_status`, `get_settings`, `list_venues`.

## Questions sur la salle
- « Quelles poules sont en retard ? » → `day_overview` (épreuves de la journée), puis `get_pool_ranking` par épreuve (matchs joués / total).
- « Quel arbitre est libre pour la piste 4 ? » → `day_overview` avec `dayId` (arbitres libres / occupés, armes) et `strip_occupation`.
- « Y a-t-il des conflits ? » → `day_overview` avec `dayId` : même arbitre sur deux épreuves ou deux pistes, arme non autorisée.
- Tablettes et appareils : `server_status`, `cyrano_status`.

Répondre court : chiffres clés, puis la liste utile (piste, poule, tireurs). Citer les noms tels que BellePoule les renvoie.

## Préparer une journée (écriture autorisée)
Fichiers de tireurs `.fff`, `.csv`, `.xlsx`, `.xml`, `.cotcot`, `.txt` ; arbitres Engarde ou XML. `import_day` avec `dryRun: true` → rapport au DT (épreuves, tireurs lus, doublons, erreurs) → questions → `import_day` réel. Rejouable sans doublon ; un fichier manquant fait échouer l'import sans rien écrire. Voir `/bp-journee`.

## Conduire une épreuve (écriture autorisée)
1. `list_fencers` → `check_in` → `generate_pools` (`dryRun: true` pour montrer le tirage, puis réel) → `assign_referees`.
2. `list_matches` (`state: "ready"`) donne les `matchId` → `record_score`. Égalité : demander le vainqueur (`winner`) ; abandon, forfait, exclusion : `specialStatus` + `winner`.
3. Poules terminées → `build_bracket` (demander la petite finale si l'épreuve ne la fixe pas) → `record_score` au tableau → `export_results` (`xml` pour la fédération, `pdf` pour l'affichage).
4. Équipes, rapières, plusieurs tours de poules et « toutes les places » se pilotent à l'écran (erreur `unsupported_format`).

Voir `/bp-epreuve`.

## Garde-fous
- Lire avant d'écrire : identifier l'épreuve par `list_competitions`, jamais d'identifiant inventé.
- Écriture : toujours appeler d'abord avec `dryRun: true`, montrer le rapport au DT, écrire seulement après son accord. Sans autorisation d'écriture, renvoyer le DT vers l'application.
- Scores : ne saisir que des scores donnés par le DT ou lus sur une feuille qu'il fournit (`dryRun: true` pour contrôler une saisie douteuse).
- Destructif : `delete_competition`, `stop_remote_server`, et `replace: true` sur `generate_pools` / `build_bracket` demandent l'accord explicite du DT.
- Fichiers : lus et écrits seulement dans les dossiers accessibles à l'agent (Paramètres → Système → Agent IA ; par défaut Documents, Téléchargements, Bureau).
- Erreurs : une réponse `isError` porte un code (`pools_have_scores`, `score_above_max`, `unsupported_format`…). Expliquer, proposer la suite, ne pas forcer.
- Données personnelles : ne pas recopier plus que nécessaire (RGPD). Le serveur ne fournit ni date de naissance, ni licence, ni photo. Ne jamais afficher le jeton MCP.
- Si le serveur ne répond pas : BellePoule Modern doit être lancé, avec Paramètres → Système → Agent IA (MCP) activé (ou `--headless --mcp`) ; jeton par `/plugin configure bellepoule` (sinon variable `BELLEPOULE_MCP_TOKEN`, souvent invisible d'un Claude Code lancé depuis VS Code). HTTP 401 « Jeton invalide » / `AUTH_HEADER_REJECTED` : jeton absent ou périmé (après « Nouveau jeton ») → `/plugin configure bellepoule`, puis `/reload-plugins`. Erreur `token_unreadable` : jeton à recréer dans les Paramètres ou par `--mcp-new-token`.
