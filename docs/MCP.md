# Agent IA — serveur MCP intégré (#1880)

BellePoule Modern expose un serveur [MCP](https://modelcontextprotocol.io) dans le process main,
**en lecture** et, sur autorisation, en **écriture administrative** : un agent (Claude Code avec le plugin `plugins/bellepoule`, ou tout client MCP)
interroge la salle en langage naturel.

## Activation et sécurité

- **Désactivé par défaut.** Paramètres → Système → **Agent IA (MCP)** : activer, choisir le port
  (8067 par défaut), copier la configuration `.mcp.json`.
- Écoute sur `127.0.0.1` uniquement ; `Host` et `Origin` limités à la boucle locale (DNS rebinding).
- Jeton `Authorization: Bearer …` obligatoire (256 bits), stocké dans `<userData>/mcp-token.bin`,
  chiffré par `safeStorage` ; « Nouveau jeton » invalide l'ancien.
- Réglages : `<userData>/mcp-settings.json`. Fonctionne aussi en `--headless`.
- Journal des derniers appels (outil, durée, succès) : IPC `mcp:getLog`.
- Données personnelles minimales : ni date de naissance, ni licence, ni photo (RGPD, `docs/RGPD.md`).

## Transport

« Streamable HTTP », réponses JSON : `POST http://127.0.0.1:<port>/mcp`. Méthodes : `initialize`,
`ping`, `tools/list`, `tools/call` ; notifications acceptées (202). Versions du protocole :
2025-06-18, 2025-03-26, 2024-11-05.

## Outils (lecture)

| Outil | Arguments | Rend |
|---|---|---|
| `list_competitions` | — | Épreuves : titre, date, arme, sexe, catégorie, journée, phase en cours |
| `get_competition` | `competitionId` | Détail, réglages, phases, nombre de tireurs et de poules |
| `list_fencers` | `competitionId` | Tireurs : nom, club, statut de pointage, classement |
| `get_pool_ranking` | `competitionId`, `poolId?` | Classement de chaque poule, matchs joués / total |
| `get_bracket` | `competitionId` | Matchs du tableau : tour, tireurs, score, vainqueur |
| `list_referees` | `competitionId` | Arbitres : nom, club, catégorie, statut |
| `day_overview` | `dayId?` | Journées ; avec `dayId` : arbitres partagés, conflits |
| `strip_occupation` | `dayId` | Pistes de la journée : occupée, libre, réservée |
| `server_status` | — | Serveurs distants : URL, séance, arènes, écrans connectés |
| `cyrano_status` | — | Appareils de piste Cyrano : port, pistes, statut, alertes |

## Outils d'écriture (lot 2)

Proposés seulement si **« Autoriser l'écriture »** est coché (désactivé par défaut) ; sinon refusés.
Chaque outil accepte `dryRun: true` (rapport sans écriture). Toute écriture prévient l'écran
(`competition:event` : `competitions:changed`, `fencers:changed`), qui se recharge.

| Outil | Arguments | Effet |
|---|---|---|
| `create_competition` | `title`, `date`, `weapon` (E/F/S), `gender` (M/F/X), `category`, `location?` | Épreuve créée avec les réglages par défaut de la fenêtre « Nouvelle compétition » (`buildDefaultCompetitionSettings`) |
| `import_fencers` | `competitionId`, `path` (absolu ; `.xml` `.txt` `.csv` `.fff`, 5 Mo max) | Format détecté (XML FFE / cotcot, FFF, TXT) ; doublons ignorés (même licence, ou même nom et prénom) |
| `check_in` | `competitionId`, `fencers` (ids ou dossards), `present` | Pointage ; abandons, exclusions, forfaits laissés tels quels |


| Fichier | Rôle |
|---|---|
| `src/main/mcp/mcpTools.ts` | Outils en lecture |
| `src/main/mcp/mcpWriteTools.ts` | Outils d'écriture (lot 2) |
| `src/main/mcp/mcpServer.ts` | Serveur HTTP JSON-RPC, jeton, contrôle Host / Origin |
| `src/main/mcp/mcpSettings.ts` | Réglages et jeton chiffré |
| `src/main/ipc/mcpHandlers.ts` | IPC `mcp:*`, démarrage à l'ouverture de la base |
| `src/renderer/components/McpSettingsSection.tsx` | Section des Paramètres |
| `plugins/bellepoule/` | Plugin Claude Code : `.mcp.json`, skill, commande `/bp-etat` |

## Suite (épique #1880)

Lot 2 restant : `import_day` (journée complète par manifeste), arbitres, serveur distant ; lot 3 (orchestration sportive dans le main), paramétrage global (`app_settings`, salles).
