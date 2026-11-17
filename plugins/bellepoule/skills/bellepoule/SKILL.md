---
name: bellepoule
description: Interroger une journée d'escrime gérée par BellePoule Modern (épreuves, poules, tableau, arbitres, pistes, tablettes, appareils Cyrano) via le serveur MCP local en lecture. À utiliser pour toute question sur l'état d'une compétition ou d'une salle d'escrime ouverte dans BellePoule Modern.
---

# BellePoule Modern — agent en lecture

Le serveur MCP `bellepoule` lit la base du poste du directoire technique (DT). Si le DT a coché « Autoriser l'écriture », il peut aussi créer une épreuve (`create_competition`), importer des tireurs (`import_fencers`) et pointer (`check_in`).

## Vocabulaire
- **Épreuve / compétition** : une arme (E épée, F fleuret, S sabre), un sexe, une catégorie (U13… Vétérans).
- **Journée** : plusieurs épreuves dans la même salle, arbitres et pistes partagés.
- **Poule** : tous contre tous ; classement par V/M (victoires / matchs), puis indice (TD − TR), puis touches données.
- **Tableau** : élimination directe (tableau de 64, 32… finale).
- **Piste / arène** : aire de combat ; la tablette d'arbitre et l'écran d'arène y sont rattachés.
- Statuts tireur : `CHECKED_IN` pointé, `NOT_CHECKED_IN` absent, `ABANDONED` abandon, `EXCLUDED` exclu (carton noir), `FORFAIT` forfait.

## Déroulé type
1. `list_competitions` (ou `day_overview` sans argument pour les journées).
2. Puis l'outil ciblé : `get_pool_ranking`, `get_bracket`, `list_fencers`, `list_referees`, `day_overview` avec `dayId`, `strip_occupation`, `server_status`, `cyrano_status`.

## Garde-fous
- Écriture : toujours appeler d'abord avec `dryRun: true`, montrer le rapport au DT, écrire seulement après son accord. Sans autorisation d'écriture, renvoyer le DT vers l'application.
- Données personnelles : ne pas recopier plus que nécessaire (RGPD). Le serveur ne fournit ni date de naissance, ni licence, ni photo.
- Si le serveur ne répond pas : BellePoule Modern doit être lancé, avec Paramètres → Système → Agent IA (MCP) activé ; jeton dans `BELLEPOULE_MCP_TOKEN`.
