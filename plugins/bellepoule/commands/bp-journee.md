---
description: Préparer une journée d'escrime depuis un dossier de fichiers (tireurs, arbitres) — nécessite « Autoriser l'écriture »
---

Prépare une journée multi-épreuves dans BellePoule Modern avec l'outil MCP `import_day`.

1. Liste les fichiers du dossier indiqué ($ARGUMENTS) : un fichier de tireurs par épreuve (`.xml`, `.txt`, `.csv`, `.fff`) et, s'il existe, un fichier d'arbitres Engarde.
2. Déduis de chaque nom de fichier l'épreuve (arme E/F/S, sexe M/F/X, catégorie U9…V4) ; demande au DT ce qui est ambigu.
3. Appelle `import_day` avec `dryRun: true` (chemins **absolus**), montre le rapport : épreuves créées, tireurs lus / doublons, arbitres, erreurs.
4. Après l'accord explicite du DT seulement, relance sans `dryRun`. Le même manifeste peut être relancé sans créer de doublon.

Si l'outil est refusé (« Écriture désactivée »), demande au DT de cocher Paramètres → Système → Agent IA (MCP) → « Autoriser l'écriture ».
