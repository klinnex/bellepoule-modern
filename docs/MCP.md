# Agent IA — serveur MCP intégré (#1880)

BellePoule Modern expose un serveur [MCP](https://modelcontextprotocol.io) dans le process main,
**en lecture** et, sur autorisation, en **écriture** (administrative et sportive) : un agent (Claude Code avec le plugin `plugins/bellepoule`, ou tout client MCP)
interroge la salle en langage naturel, prépare une journée, tire les poules, saisit des scores, construit le tableau et exporte les résultats.

## Activation et sécurité

- **Désactivé par défaut.** Paramètres → Système → **Agent IA (MCP)** : activer, choisir le port
  (8067 par défaut), copier la configuration `.mcp.json`.
- Écoute sur `127.0.0.1` uniquement ; `Host` et `Origin` limités à la boucle locale (DNS rebinding).
- Jeton `Authorization: Bearer …` obligatoire (256 bits), stocké dans `<userData>/mcp-token.bin`,
  chiffré par `safeStorage` ; « Nouveau jeton » invalide l'ancien.
- Réglages : `<userData>/mcp-settings.json`. Fonctionne aussi en `--headless`.
- Un jeton enregistré mais illisible (autre trousseau : service, SSH, session sans bureau) n'est
  jamais remplacé en silence : le serveur ne démarre pas (erreur `token_unreadable`), l'opérateur
  crée un nouveau jeton (Paramètres, ou `--mcp-new-token`).
- **Dossiers accessibles à l'agent** (Paramètres → Système → Agent IA ; par défaut Documents,
  Téléchargements et Bureau) : les fichiers d'import ne sont lus, et les exports écrits, que dans
  ces dossiers (chemin réel contrôlé). L'agent ne peut pas modifier cette liste.
- Rendu PDF (`export_results`) dans une session isolée : ni fichier local ni réseau ; données échappées.
- Journal des derniers appels (outil, durée, succès) : IPC `mcp:getLog`.
- Données personnelles minimales : ni date de naissance, ni licence, ni photo (RGPD, `docs/RGPD.md`).

## Sans écran (ligne de commande)

```bash
bellepoule-modern --headless --mcp                # MCP activé pour cette exécution (réglages enregistrés inchangés)
bellepoule-modern --headless --mcp --mcp-write    # idem, outils d'écriture autorisés
bellepoule-modern --headless --mcp-port=18067     # idem, sur un autre port
bellepoule-modern --mcp-print-config              # affiche le bloc .mcp.json (URL, jeton) puis s'arrête
bellepoule-modern --mcp-new-token                 # crée un nouveau jeton, puis l'affiche de la même façon
bellepoule-modern --batch-import journee.json [--dry-run]   # import d'une journée, rapport JSON, code 0 / 1
```

`--batch-import` prend un manifeste de la forme des arguments d'`import_day` (ci-dessous) ; ses
chemins `fencersFile` / `refereesFile` peuvent être relatifs au manifeste. Lancé par l'opérateur,
il n'est pas limité aux dossiers de l'agent.

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
| `list_matches` | `competitionId`, `poolNumber?`, `state?` (`pending` / `ready` / `done`) | Matchs de poule et de tableau : `matchId`, tireurs, score, état, piste |
| `get_settings` | — | Paramètres du poste (langue, thème, HTTPS et interface du serveur distant), pistes de la salle par défaut |
| `list_venues` | — | Salles déclarées et leurs pistes |

## Outils d'écriture (lot 2)

Proposés seulement si **« Autoriser l'écriture »** est coché (désactivé par défaut) ; sinon refusés.
Chaque outil accepte `dryRun: true` (rapport sans écriture). Toute écriture prévient l'écran
(`competition:event` : `competitions:changed`, `fencers:changed`), qui se recharge.

| Outil | Arguments | Effet |
|---|---|---|
| `import_day` | `name`, `date`, `stripCount?`, `location?`, `competitions[]` (`title`, `weapon`, `gender`, `category`, `fencersFile?`), `refereesFile?` | Journée multi-épreuves complète ; **idempotent** : journée retrouvée par nom + date, épreuve par titre, tireurs et arbitres dédoublonnés |
| `create_competition` | `title`, `date`, `weapon` (E/F/S), `gender` (M/F/X), `category`, `location?` | Épreuve créée avec les réglages par défaut de la fenêtre « Nouvelle compétition » (`buildDefaultCompetitionSettings`) |
| `import_fencers` | `competitionId`, `path` (absolu ; `.xml` `.txt` `.csv` `.fff`, 5 Mo max) | Format détecté (XML FFE / cotcot, FFF, TXT) ; doublons ignorés (même licence, ou même nom et prénom) |
| `check_in` | `competitionId`, `fencers` (ids ou dossards), `present` | Pointage ; abandons, exclusions, forfaits laissés tels quels |
| `import_referees` | `path`, et `competitionId` ou `dayId` (+ `weapons[]`) | Arbitres (Engarde, ou XML `<Arbitres>`) d'une épreuve, ou du groupe d'une journée puis reportés dans ses épreuves ; doublons ignorés |
| `start_remote_server` | `competitionId`, `port?` | Serveur des tablettes et écrans (HTTPS et interface : paramètres du poste) |
| `stop_remote_server` | `competitionId` | ⚠️ Arrêt : tablettes et écrans déconnectés |
| `delete_competition` | `competitionId`, `confirmTitle` | ⚠️ Suppression définitive ; titre exact exigé |

