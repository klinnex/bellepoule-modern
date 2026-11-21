# Décisions d'architecture (ADR)

Une ADR consigne **une** décision d'architecture : son contexte, ce qui est décidé, ce que cela coûte.
Elle est courte, datée, numérotée, et ne se réécrit pas : une décision qui change fait l'objet
d'une nouvelle ADR, qui **remplace** l'ancienne (statut « Remplacée par ADR-00xx »).

Origine : #1979 (lot 1), épique #1978. Format et processus : [ADR-0001](0001-processus-adr.md).

## Index

| N° | Décision | Statut |
|---|---|---|
| [0001](0001-processus-adr.md) | Processus : ADR, revue du mainteneur, pas d'auto-merge pour l'architecture | Acceptée |
| [0002](0002-couches-et-dependances.md) | Couches, sens des dépendances, domaine pur dans `src/shared/domain` | Acceptée |
| [0003](0003-main-domain-couche-application.md) | `src/main/domain` devient la couche d'application (`src/main/engine/commands`) | Acceptée |
| [0004](0004-features-couche-interface.md) | `src/features` est une couche d'interface | Acceptée |
| [0005](0005-journal-un-fait-un-chemin.md) | Journal : un fait, un chemin | Acceptée |
| [0006](0006-expected-revision.md) | `expectedRevision` : contrôle dans la transaction, portée documentée | Acceptée |
| [0007](0007-format-evenement.md) | Format d'événement du journal et migration 46 | Acceptée |
| [0008](0008-nommage-contrat.md) | Nommage et forme des opérations du contrat | Acceptée |
| [0009](0009-codes-erreur.md) | Catalogue des codes d'erreur (`ApiError`, `DomainError`) | Acceptée |
| [0010](0010-bus-evenements.md) | Un seul bus : journal d'un côté, signaux de changement de l'autre | Acceptée |
| [0011](0011-migrations-schema-3-0.md) | Aucune migration de schéma sans ADR jusqu'à la 3.0 | Acceptée |
| [0012](0012-formule-domaine.md) | Formule : modèle dans `shared/domain/formula`, validée par le moteur à chaque écriture | Acceptée |
| [0013](0013-troisieme-place-epreuves-2-0.md) | 3ᵉ place des épreuves 2.0 migrées : nouveau comportement accepté | Acceptée |
| [0014](0014-affectation-arbitres-moteur-unique.md) | Un seul moteur d'affectation des arbitres, appelé par une commande | Acceptée (principe) |
| [0015](0015-plan-des-pistes-moteur.md) | Le plan des pistes est une donnée du moteur (migration 47) | Acceptée (principe) |
| [0016](0016-retrait-reintegration-tireur.md) | Retrait et réintégration d'un tireur : `withdrawFencer`, `reinstateFencer` | Proposée |

**Acceptée** : tranchée par le mainteneur le 2026-11-20 (revue de #2020, #2022 et #2023, commentaire sur #1979 ; arbitrages de la PR #2029).
**Proposée** : acceptée au merge de la PR qui l'introduit, ou amendée en revue.

## Modèle

```markdown
# ADR-00xx — Titre à l'indicatif (« X devient Y », « On fait Z »)

- **Statut** : Proposée | Acceptée | Remplacée par ADR-00yy
- **Date** : AAAA-MM-JJ
- **Tickets** : #…

## Contexte
Le problème, les faits (fichiers, chiffres), la contrainte. Pas la solution.

## Décision
Ce qui est décidé, en phrases qui commencent par « On ». Vérifiable dans le code.

## Conséquences
Ce que ça coûte, ce que ça interdit, ce qui reste à faire (lot, ticket).

## Alternatives écartées
Option — raison du refus.
```
