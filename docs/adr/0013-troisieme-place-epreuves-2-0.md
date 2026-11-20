# ADR-0013 — 3ᵉ place des épreuves 2.0 migrées : le nouveau comportement est accepté

- **Statut** : Acceptée
- **Date** : 2026-11-20
- **Tickets** : #2013, #2022

## Contexte

En 2.0, au passage au tableau, l'application demandait « Match pour la 3ᵉ place ? ». Avec
#2022 (étape A de #2013), le match pour la 3ᵉ place devient un réglage de la formule
(`thirdPlaceMatch`), édité dans la fenêtre de propriétés. La question au passage au tableau
disparaît (`useCompetitionNavigation.ts:214`).

Pour une épreuve créée en 2.0 et ouverte en 3.0, c'est la valeur enregistrée qui s'applique,
sans question. Elle vaut le plus souvent `false`, qui est la valeur par défaut des armes
olympiques et des épreuves par équipes. Une épreuve où l'organisateur répondait « oui » à la
question passera donc sans petite finale s'il ne modifie pas la formule.

## Décision

- On **accepte** ce changement de comportement. On ne rétablit pas la question au passage au
  tableau.
- On le **signale dans les notes de version 3.0**, rubrique « Changements de comportement » :

  > Le match pour la 3ᵉ place se règle désormais dans la formule de l'épreuve (Propriétés →
  > Formule → Tableau). La question posée au lancement du tableau a été retirée. Pour une
  > épreuve créée avec une version précédente, vérifiez ce réglage avant de lancer le tableau.

- On ne fait **pas de migration de données** : on ne peut pas savoir ce que l'organisateur
  aurait répondu.

## Conséquences

- La rédaction de la note de version 3.0 reprend ce paragraphe. Le suivi se fait dans la PR de
  release `dev` → `main`.
- Aucun changement de code.

## Alternatives écartées

- **Garder la question pour les épreuves sans réglage explicite** : il faudrait distinguer « non
  réglé » de « réglé à `false` ». Les épreuves 2.0 ont presque toujours une valeur enregistrée
  par défaut, et la question réapparaîtrait sur des épreuves où le choix est fait.
- **Afficher un bandeau d'avertissement au lancement du tableau** : la formule est visible et
  modifiable avant le lancement. La note de version suffit.