## Orchestration sportive (lot 3)

Mêmes fonctions que l'écran (`src/shared/utils/poolOrchestration.ts`, calcul du tableau), exécutées
dans le main (`src/main/domain/sport.ts`). Chaque écriture met à jour les tables **et** l'état de
session, puis prévient l'écran (`competition:event` : `session:changed`), qui le relit. L'état de
session porte une révision : une sauvegarde de l'écran faite sur un état périmé est refusée, puis relue.

| Outil | Arguments | Effet |
|---|---|---|
| `generate_pools` | `competitionId`, `poolCount?`, `minPerPool?`, `maxPerPool?`, `replace?` | Tirage sur les tireurs pointés (serpentin, clubs et régions séparés), poules lancées, poule n sur la piste n. ⚠️ `replace` efface des poules jouées ou un tableau |
| `assign_referees` | `competitionId`, `replace?`, `includeUnchecked?` | Un arbitre principal par poule, pointé, hors club des tireurs, charge équilibrée |
| `record_score` | `competitionId`, `matchId`, `scoreA`, `scoreB`, `winner?`, `specialStatus?`, `priority?` | Score de poule ou de tableau, contrôles de l'écran (score max, égalité, abandon / forfait / exclusion propagés). Sans `dryRun` |
| `build_bracket` | `competitionId`, `thirdPlaceMatch?`, `replace?` | Tableau depuis le classement après poules. ⚠️ `replace` efface un tableau joué |
| `export_results` | `competitionId`, `format` (`xml` / `fff` / `csv` / `html` / `pdf`), `path`, `overwrite?` | Fichier de résultats dans un dossier accessible à l'agent |

Formats pilotables : épreuve individuelle, un tour de poules, tableau simple avec ou sans petite
finale. Équipes, rapières, tours de poules multiples et « tirer toutes les places » restent à
l'écran (erreur `unsupported_format`).

## Paramétrage du poste et salles

Table `app_settings` (langue, thème, logo, HTTPS et interface du serveur distant, dossiers de
l'agent) et salles (`venues`, `venue_strips`) : lisibles en `--headless`. Les réglages de l'écran
(`localStorage`) y sont recopiés. La salle par défaut fournit ses pistes aux nouvelles journées.

| Outil | Arguments | Effet |
|---|---|---|
| `update_settings` | `language?`, `theme?`, `remoteHttps?`, `remoteInterface?` | Paramètres du poste (liste fermée : ni MCP, ni dossiers de l'agent) |
| `upsert_venue` | `name`, `id?`, `stripCount?`, `isDefault?` | Salle et ses pistes ; la première devient la salle par défaut |
| `set_default_venue` | `venueId` | Salle par défaut |


| Fichier | Rôle |
|---|---|
| `src/main/mcp/mcpTools.ts` | Outils en lecture |
| `src/main/mcp/mcpWriteTools.ts` | Outils d'écriture (lot 2) |
| `src/main/mcp/mcpAdminTools.ts` | Paramétrage, salles, arbitres, serveur distant, suppression |
| `src/main/mcp/mcpSportTools.ts` | Orchestration sportive (lot 3) |
| `src/main/domain/` | Couche domaine : `sport.ts` (poules, scores, tableau), `exportResults.ts`, `settings.ts`, `files.ts` |
| `src/main/batchImport.ts`, `src/main/cliArgs.ts` | `--batch-import`, `--mcp*` |
| `src/main/mcp/mcpServer.ts` | Serveur HTTP JSON-RPC, jeton, contrôle Host / Origin |
| `src/main/mcp/mcpSettings.ts` | Réglages et jeton chiffré |
| `src/main/ipc/mcpHandlers.ts` | IPC `mcp:*`, démarrage à l'ouverture de la base |
| `src/renderer/components/McpSettingsSection.tsx` | Section des Paramètres |
| `plugins/bellepoule/` | Plugin Claude Code : `.mcp.json`, skill, commandes `/bp-etat`, `/bp-journee` |

## Suite (épique #1880)

La salle ne fournit pas encore ses pistes au serveur distant ni ses appareils à Cyrano (aucun écran
pour associer un appareil à une piste de la salle). L'écran garde son propre état : la source de
vérité unique dans le main (tablettes et Cyrano compris) reste à faire.
