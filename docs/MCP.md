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
- Journal des derniers appels (outil, durée, succès) : Paramètres → Système → Agent IA (MCP), IPC `mcp:getLog`.
- Lots JSON-RPC : 20 messages au plus, traités l'un après l'autre.
- Données personnelles minimales : ni date de naissance, ni licence, ni photo (RGPD, `docs/RGPD.md`).

## Plugin Claude Code

Dans Claude Code : `/plugin install bellepoule --marketplace BellePoule-Modern/bellepoule-modern`
(depuis un clone : `claude --plugin-dir plugins/bellepoule`), puis `/plugin configure bellepoule`
et `/reload-plugins`. Options (`userConfig`, #1947) :

| Option | Rangement | Repli si non renseignée |
|---|---|---|
| `mcp_token` | Stockage sécurisé du système | `BELLEPOULE_MCP_TOKEN` |
| `mcp_port` | `settings.json` | `BELLEPOULE_MCP_PORT`, sinon 8067 |

Le repli passe par la valeur par défaut des options (`${BELLEPOULE_MCP_TOKEN:-}`), développée
par Claude Code après `${user_config.…}`. Une variable exportée dans `~/.zshrc` ou `~/.bashrc`
n'atteint pas un Claude Code lancé depuis VS Code ou un lanceur graphique : préférer
`/plugin configure`. Après « Nouveau jeton », le reconfigurer. Un jeton absent ou périmé donne
HTTP 401 (`Jeton invalide`), affiché par Claude Code comme `AUTH_HEADER_REJECTED`.

Commandes : `/bp-etat` (état de la salle, lecture seule), `/bp-journee <dossier>` (préparer une journée), `/bp-epreuve <épreuve>`
(conduire une épreuve). Le test `src/main/mcp/plugin.test.ts` vérifie que chaque outil cité par
la skill et les commandes existe.

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
| `import_fencers` | `competitionId`, `path` (absolu ; `.xml` `.cotcot` `.txt` `.csv` `.fff` `.xlsx`, 5 Mo max) | Format détecté (XML FFE / cotcot, FFF, CSV, classeur Excel, TXT) ; doublons ignorés (même licence, ou même nom et prénom) |
| `check_in` | `competitionId`, `fencers` (ids ou dossards), `present` | Pointage ; abandons, exclusions, forfaits laissés tels quels |
| `import_referees` | `path`, et `competitionId` ou `dayId` (+ `weapons[]`) | Arbitres (Engarde, ou XML `<Arbitres>`) d'une épreuve, ou du groupe d'une journée puis reportés dans ses épreuves ; doublons ignorés |
| `start_remote_server` | `competitionId`, `port?` | Serveur des tablettes et écrans (HTTPS et interface : paramètres du poste) |
| `stop_remote_server` | `competitionId` | ⚠️ Arrêt : tablettes et écrans déconnectés |
| `delete_competition` | `competitionId`, `confirmTitle` | ⚠️ Suppression définitive ; titre exact exigé |

## Orchestration sportive (lot 3)

Mêmes fonctions que l'écran (`src/shared/utils/poolOrchestration.ts`, calcul du tableau), exécutées
dans le main (`src/main/engine/commands/sport.ts`). Chaque écriture met à jour les tables **et** l'état de
session, puis prévient l'écran (`competition:event` : `session:changed`), qui le relit. L'état de
session porte une révision : une sauvegarde de l'écran faite sur un état périmé est refusée, puis relue.

| Outil | Arguments | Effet |
|---|---|---|
| `generate_pools` | `competitionId`, `poolCount?`, `minPerPool?`, `maxPerPool?`, `separation?`, `composition?`, `replace?`, `dryRun?` | Tirage sur les tireurs pointés (serpentin, clubs et régions séparés), ou composition préparée (`composition`) ; poules lancées, poule n sur la piste n ; `PoolsGenerated` au journal. ⚠️ `replace` efface des poules jouées ou un tableau |
| `assign_referees` | `competitionId`, `replace?`, `includeUnchecked?` | Un arbitre principal par poule, pointé, hors club des tireurs, charge équilibrée |
| `record_score` | `competitionId`, `matchId`, `scoreA`, `scoreB`, `winner?`, `specialStatus?`, `priority?`, `dryRun?` | Score de poule ou de tableau, contrôles de l'écran (score max, égalité, abandon / forfait / exclusion propagés) ; `dryRun` contrôle sans écrire |
| `build_bracket` | `competitionId`, `thirdPlaceMatch?`, `replace?` | Tableau depuis le classement après poules. ⚠️ `replace` efface un tableau joué |
| `export_results` | `competitionId`, `format` (`xml` / `fff` / `csv` / `html` / `pdf`), `path`, `overwrite?` | Fichier de résultats dans un dossier accessible à l'agent |

Formats pilotables : épreuve individuelle, un tour de poules, tableau simple avec ou sans petite
finale. Équipes, rapières, tours de poules multiples et « tirer toutes les places » restent à
l'écran (erreur `unsupported_format`) pour `generate_pools` sans `composition`, `assign_referees` et `build_bracket`.
`record_score` accepte aussi les tours multiples (tour courant ; tour terminé figé : `round_closed`),
les rapières et « toutes les places » (barrages, tableaux de classement listés par `list_matches`
avec leur nom dans `bracket`). Refusés : épreuves par équipes, tableaux séparés après les poules.

## Paramétrage du poste et salles

Table `app_settings` (langue, thème, logo, HTTPS et interface du serveur distant, dossiers de
l'agent) et salles (`venues`, `venue_strips`) : lisibles en `--headless`. Les réglages de l'écran
(`localStorage`) y sont recopiés ; une modification par l'agent (`update_settings`) est appliquée à
l'écran ouvert (langue, thème). Au premier démarrage, les pistes déjà déclarées (journées, clubs)
deviennent la salle par défaut.

La salle par défaut fournit ses pistes aux nouvelles journées, aux nouveaux clubs et au nombre
d'arènes proposé par le serveur distant ; chaque piste peut porter un libellé et un appareil Cyrano
(IP, port, mode), repris par Cyrano tant que l'épreuve ou sa journée n'a pas sa propre table
(Paramètres → Salles et pistes).

| Outil | Arguments | Effet |
|---|---|---|
| `update_settings` | `language?`, `theme?`, `remoteHttps?`, `remoteInterface?` | Paramètres du poste (liste fermée : ni MCP, ni dossiers de l'agent) |
| `upsert_venue` | `name`, `id?`, `stripCount?`, `isDefault?` | Salle et ses pistes ; la première devient la salle par défaut |
| `set_default_venue` | `venueId` | Salle par défaut |

## Séances du club (Mode Club, #1872)

Mêmes dépôts que l'onglet Séances (`db.club`). Lecture : `list_clubs`, `list_club_sessions`,
`get_club_session` (présents et encadrement par nom, plan, notes, bilan). Écriture, sur autorisation :

| Outil | Effet |
|---|---|
| `create_club_session` | Séance du club : date, intitulé, arme, pistes, maîtres d'armes, objectifs, tranche d'âge ; `planned: true` la prépare sans l'ouvrir |
| `start_club_session` | Ouvre une séance préparée |
| `close_club_session` | Ferme une séance ouverte : combats non terminés annulés, séance déliée du serveur d'entraînement |
| `reopen_club_session` | Rouvre une séance fermée |
| `update_club_session` | Modifie les champs fournis, dont le bilan (`feedback` : `rating` 1 à 5, `wentWell`, `toImprove`) et les notes |
| `check_in_club_members` | Pointe (`present: true`) ou dépointe des membres (200 au plus par appel) |

Pas de suppression de séance par l'agent, ni de saisie de combats : à l'écran. Pas de données
personnelles au-delà des noms (ni licence, ni date de naissance). Aucune notification n'est
encore envoyée à l'écran du club après une écriture de l'agent.


| Fichier | Rôle |
|---|---|
| `src/main/mcp/mcpTools.ts` | Outils en lecture |
| `src/main/mcp/mcpWriteTools.ts` | Outils d'écriture (lot 2) |
| `src/main/mcp/mcpAdminTools.ts` | Paramétrage, salles, arbitres, serveur distant, suppression |
| `src/main/mcp/mcpSportTools.ts` | Orchestration sportive (lot 3) |
| `src/main/mcp/mcpClubTools.ts` | Séances du Mode Club |
| `src/main/engine/commands/` | Commandes du moteur (ADR-0003, ex-`src/main/domain`) : `sport.ts` (poules, scores, tableau), `exportResults.ts`, `settings.ts`, `files.ts` |
| `src/main/batchImport.ts`, `src/main/cliArgs.ts` | `--batch-import`, `--mcp*` |
| `src/main/mcp/mcpServer.ts` | Serveur HTTP JSON-RPC, jeton, contrôle Host / Origin |
| `src/main/mcp/mcpSettings.ts` | Réglages et jeton chiffré |
| `src/main/ipc/mcpHandlers.ts` | IPC `mcp:*`, démarrage à l'ouverture de la base |
| `src/renderer/components/McpSettingsSection.tsx` | Section des Paramètres |
| `plugins/bellepoule/` | Plugin Claude Code : `.mcp.json`, skill, commandes `/bp-etat`, `/bp-journee`, `/bp-epreuve` ; marketplace `.claude-plugin/marketplace.json` |

## Suite (épique #1880)

L'écran garde son propre état : la source de vérité unique dans le main (tablettes et Cyrano
compris) reste à faire, de même que le calcul du tableau déplacé de `src/renderer` vers
`src/shared`, les cartons dans `record_score` et l'affectation des arbitres par `refereeManager`.

<!-- outils-mcp:début (généré par npm run docs:mcp, ne pas éditer) -->

## Référence des outils (45)

Générée depuis les schémas des outils (`src/main/mcp/*Tools.ts`).

### En lecture (17)

### `list_competitions` — Lister les épreuves

*lecture.* Épreuves enregistrées : titre, date, arme, sexe, catégorie, journée, phase en cours.

Aucun argument.

### `get_competition` — Détail d’une épreuve

*lecture.* Détail d’une épreuve : réglages, phases, nombre de tireurs et de poules.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |

### `list_fencers` — Tireurs d’une épreuve

*lecture.* Tireurs d’une épreuve : nom, club, statut de pointage, classement.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |

### `get_pool_ranking` — Classement des poules

*lecture.* Classement de chaque poule (ou d’une poule) : victoires, indice, rang ; avancement des matchs.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `poolId` | string |  | Restreint à une poule (facultatif) |

### `get_bracket` — Tableau d’élimination directe

*lecture.* Matchs du tableau : tour, tireurs, score, vainqueur (exempts inclus).

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |

### `list_referees` — Arbitres d’une épreuve

*lecture.* Arbitres d’une épreuve : nom, club, catégorie, statut.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |

### `day_overview` — Journée multi-épreuves

*lecture.* Sans dayId : journées enregistrées. Avec dayId : épreuves, statut des arbitres partagés et conflits.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `dayId` | string |  | Identifiant de la journée |

### `strip_occupation` — Occupation des pistes

*lecture.* Pistes de la journée : épreuve et match en cours, piste libre ou réservée.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `dayId` | string | oui | Identifiant de la journée |

### `server_status` — Serveur de saisie distante

*lecture.* Serveurs distants actifs : URL, séance ouverte, arènes (match, score, statut), écrans connectés.

Aucun argument.

### `cyrano_status` — Appareils de piste Cyrano

*lecture.* Serveur Cyrano : en marche, port, pistes déclarées et dernier statut reçu.

Aucun argument.

### `list_matches` — Lister les matchs

*lecture.* Matchs de poule et de tableau d’une épreuve avec leur identifiant (matchId pour record_score), tireurs, score, état (ready : à tirer, done : joué, pending : tireur attendu) et piste.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `poolNumber` | number |  | Matchs d’une poule seulement |
| `state` | `pending`, `ready`, `done` |  |  |

### `get_settings` — Paramètres du poste

*lecture.* Paramètres globaux du poste (langue, thème, HTTPS et interface du serveur distant) et nombre de pistes de la salle par défaut. Aucun secret.

Aucun argument.

### `list_venues` — Lister les salles

*lecture.* Salles déclarées et leurs pistes ; la salle par défaut fournit ses pistes aux journées.

Aucun argument.

### `list_clubs` — Lister les clubs

*lecture.* Clubs du Mode Club : identifiant, nom, nombre de pistes, arme par défaut.

Aucun argument.

### `list_club_sessions` — Lister les séances d’un club

*lecture.* Séances d’un club, les plus récentes d’abord : identifiant, date, intitulé, statut (planned : préparée ; open : ouverte ; closed : fermée), nombre de présents. Filtres facultatifs par période et par statut.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `clubId` | string | oui | Identifiant du club (list_clubs) |
| `from` | string |  | Date minimale AAAA-MM-JJ |
| `to` | string |  | Date maximale AAAA-MM-JJ |
| `status` | `planned`, `open`, `closed` |  |  |

### `get_club_session` — Détail d’une séance

*lecture.* Séance d’un club : date, intitulé, arme, statut, maîtres d’armes et présents (noms), plan de cours (titres et durées), objectifs, notes et bilan.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `sessionId` | string | oui | Identifiant de la séance (list_club_sessions) |

### `get_competition_events` — Journal d’une épreuve

*lecture.* Journal d’une épreuve (#1980) : événements postérieurs à la révision « since » (resynchronisation, audit), auteur, source et heure. Identifiants seulement, pas de noms.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `since` | integer |  | Dernière révision connue (0 : tout) |
| `limit` | integer |  | Nombre maximum (1000) |

### En écriture, sur autorisation (28)

### `create_competition` — Créer une épreuve

*écriture.* Crée une épreuve avec les réglages par défaut de l’application (identiques à la fenêtre « Nouvelle compétition »).

| Argument | Type | Requis | Description |
|---|---|---|---|
| `title` | string | oui |  |
| `date` | string | oui | AAAA-MM-JJ |
| `weapon` | `E`, `F`, `S` | oui |  |
| `gender` | `M`, `F`, `X` | oui |  |
| `category` | `U9`, `U11`, `U13`, `U15`, `U17`, `U20`, `SEN`, `V1`, `V2`, `V3`, `V4` | oui |  |
| `location` | string |  |  |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `import_fencers` — Importer des tireurs

*écriture, idempotent.* Importe un fichier de tireurs (XML FFE / cotcot, FFF, CSV, TXT) dans une épreuve. Doublons (même licence, ou même nom et prénom) ignorés.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui |  |
| `path` | string | oui | Chemin absolu du fichier sur le poste DT |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `import_day` — Préparer une journée

*écriture, idempotent.* Crée (ou complète) une journée multi-épreuves à partir d’un manifeste : épreuves, fichiers de tireurs, fichier d’arbitres (Engarde). Relancer le même manifeste ne crée aucun doublon (journée par nom + date, épreuve par titre, tireurs et arbitres dédoublonnés).

| Argument | Type | Requis | Description |
|---|---|---|---|
| `name` | string | oui |  |
| `date` | string | oui | AAAA-MM-JJ |
| `stripCount` | number |  |  |
| `location` | string |  |  |
| `competitions` | object[] | oui |  |
| `refereesFile` | string |  | Fichier d’arbitres Engarde (.txt / .csv) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `update_settings` — Modifier les paramètres du poste

*écriture, idempotent.* Modifie des paramètres globaux validés par schéma. Les réglages du serveur MCP et les dossiers accessibles à l’agent ne se changent que dans l’application.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `language` | `fr`, `en`, `br`, `ca`, `de`, `es`, `pt`, `it`, `ru`, `zh-HK` |  |  |
| `theme` | string |  |  |
| `remoteHttps` | boolean |  | Serveur distant en HTTPS |
| `remoteInterface` | string |  | Interface d’écoute du serveur distant (0.0.0.0 = toutes) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `upsert_venue` — Déclarer une salle

*écriture, idempotent.* Crée ou remplace une salle et ses pistes. La première salle devient la salle par défaut ; ses pistes sont reprises par les nouvelles journées.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `id` | string |  | Salle existante à remplacer (absent = création) |
| `name` | string | oui |  |
| `stripCount` | number |  | Nombre de pistes numérotées 1…n |
| `isDefault` | boolean |  | Salle par défaut |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `set_default_venue` — Salle par défaut

*écriture, idempotent.* Choisit la salle utilisée par défaut (list_venues).

| Argument | Type | Requis | Description |
|---|---|---|---|
| `venueId` | string | oui |  |

### `import_referees` — Importer des arbitres

*écriture, idempotent.* Importe un fichier d’arbitres (Engarde .txt / .csv, ou XML avec <Arbitres>) dans une épreuve (« competitionId »), ou dans le groupe d’une journée (« dayId », avec leurs armes d’arbitrage) puis les reporte dans ses épreuves. Doublons ignorés.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string |  | Identifiant de la compétition (list_competitions) |
| `dayId` | string |  | Journée (day_overview) : arbitres partagés |
| `path` | string | oui | Chemin absolu du fichier sur le poste DT |
| `weapons` | `E`, `F`, `S`[] |  | Armes d’arbitrage (journée) ; vide = toutes |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `start_remote_server` — Démarrer le serveur distant

*écriture.* Démarre le serveur des tablettes d’arbitre et écrans d’arène d’une épreuve (HTTPS et interface : paramètres du poste ; une arène par poule, sinon par piste de la journée ou de la salle). Il écoute sur le réseau local : accord du DT indispensable.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `port` | number |  | Port (défaut 8066) |

### `stop_remote_server` — Arrêter le serveur distant

*⚠️ écriture, destructif, idempotent.* Arrête le serveur distant d’une épreuve : tablettes et écrans déconnectés. Accord du DT indispensable.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |

### `delete_competition` — Supprimer une épreuve

*⚠️ écriture, destructif.* Supprime définitivement une épreuve et toutes ses données. Exige son titre exact (« confirmTitle ») et l’accord du DT.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `confirmTitle` | string | oui |  |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `build_bracket` — Construire le tableau

*⚠️ écriture, destructif.* Tableau d’élimination directe depuis le classement après poules (poules terminées ; abandons, forfaits, exclus et éliminés écartés). Petite finale selon l’épreuve, ou « thirdPlaceMatch ». « replace: true » efface un tableau déjà joué : accord du DT indispensable.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `thirdPlaceMatch` | boolean |  | Match pour la 3e place |
| `replace` | boolean |  | Remplacer un tableau existant |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `export_results` — Exporter les résultats

*écriture, idempotent.* Écrit les résultats dans un fichier d’un dossier accessible à l’agent : xml (BellePoule / FFE), fff (classement FFE), csv (classement après poules), html ou pdf (classement final). « overwrite: true » pour remplacer un fichier existant.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `format` | `xml`, `fff`, `csv`, `html`, `pdf` | oui |  |
| `path` | string | oui | Chemin absolu du fichier à écrire |
| `overwrite` | boolean |  | Remplacer un fichier existant |

### `create_club_session` — Créer une séance

*écriture.* Crée une séance d’un club : date, intitulé, arme, pistes, maîtres d’armes, objectifs, tranche d’âge du cours. « planned: true » la prépare sans l’ouvrir (start_club_session l’ouvre ensuite) ; sinon elle est ouverte tout de suite.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `clubId` | string | oui | Identifiant du club (list_clubs) |
| `date` | string | oui | Date AAAA-MM-JJ |
| `label` | string |  | Intitulé de la séance |
| `weapon` | `E`, `F`, `S`, `L` |  | Arme (règles de la saisie distante) |
| `stripCount` | number |  | Nombre de pistes |
| `coachIds` | string[] |  | Maîtres d’armes encadrant (identifiants du club) |
| `objectives` | string |  |  |
| `planned` | boolean |  | Séance préparée, non ouverte |
| `ageFrom` | string |  | Catégorie d’âge de début du cours (U9 … V4) |
| `ageTo` | string |  | Catégorie d’âge de fin du cours (U9 … V4) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `start_club_session` — Ouvrir une séance préparée

*écriture.* Ouvre une séance préparée (statut planned). Les autres séances ouvertes restent ouvertes.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `sessionId` | string | oui | Identifiant de la séance (list_club_sessions) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `close_club_session` — Fermer une séance

*écriture.* Ferme une séance ouverte. Les combats non terminés sont annulés et la séance est déliée du serveur d’entraînement. Réouverture possible (reopen_club_session).

| Argument | Type | Requis | Description |
|---|---|---|---|
| `sessionId` | string | oui | Identifiant de la séance (list_club_sessions) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `reopen_club_session` — Rouvrir une séance

*écriture.* Rouvre une séance fermée.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `sessionId` | string | oui | Identifiant de la séance (list_club_sessions) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `update_club_session` — Modifier une séance

*écriture, idempotent.* Modifie une séance : date, intitulé, arme, pistes, maîtres d’armes, objectifs, notes, tranche d’âge, bilan (note 1 à 5, points forts, à améliorer). Seuls les champs fournis changent.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `sessionId` | string | oui | Identifiant de la séance (list_club_sessions) |
| `date` | string |  | Date AAAA-MM-JJ |
| `label` | string |  |  |
| `weapon` | `E`, `F`, `S`, `L` |  |  |
| `stripCount` | number |  |  |
| `coachIds` | string[] |  |  |
| `objectives` | string |  |  |
| `notes` | string |  | Compte rendu du maître d’armes |
| `feedback` | object |  | Bilan : rating (1 à 5), wentWell, toImprove |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `check_in_club_members` — Pointer les membres d’une séance

*écriture, idempotent.* Pointe (present: true) ou dépointe (present: false) des membres du club pour une séance. Les identifiants viennent de list_members côté écran ; get_club_session donne les présents.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `sessionId` | string | oui | Identifiant de la séance (list_club_sessions) |
| `memberIds` | string[] | oui | Identifiants des membres (200 au plus) |
| `present` | boolean | oui | true : pointer ; false : dépointer |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |

### `check_in` — Pointer des tireurs

*écriture, idempotent.* Pointe (présent) ou dépointe des tireurs d’une épreuve, par identifiant ou numéro de dossard (ref).

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `fencers` | string / integer[] | oui | Identifiants ou numéros (ref) |
| `present` | boolean | oui | true : présent ; false : absent |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `record_score` — Saisir un score

*écriture, idempotent.* Score d’un match de poule (tour courant) ou de tableau, tableaux de classement compris (matchId : list_matches), mêmes contrôles que l’écran : score maximum, égalité tranchée par « winner » (ou « priority » en poule), statut spécial du perdant. Classements recalculés ; au tableau, le vainqueur passe au tour suivant. Ne saisir que des scores donnés par le DT ; « dryRun: true » contrôle le score sans l’écrire.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `matchId` | string | oui | Identifiant du match (list_matches) |
| `scoreA` | integer | oui | Touches du tireur A |
| `scoreB` | integer | oui | Touches du tireur B |
| `winner` | `A`, `B` |  | Vainqueur imposé |
| `specialStatus` | `abandon`, `forfait`, `exclusion` |  | Statut du perdant |
| `blackCard` | boolean |  | Exclusion sur carton noir (motif du rapport fédéral) |
| `priority` | `A`, `B` |  | Égalité en poule : prioritaire |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `generate_pools` — Générer les poules

*⚠️ écriture, destructif.* Poules du tour courant, lancées (phase Poules). Sans « composition » : tirage sur les tireurs pointés par la même fonction que l’écran (serpentin sur le classement, puis clubs et régions séparés, ou les critères de « separation »), poule n sur la piste n ; épreuve individuelle, un tour de poules. Avec « composition » : poules et ordre des matchs retenus par le DT à la préparation, tels quels (tous formats individuels, tours multiples compris). « replace: true » efface des poules déjà jouées ou un tableau : accord du DT indispensable.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `poolCount` | integer |  | Nombre de poules (défaut : optimal) |
| `minPerPool` | integer |  | Tireurs par poule, minimum (défaut 5) |
| `maxPerPool` | integer |  | Tireurs par poule, maximum (défaut 7) |
| `separation` | `byRanking`, `byClub`, `byRegion`, `byNation`[] |  | Critères actifs, par priorité (comme l’écran) : avant « byRanking », ils priment sur le classement ; après, échanges dans le chapeau. Défaut : ["byRanking", "byClub", "byRegion"] |
| `composition` | object[] |  | Poules préparées par le DT (écran) : pas de tirage |
| `replace` | boolean |  | Remplacer des poules ou un tableau existants |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `add_pool_fencer` — Ajouter un tireur à une poule

*écriture.* Ajoute un tireur à une poule lancée (tireur arrivé en retard) : un match contre chaque tireur de la poule, à la suite des matchs existants. Refus si le tableau est tiré ou si le tireur est déjà placé.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `poolId` | string | oui | Identifiant de la poule |
| `fencerId` | string | oui | Identifiant du tireur |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `close_pool_round` — Clore le tour de poules

*⚠️ écriture, destructif.* Clôt le tour de poules courant (toutes les poules terminées) : qualifiés selon le classement du tour (formule, puis réglage du nombre de qualifiés, ou « qualifierCount »), non-qualifiés éliminés, tour archivé ; le tour suivant se pointe puis se tire. « dryRun: true » donne le nombre de qualifiés et d’éliminés sans rien écrire. Refus sous 4 qualifiés.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `qualifierCount` | integer |  | Nombre de qualifiés imposé |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `withdraw_fencer` — Retirer un tireur

*⚠️ écriture, destructif.* Retire un tireur de l’épreuve : abandon (médical), forfait ou exclusion (« blackCard » : carton noir). À l’appel : statut seul. En poules : ses matchs non disputés sont perdus (DNS s’il n’a commencé aucun match). Au tableau : son match en cours est perdu, l’adversaire passe. Refus si le tableau est terminé ou si l’adversaire n’est pas encore connu. « dryRun: true » donne les matchs perdus sans rien écrire. Annulation : reinstate_fencer.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `fencerId` | string | oui | Identifiant du tireur |
| `reason` | `abandon`, `forfait`, `exclusion` | oui | Motif du retrait |
| `blackCard` | boolean |  | Exclusion sur carton noir (rapport fédéral) |
| `matchId` | string |  | Match où le retrait a lieu (carton, abandon sur la piste) |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `reinstate_fencer` — Réintégrer un tireur

*écriture.* Annule le retrait d’un tireur (abandon, forfait, exclusion) : statut et matchs d’avant le retrait. Refus si un match qui suit a été joué depuis, ou si le tableau a été tiré après un retrait en poules.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `fencerId` | string | oui | Identifiant du tireur |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `set_refereeing_settings` — Réglages d’affectation des arbitres

*écriture, idempotent.* Réglages d’affectation des arbitres de l’épreuve (neutralité club / nation / ligue, équilibrage de la charge, rotation). Seuls les champs fournis changent ; les autres réglages de l’épreuve sont conservés.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `neutrality` | object |  |  |
| `balance` | boolean |  | Équilibrer la charge entre arbitres |
| `maxConsecutiveMatches` | integer |  |  |
| `minRestTimeMinutes` | integer |  |  |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `assign_referees` — Arbitres des poules

*écriture, idempotent.* Un arbitre principal par poule sans arbitre, parmi les arbitres pointés, par le même moteur que l’écran (affectation optimale, neutralité selon les réglages de l’épreuve ; un arbitre peut enchaîner plusieurs poules). Une poule sans arbitre neutre reste sans arbitre : « unassigned » donne les arbitres écartés et leurs raisons, « warnings » le résumé. « replace: true » réaffecte toutes les poules.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `replace` | boolean |  | Réaffecter toutes les poules |
| `includeUnchecked` | boolean |  | Accepter les arbitres non pointés |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

### `assign_referee` — Arbitre d’une poule (à la main)

*écriture, idempotent.* Arbitre d’une poule choisi à la main : il remplace l’arbitre principal et passe sur les matchs de la poule. Un arbitre non neutre est accepté et signalé (« conflicts »). « refereeId: null » retire l’arbitre.

| Argument | Type | Requis | Description |
|---|---|---|---|
| `competitionId` | string | oui | Identifiant de la compétition (list_competitions) |
| `poolNumber` | integer | oui | Numéro de la poule |
| `refereeId` | string / null | oui | Identifiant de l’arbitre (list_referees), ou null |
| `dryRun` | boolean |  | Décrit le résultat sans rien écrire |
| `expectedRevision` | integer |  | Révision attendue du journal de l’épreuve : refus « revision_conflict » si une autre commande du contrat a écrit entre-temps. Les écritures qui ne passent pas encore par le contrat (écran, tablettes) ne sont pas détectées. |
| `commandId` | string |  | Identifiant de la commande, choisi par l’appelant (UUID) : une commande rejouée avec le même identifiant n’écrit rien et est refusée par « command_already_applied » (renvoi après une coupure réseau) |

<!-- outils-mcp:fin -->
