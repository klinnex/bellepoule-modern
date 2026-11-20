# ADR-0001 — Les décisions d'architecture passent par une ADR et par la revue du mainteneur

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #1978, #1979

## Contexte

Les PR #2020 (contrat d'API, #1981), #2022 (formule, #2013) et #2023 (journal, #1980) ont été
mergées par l'auto-merge sur `dev` **avant** que #1979 ait posé le cadre. Elles ont figé, sans
décision écrite :

- un schéma SQL (migration 45, `competition_events`) ;
- un format d'événement (`type: string`, `payload` libre) ;
- un catalogue de codes d'erreur implicite (`ApiError` / `DomainError`) ;
- un emplacement pour le modèle de formule (`src/renderer/components/formula/formulaDraft.ts`).

L'ordre prévu par l'épique (#1979 → #1980 / #1981 → #2013) a été inversé. La 3.0 risquait de
sortir avec des choix que personne n'avait tranchés.

## Décision

- On écrit une ADR dans `docs/adr/` **avant** de coder toute décision :
  - de couche ou de sens de dépendance ;
  - de schéma SQL (migration) ;
  - de format d'événement du journal ;
  - de nommage ou de forme du contrat d'API ;
  - de transport (IPC, MCP, WebSocket).
- Une ADR est courte (une page), numérotée, datée. Elle suit le modèle de [README.md](README.md).
- Une ADR acceptée ne se réécrit pas : on en écrit une nouvelle qui la remplace.
- **Relecture** : le mainteneur (`cpoisnel`) relit et accepte les ADR. Pas de revue collective
  obligatoire ; un contributeur peut commenter la PR.
- **Pas d'auto-merge** pour une PR qui porte le label `refactor` ou qui est rattachée à l'épique
  #1978 (#1979–#1982, #2013) : elle reste en draft jusqu'à la revue du mainteneur.
  Règle inscrite dans `CLAUDE.md` (PR #2028).
- Une PR qui applique une ADR la cite dans sa description (`ADR-00xx`).

## Conséquences

- Les tickets #1980 (étapes 2 à 5), #1981 (nouvelles opérations, lots 3 à 5) et #2013
  (étapes B à E) restent gelés jusqu'aux ADR qui les concernent ([0007](0007-format-evenement.md),
  [0008](0008-nommage-contrat.md), [0010](0010-bus-evenements.md), [0012](0012-formule-domaine.md))
  et jusqu'aux lots 3 et 4 de #1979.
- Les agents IA appliquent la règle sans exception : la règle générale « auto-merge par défaut
  sur `dev` » ne vaut pas pour ces PR.
- Coût : une PR d'architecture attend la revue humaine, au lieu d'être mergée dès la CI verte.

## Alternatives écartées

- **Revue collective à chaque décision** — l'équipe est réduite, la décision attendrait.
- **Décisions dans les tickets seulement** — un commentaire d'issue ne vit pas avec le code et se
  perd ; l'ADR est versionnée avec ce qu'elle décrit.
- **Laisser l'auto-merge et corriger après coup** — c'est ce qui a produit la migration 45 sans
  identifiant d'événement : une table publiée ne se corrige que par une nouvelle migration.
