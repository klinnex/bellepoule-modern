---
description: Préparer une journée d'escrime depuis un dossier de fichiers (tireurs, arbitres) — nécessite « Autoriser l'écriture »
argument-hint: <dossier> [nom de la journée] [date AAAA-MM-JJ]
---

Prépare une journée multi-épreuves dans BellePoule Modern avec l'outil MCP `import_day` (skill `bellepoule`). Arguments : $ARGUMENTS

1. Liste les fichiers du dossier indiqué : un fichier de tireurs par épreuve (`.fff`, `.csv`, `.xlsx`, `.xml`, `.cotcot`, `.txt`) et, s'il existe, un fichier d'arbitres Engarde (`nom;prenom;…`). Le dossier doit faire partie des dossiers accessibles à l'agent (Paramètres → Système → Agent IA).
2. Déduis de chaque nom de fichier (ou de son en-tête) l'épreuve : arme E/F/S, sexe M/F/X, catégorie U9…V4. Nom et date de la journée : arguments, sinon les demander. Pistes : `get_settings.defaultStripCount` (salle par défaut) sauf indication contraire.
3. Appelle `import_day` avec `dryRun: true` (chemins **absolus**) et présente un tableau : épreuve, fichier, tireurs lus, ajoutés, doublons, erreurs ; arbitres lus et ajoutés. Pose les questions nécessaires (catégorie incertaine, fichiers ignorés, armes des arbitres).
4. Après l'accord explicite du DT seulement, relance sans `dryRun`. Le même manifeste peut être relancé sans créer de doublon ; un fichier manquant fait échouer l'import sans rien écrire.
5. Arbitres d'une journée avec leurs armes : `import_referees` avec `dayId` et `weapons`.
6. Conclus : épreuves créées, tireurs, arbitres, pistes, et la suite (`/bp-epreuve` le jour J, `/bp-etat` pour suivre la salle).

Si l'outil est refusé (« Écriture désactivée »), demande au DT de cocher Paramètres → Système → Agent IA (MCP) → « Autoriser l'écriture ».
