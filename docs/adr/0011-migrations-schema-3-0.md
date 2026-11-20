# ADR-0011 — Aucune migration de schéma sans ADR jusqu'à la sortie de la 3.0

- **Statut** : Acceptée (arbitrage du 2026-11-20)
- **Date** : 2026-11-20
- **Tickets** : #1978, #1980, #1982

## Contexte

La 3.0 fixe le format de la base pour les utilisateurs de la version stable. Une fois publiée,
une migration ne se modifie plus : toute erreur se corrige par une nouvelle migration, qu'on
maintient ensuite pour toujours.

La migration 45 (journal, #2023) a été mergée sans décision écrite. Il faut déjà la reprendre
avec la migration 46 ([ADR-0007](0007-format-evenement.md)). Or plusieurs chantiers de l'épique
touchent au schéma :

- projections du journal (#1980) ;
- fusion entre postes (#1982) ;
- formules v2 (#2013, #1948) ;
- planning (#1958).

## Décision

- Jusqu'à la sortie de la 3.0.0 sur `main`, **toute migration de schéma exige une ADR
  acceptée**, citée dans la PR. Cela couvre :
  - une nouvelle table ;
  - une colonne ;
  - un index ;
  - un changement de clé ;
  - une migration de données.
- La **migration 46** est autorisée par [ADR-0007](0007-format-evenement.md).
- Une migration mergée sur `dev` ne se modifie plus, même si elle n'a jamais été publiée en
  stable : les pré-versions `dev` l'ont déjà appliquée.
- Chaque migration est livrée avec un test qui part d'une base à la version précédente, données
  comprises.
- Une migration n'emploie que du SQL compris par SQLite 3 et SQLCipher (pas de fonction
  d'extension).
- Les champs ajoutés dans le JSON `competitions.settings` ne sont pas des migrations, mais ils
  suivent [ADR-0012](0012-formule-domaine.md) : pas de nouveau réglage « plat » sans ADR.

## Conséquences

- Les PR de #1980 (projections), #1982 et #2013 (étapes B à E) qui ont besoin du schéma
  commencent par leur ADR.
- La règle s'éteint à la sortie de la 3.0.0. Une ADR pourra la prolonger.
- Cette ADR n'ajoute pas de contrôle en CI. Le label `refactor` et la revue du mainteneur
  ([ADR-0001](0001-processus-adr.md)) suffisent. Un contrôle « nouveau fichier de migration sans
  `ADR-` dans la PR » pourra venir au lot 2 si une migration passe entre les mailles.

## Alternatives écartées

- **Gel total des migrations** : il bloquerait la migration 46, nécessaire avant la 3.0.
- **Contrôle CI obligatoire dès maintenant** : il coûte un script et des exceptions pour un
  risque que la revue couvre déjà, tant que les PR d'architecture ne sont pas en auto-merge.
