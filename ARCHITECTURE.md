# BellePoule Modern — Architecture

> Version **1.0.3**, build **#1365** (octobre 2026).
> Dépendances et versions : [docs/STACK_TECHNIQUE.md](docs/STACK_TECHNIQUE.md).
> Interface d'arbitrage : [docs/ARBITRAGE.md](docs/ARBITRAGE.md).
> Décisions d'architecture : [docs/adr/](docs/adr/README.md) ; couches et inventaire du renderer : [§ 9](#9-couches-dépendances-et-inventaire-du-renderer-1979).

## 1. Vue d'ensemble

Application **Electron** (poste organisateur) + **serveur web embarqué** (tablettes,
écrans, spectateurs sur le réseau local).

```
┌──────────────────────────── Poste organisateur (Electron 45) ────────────────────────────┐
│                                                                                          │
│  Renderer (React 19 + Zustand)          Preload (contextBridge)        Main (Node 24)    │
│  ┌───────────────────────────┐   IPC   ┌──────────────────┐   IPC   ┌──────────────────┐ │
│  │ App.tsx, CompetitionView  │◀──────▶│ window.electronAPI│◀──────▶│ main.ts          │ │
│  │ PoolView, TableauView ... │         │ db/file/dialog/  │         │ menus, fenêtres, │ │
│  │ src/features/* (stores)   │         │ remote/training/ │         │ ipcMain.handle   │ │
│  │ src/shared/utils (calculs)│         │ updater/crypto/  │         │ autosave 2 min   │ │
│  └───────────────────────────┘         │ themes           │         │ autoUpdater      │ │
│                                         └──────────────────┘         └───────┬──────────┘ │
│                                                                              │            │
│                              ┌───────────────────────────────┐              │            │
│                              │ DatabaseManager (better-sqlite3)│◀────────────┤            │
│                              │ <userData>/bellepoule.db        │              │            │
│                              └───────────────────────────────┘              │            │
│                                                                              ▼            │
│                              ┌────────────────────────────────────────────────────────┐  │
│                              │ RemoteScoreServer — Express 5 + Socket.IO 4             │  │
│                              │ HTTPS (auto-signé) ou HTTP · port 8066 (ou suivant)     │  │
│                              │ pages src/remote/*.html servies en mémoire              │  │
│                              └───────────────────────┬────────────────────────────────┘  │
└──────────────────────────────────────────────────────┼───────────────────────────────────┘
                                                       │ LAN / Wi-Fi
        ┌──────────────────┬───────────────────┬───────┴──────────┬──────────────────┐
        ▼                  ▼                   ▼                  ▼                  ▼
  Tablette arbitre    Écran d'arène       Kiosk / Lobby      Spectateurs        OBS / vMix
  /areneN/arbitre     /areneN             /kiosk, /lobby     /areneN/public     /areneN/overlay
```

## 2. Arborescence

```
bellepoule-modern/
├── src/
│   ├── main/                     # Processus principal Electron
│   │   ├── main.ts               # Fenêtres, menus (fr/en/de), ~165 handlers IPC, autosave, cycle DB
│   │   ├── preload.ts            # API window.electronAPI (contextIsolation)
│   │   ├── splash-preload.ts     # Preload de l'écran de démarrage
│   │   ├── splash.html
│   │   ├── remoteScoreServer.ts  # Serveur Express + Socket.IO (tablettes, écrans)
│   │   ├── certManager.ts        # Certificat TLS auto-signé (selfsigned)
│   │   ├── autoUpdater.ts        # Mises à jour (GitHub Releases)
│   │   └── updateIntegrity.ts    # Vérification SHA-256 + URL de confiance
│   │
│   ├── renderer/                 # Interface React
│   │   ├── index.tsx, index.html, App.tsx
│   │   ├── components/           # ~90 composants (+ tests)
│   │   │   ├── analytics/        # AnalyticsCharts, TouchZoneHeatmap
│   │   │   ├── common/           # CollapseToggle, NumericKeypad
│   │   │   ├── competition/      # CompetitionHeader, CompetitionNav, ExportCenterModal,
│   │   │   │                     # KioskScoreEntry, PlanningAssistant
│   │   │   ├── formula/          # FormulaBuilder, FormulaPhaseCard, AdvancementRuleEditor,
│   │   │   │                     # RankingCriteriaEditor, ScoringZoneEditor, ...
│   │   │   ├── pool/             # PoolMatchList, PoolScoreMatrix, PoolMatchOrderModal, ...
│   │   │   ├── tableau/          # MatchCard, SeedingTable, TableauScoreModal,
│   │   │   │                     # TableauSignaturesModal, ConsolationBracketsSection, ...
│   │   │   ├── training/         # TrainingLauncherModal, TrainingPanel
│   │   │   └── wiki/             # Aide intégrée (WikiArticleRenderer, wikiData)
│   │   ├── hooks/                # 19 hooks (useAppState, usePoolManagement, useHistory, ...)
│   │   ├── contexts/             # TranslationContext
│   │   ├── services/             # offlineStorage, offlineSync
│   │   ├── locales/              # fr, en, br, ca, de, es, pt, it, ru, zh-HK
│   │   ├── styles/, assets/
│   │   └── sw.js                 # Service worker
│   │
│   ├── features/                 # Couche d'interface : stores Zustand + services (ADR-0004)
│   │   ├── analytics/            # analyticsService, useAnalyticsStore, FencerDetailModal (KPI : shared/domain/analytics)
│   │   ├── bracket/              # bracketGenerator, bracketService
│   │   ├── competition/          # competitionService, useCompetitionStore (immer)
│   │   ├── doubleelimination/    # useDEBracketStore
│   │   ├── latefencers/          # useLateFencerStore
│   │   ├── matchAuditLog/        # useMatchAuditStore
│   │   ├── pdfTemplates/         # usePdfTemplateStore
│   │   ├── penalties/            # penaltyUtils, usePenaltyStore (types : shared/domain/penalties)
│   │   ├── pools/                # poolCalculator, poolService, usePoolStore
│   │   └── teams/                # useTeamStore (règles : shared/domain/teams, #1979)
│   │
│   ├── shared/                   # Code commun main/renderer
│   │   ├── types/                # index.ts (domaine), remote.ts, preload.ts, pdfTemplate.types.ts
│   │   ├── services/             # cloudSync, errorService, ffeConnect, logger,
│   │   │                         # notification, performance, refereeManager, tournamentFlow
│   │   └── utils/
│   │       ├── fileParser/       # detect, ffeParser, xmlParser, engardeParser, txtParser,
│   │       │                     # rankingParser, common
│   │       ├── pdfExport/        # core, poolPdf, tableauPdf, bracketTreePdf, rankingPdf,
│   │       │                     # resultsPdf, fullCompetitionPdf, appelPdf, refereeCommentsPdf
│   │       ├── poolCalculations, tableCalculations, matchEndValidation, suddenDeath
│   │       ├── cardSystem, touchSystem, customTouchSystem, customRankingCalculator
│   │       ├── questScheduler, splitCompetition, tournamentTemplates
│   │       ├── fencerStatsCalculator, refereeStats, postTournamentReport
│   │       └── bulkImport, fencerExport, multiFormatExport, conflictResolution, ...
│   │
│   ├── database/
│   │   ├── index.ts              # DatabaseManager
│   │   ├── validation.ts         # Validation des entrées IPC
│   │   └── migrations/           # Runner + 18 migrations versionnées
│   │
│   ├── remote/                   # Pages web servies aux appareils du réseau
│   │   ├── referee.html          # Tablette d'arbitrage individuelle
│   │   ├── arena.html            # Écran d'arène
│   │   ├── teamReferee.html, teamArena.html   # Sabre Laser équipe
│   │   ├── pool.html, pool-ocr.html           # Feuille de poule, saisie par photo
│   │   ├── public.html, overlay.html, overlay-config.html, matchs.html
│   │   ├── kiosk.html, dashboard.html, lobby.html
│   │   ├── login.html, checkin.html, register.html, trainer.html
│   │   ├── app.js, common.js, i18n.js, styles.css, sw.js
│   │   └── unicorn-bg.png
│   │
│   └── examples/
├── e2e/                          # Playwright : app, competition(-full), pools, tableau,
│                                 # import-export, remote-scoring, accessibility
├── scripts/                      # version, check-i18n-completeness, check-bundle-size
├── resources/                    # Icônes, ressources packagées
├── docs/, wiki/                  # Documentation
├── webpack.main.config.js, webpack.renderer.config.js
├── vitest.config.ts, playwright.config.ts, eslint.config.js, tsconfig.json, typedoc.json
└── version.json                  # { version, build, date }
```

## 3. Processus principal

- **Fenêtre** 1400×900 (min 1024×768), splash au démarrage, CSP stricte.
- **Menus** natifs traduits (fr/en/de) ; reconstruits sur `app:language-changed`.
- **Base** : `<userData>/bellepoule.db` (migration automatique de l'ancien emplacement
  `./bellepoule.db`). Autosave toutes les **2 min** (événements `autosave:completed` /
  `autosave:failed`), sauvegarde à la fermeture.
- **Serveur distant** : une instance `RemoteScoreServer` par compétition
  (`remote:startServer`), port 8066 ou premier port libre, interface réseau choisie,
  HTTPS optionnel (activé par défaut dans l'UI).
- **Mode entraînement** : serveur dédié (`training:*`), règles personnalisées (durée,
  zones autorisées, mort subite désactivée).
- **Mises à jour** : `autoUpdater.ts` (vérification d'intégrité SHA-256, mode silencieux).

## 4. API IPC (`window.electronAPI`)

| Groupe | Exemples |
|---|---|
| `db.*` | Compétitions, tireurs, arbitres, phases, poules, matchs, équipes, cartons, touches, sorties d'arène, signatures, audit des scores, classement saisonnier, état de session |
| `file.*` | `export`, `import`, `writeContent`, `printHtmlToPDF`, `previewHtmlAsPDF`, archives tireurs/photos |
| `dialog.*` | `openFile`, `saveFile` |
| `remote.*` | `startServer`, `stopServer`, `changePort`, `getServerInfo`, `getArenas`, `getConnectedClients`, `broadcastCommand`, `identifyClient`, `updateTheme`, `updateLogo`, `updateCardAnnounce`, `updateStripCount`, `setCheckinPassword`, `setTrainerPassword`, `setTtsConfig`, `setWebhookUrl`, `acknowledgeDTCall`, `resetPoolMatch`, `refreshDeMatches`, ... |
| `training.*` | Serveur d'entraînement |
| `updater.*` | `check`, `installPendingUpdate`, `setSilentMode`, ... |
| `crypto.*` | `protect` / `unprotect` (safeStorage) |
| `themes.*` | `list`, `save`, `delete` |
| Événements | `onRemoteMatchFinished`, `onRemoteArenaUpdate`, `onDTCall`, `onRemoteFencerExcluded`, `onRemoteRefereeChanged`, `onPoolSignatureUpdated`, `onTableauSignatureUpdated`, `onAutosaveCompleted`, menus `onMenu*`, ... |
| Divers | `notifyLanguageChanged`, `getVersionInfo`, `openExternal`, `print`, `setWindowSize`, `getLogo`, `getTtsConfig` |

Toutes les entrées `db.*` passent par `src/database/validation.ts`.

## 5. Base de données

SQLite via better-sqlite3 (synchrone). Migrations versionnées (`schema_migrations`).

| Table | Contenu |
|---|---|
| `competitions` | Compétition + `settings` JSON (arme, scores max, chronos, options) |
| `fencers`, `referees` | Tireurs (statut, classement, photo, motif d'exclusion), arbitres |
| `phases`, `pools`, `pool_fencers` | Formule, poules, composition (arbitre(s) de poule) |
| `matches` | Matchs de poule et de tableau, scores, statut, arbitre, chronométrage |
| `bracket_nodes` | Arbre d'élimination directe |
| `match_cards`, `match_touches`, `match_arena_exits` | Cartons, touches par zone, sorties d'arène |
| `score_audit_log` | Traçabilité des scores (arbitre, IP, poule) |
| `pool_signatures`, `de_match_signatures` | Signatures numériques |
| `arena_state`, `session_state` | Persistance des arènes et de la session |
| `fencer_abandons` | Snapshot pour annuler un abandon |
| `formula_snapshots` | Formule à la carte (arme CUSTOM) |
| `season_results` | Classement saisonnier (Quest) |
| `teams`, `team_fencers`, `team_matches`, `team_bouts`, `team_match_cards` | Équipes |
| `referee_comments` | Commentaires des formateurs |

## 6. Serveur distant

Détails : [REMOTE_SCORE_GUIDE.md](REMOTE_SCORE_GUIDE.md) et [docs/ARBITRAGE.md](docs/ARBITRAGE.md).

- **Sécurité** : CORS et origine Socket.IO limités au réseau local ; mots de passe
  d'arène (≥ 8 caractères) → cookie HttpOnly `bp_token_arena{N}` (8 h) ; limitation des
  tentatives par IP/arène ; routes d'administration réservées au loopback ; CSP ;
  validation des scores (0–50) ; limitation de débit des soumissions.
- **Rooms Socket.IO** : `arena:{id}`, `pool:{id}`, `team-arena:{id}`, `dashboard`.
- **Flux d'un score** : tablette → `arena_control/update_score` (temps réel, écrans) +
  `POST /api/matches/:id/score` (persistance) → fin : `POST /api/matches/:id/finish` →
  DB + IPC `match:finished` → renderer met à jour poule/tableau.
- **Charge du process principal (#1154)** : le serveur distant, l'UI et les IPC `db:*` partagent la boucle d'événements du main. `src/main/eventLoopMonitor.ts` mesure son lag (`perf_hooks.monitorEventLoopDelay`, IPC `perf:getEventLoopDelay` / `electronAPI.getEventLoopDelay(reset?)` → moyenne, p50, p99, max en ms). Découpage prévu, à décider après mesure sur un export réel : (1) workers pour les tâches CPU (PDF, ZIP, `scryptSync` des mots de passe — `auth.ts`), (2) à défaut, serveur distant dans un `utilityProcess` derrière une façade `remoteServers` (lecture SQLite dédiée, écritures sérialisées via le main).

## 7. État côté interface

- Stores Zustand par fonctionnalité (`src/features/*/hooks/use*Store.ts`), certains avec
  `immer`.
- État applicatif dans `App.tsx` / `useAppState`.
- Calculs purs dans `src/shared/utils` (testés unitairement) ; cible : `src/shared/domain`
  ([ADR-0002](docs/adr/0002-couches-et-dependances.md), § 9).
- i18n : `TranslationContext` + `src/renderer/locales/*.json` (complétude vérifiée par
  `npm run check:i18n`).

## 8. Tests

- **Unitaires** : Vitest + jsdom, ~100 fichiers `*.test.ts(x)` co-localisés
  (`src/shared`, `src/main`, `src/database`, `src/renderer`, `src/features`).
- **E2E** : Playwright (`e2e/`).
- **CI** : type-check, i18n, tests, budget bundle avant chaque build.

## 9. Couches, dépendances et inventaire du renderer (#1979)

Décisions : [docs/adr/](docs/adr/README.md). Ce paragraphe en est le résumé opérationnel.

### 9.1 Couches

| Couche | Dossier | Contient | N'importe pas |
|---|---|---|---|
| Interface | `src/renderer`, `src/features` ([ADR-0004](docs/adr/0004-features-couche-interface.md)), `src/remote` | Vues, état d'écran, appels au client d'API (`BpmClient`) | `src/database`, `src/main` |
| Moteur | `src/main` (contrat : `src/main/engine/api` ; commandes : `src/main/engine/commands`, ex-`src/main/domain`, [ADR-0003](docs/adr/0003-main-domain-couche-application.md)) | Contrat d'API, commandes, serveurs, pilotes | `src/renderer`, `src/features` |
| Domaine pur | `src/shared/domain` ([ADR-0002](docs/adr/0002-couches-et-dependances.md)) | Règles : tirage, placement, classement, fin de match, cartons, qualification, formule | React, Electron, `src/database`, Node, date système, hasard non injecté |
| Persistance | `src/database` | Dépôts, migrations ([ADR-0011](docs/adr/0011-migrations-schema-3-0.md)) | `src/renderer`, `src/features`, `src/main` |

```text
renderer, features ──▶ shared (domain, api, types, utils)
main ─────────────────▶ shared, database
database ─────────────▶ shared/types
shared/domain ────────▶ shared/types
```

Une règle métier nouvelle naît dans `src/shared/domain`. Une écriture passe par une commande du
contrat ([ADR-0005](docs/adr/0005-journal-un-fait-un-chemin.md), [ADR-0008](docs/adr/0008-nommage-contrat.md)).

**Garde-fous** (lot 2) :
- ESLint `no-restricted-imports` (`eslint.config.js`), bloquant en CI (`npm run lint:errors`). Les exceptions sont nommées dans la configuration et disparaissent au lot 3.
- Cliquet `scripts/check-quality-ratchet.js` : les compteurs ci-dessous ne peuvent que baisser. Détail : `node scripts/check-quality-ratchet.js --list <compteur>`.
- Case « règles métier dans `src/shared/domain` » du modèle de PR (`.github/pull_request_template.md`).

**État de départ** (dev, 2026-11-20, hors tests, un fichier compte une fois) :

| Compteur | Valeur | Fichiers |
|---|---|---|
| `rendererImports` (main, shared, database → renderer) | ~~1~~ **0** (lot 3) | `main/domain/sport.ts` importait le tableau et le classement du renderer |
| `featuresImports` (main, shared, database → features) | ~~4~~ **0** (lot 3) | `teamArena.ts`, `teamRelayDevice.ts`, `teamPdf.ts`, `cardSystem.ts` importaient les règles d'équipes et de pénalités, parties dans `shared/domain/teams` et `shared/domain/penalties` |
| `electronApiCalls` (renderer hors `src/renderer/api`, et features → `window.electronAPI`) | 126 | 117 dans `src/renderer`, 9 dans `src/features` |

### 9.2 Classement du renderer

395 fichiers `.ts`/`.tsx` hors tests. 188 lus en détail : les `.ts` sans React, tous les hooks,
les composants de plus de 400 lignes. Les autres composants sont des **vues**.

| Classe | Définition | Fichiers lus | Destination |
|---|---|---|---|
| Vue | Rendu, mise en page, interactions | 69 (+ 207 petits composants) | reste |
| État d'écran | Sélection, filtres, onglet, modale, préférences, session d'écran | 61 | reste |
| Technique | i18n, client IPC, thèmes, hors-ligne, impression | 33 | reste |
| Orchestration | Enchaîne règles et écritures | 18 | commandes du moteur |
| Règle métier | Serait faux si recodé autrement ailleurs | 7 + 14 fichiers mixtes | `src/shared/domain` |

### 9.3 Inventaire à traiter, par valeur

Valeur = utilisé par le MCP, les tablettes ou une fonction à venir (#1948 formules v2, #1958
planning, #1959 arbitres, #1964 ordre des matchs, #1966 tableau préparé). Chemins relatifs à
`src/renderer`. Effort : XS < 50 lignes déplacées, S, M, L.

| Fichier | Classe | Contenu métier | Cible | Doublon existant | Valeur | Effort | Lot |
|---|---|---|---|---|---|---|---|
| ✅ `components/tableau/tableauCalculations.ts` → `shared/domain/tableau/` (mise en page restée dans `components/tableau/tableauLayout.ts` ; heure et hasard injectés) | Règle | Taille, têtes de série FIE, construction, consolantes, classement final | `shared/domain/tableau` | `shared/utils/tableCalculations.ts` (taille, têtes de série, nom de tour, classement) | MCP (`sport.ts` l'importe), tablettes, #1966 | M | 3 |
| ✅ `components/tableau/tableauTypes.ts` → `shared/domain/tableau/` | Règle | Vainqueur, propagation, premier tour, remise à zéro d'un match | `shared/domain/tableau` | `tableCalculations.updateTableAfterMatch` ; vainqueur recalculé dans `hooks/useRemoteScoreSync.ts` | MCP, tablettes, #1966 | S (42 importeurs) | 3 |
| ✅ `components/competition/competitionDerived.ts` → `shared/domain/ranking/tableauRanking.ts` (qualification des rapières → `shared/domain/rapieres/`) ; l'action de vue `rankingTableauNavAction` reste | Règle | Qualifiés du tableau (vainqueurs de poule, formule, rapières, séparation par genre) | `shared/domain/ranking` | — (`sport.ts` l'importe) | MCP, #1948 | XS | 3 |
| ✅ `components/formula/formulaDraft.ts` → `shared/domain/formula/formulaDraft.ts` (reste : recopie `useEffect` de la taille de poule, validation à l'écriture) | Règle | Tours de poules, Tour Quest, cohérence, conversion en réglages | `shared/domain/formula` | `shared/utils/formulaCoherence`, `defaultCompetitionSettings` | #1948, #2013 | S | 3 ([ADR-0012](docs/adr/0012-formule-domaine.md)) |
| `components/PoolPrepView.tsx` | Vue + règle | Tirage des poules (critères, niveau), ré-génération des matchs, statistiques de répartition | `shared/domain/pools` (étendre `buildPools`) | `shared/utils/poolOrchestration.buildPools` : critères figés, utilisé par le MCP et `usePoolManagement` | MCP, #1964 | M | 4 |
| `hooks/usePoolManagement.ts` | Orchestration | Annulation de match, tour suivant, poules terminées, forfait, annulation d'abandon, score distant | commandes `recordScore`, `setFencerStatus`, `closePoolRound` | `poolOrchestration` ; `main/remote/poolScore.ts` (scores reconstruits) | MCP, tablettes, #1964 | L | 4 |
| `hooks/poolView/usePoolViewActions.ts` | Orchestration | Saisie d'un score de poule : plafond, égalité au max, égalité Laser, priorité | commande `recordScore` | `poolOrchestration.validatePoolScore` (« identique à l'écran », appelé par le MCP seulement) | MCP, tablettes | S | 4 |
| `hooks/useRemoteScoreSync.ts` | Orchestration | Score venu d'une tablette : vainqueur, fin périmée, propagation | commande `recordScore` | `sport.ts` recordScore ; `main/remote/routes/matchRoutes.ts` | tablettes, MCP | M | #1980 (scores) |
| ✅ (génération : `planTableau`, lot 4e) `hooks/tableauView/useTableauViewScoring.ts` | Orchestration | Génération du tableau, éligibles, score et annulation d'un match | commandes `generateTableau`, `recordScore` | `sport.ts` (construction du tableau, statuts éliminés) | MCP, #1966 | M | 4 |
| `hooks/useCompetitionNavigation.ts` | Orchestration | Passage au tableau (reprise, remise à zéro), tour de poules suivant (qualifiés, minimum 4) | commandes `closePools`, `generateTableau`, `startNextPoolRound` | `sport.ts` (clôture des poules, partielle) ; `shared/utils/poolRounds` | MCP, #1948, #1966 | L | 4 |
| `hooks/useCompetitionPhases.ts` | État + règle | Ordre des phases par format, déverrouillages | `shared/domain/formula` | `sport.ts` (`PHASE`, `PHASE_LABEL`) ; `hooks/useCompetitionSession.ts` (`PHASE_NUMBERS`) | MCP, #1948 | M | 3 |
| `components/RefereeManager.tsx` | Vue + orchestration | Affectation automatique et manuelle, conflit de club | commandes `autoAssignReferees`, `assignReferee` | 3 moteurs : `shared/utils/refereeAutoAssign`, `shared/utils/refereeStats.autoAssignReferees`, `shared/services/refereeManager` ; conflit recodé (`refereeMatching.neutralityConflicts` existe) | #1959, #1958, MCP | M | [ADR-0014](docs/adr/0014-affectation-arbitres-moteur-unique.md) |
| `hooks/useCompetitionReferees.ts` | Orchestration | Arbitre de poule propagé aux matchs | commande `assignPoolReferees` | `sport.ts` assignPoolReferees ; `refereeStats.propagatePoolReferee` | #1959, MCP | S | ADR-0014 |
| `components/TeamManagerView.tsx` | Vue + orchestration | Poule d'équipes, ordre de relais, palier de relais, arène Laser | commandes `generateTeamPool`, `scoreTeamBout` ; règle → `shared/domain/teams` | `shared/domain/teams/teamRelayLive.relayCapFor` (tablettes), `teamCalculations.getRelayCap` | tablettes, MCP | L | 3 + 5 |
| `hooks/competitionView/usePoolCorrection.tsx` | Orchestration | Correction de score après tirage du tableau | commande `correctPoolScore` | `shared/utils/poolCorrectionImpact` | MCP, tablettes | M | 4 |
| `hooks/useMatchDbSync.ts` | Orchestration | Écriture du tableau | commande `generateTableau` | `sport.ts` (écriture quasi identique) | MCP | XS | 4 |
| `components/poolPersistence.ts` | Orchestration | Écriture des poules | commande `generatePools` | `sport.ts` generatePools | MCP | XS | 4 |
| `components/poolLaunchState.ts` | Règle | Poules lancées, scores perdus au retirage | `shared/domain/pools` | `sport.ts` (« déjà joué ») | MCP | XS | 3 |
| `components/pool/poolSpecialStatus.ts` | Règle | Score imposé par abandon, forfait, exclusion | `shared/domain/pools` | `shared/utils/forfeit.specialStatusPatch`, `poolOrchestration.applyFencerForfeit` | tablettes, MCP | XS | 3 |
| `components/ResultsView.tsx` | Vue + règle | Classement final (tableau puis éliminés de poule) | `shared/domain/ranking` | `KioskDisplay` ; `sport.ts` resultsData | MCP, tablettes | S | 3 |
| `components/KioskDisplay.tsx` | Vue + règle | Podium, classement des éliminés, nom de tour | `shared/domain/tableau` | `tableauCalculations.calculateFinalResults`, `getRoundName` | tablettes | S | 3 |
| `hooks/tableauView/useTableauViewState.tsx` | État + règle | Répartition des pistes du tableau | `shared/domain/planning` | `shared/utils/stripRange`, `poolStrips`, `main/remote/stripPlan.ts` | #1958, tablettes | S | [ADR-0015](docs/adr/0015-plan-des-pistes-moteur.md) |
| `hooks/useStripAvailability.ts` | État | Pistes indisponibles, stockées par poste (localStorage) | donnée du moteur (commande `setStripAvailability`) | `main/remote/stripPlan.ts` (copie poussée par l'écran) | #1958, #1878, tablettes | S | ADR-0015 |
| ✅ (pointage : commande `checkIn` seule, #1980) `hooks/useFencerManagement.ts` | Orchestration | Pointage (déjà `checkIn` pour le pointage groupé), import de classement | commande `checkIn` | `main/engine/commands/checkIn.ts` | MCP, tablettes | S | rattrapage #2020 |
| `hooks/useSplitGroups.ts` | Orchestration | Scission d'une épreuve (`currentPhase: 3` en dur) | commande `splitCompetition` | `shared/utils/splitCompetition` | #1948, MCP | S | 4 |
| `hooks/useCompetitionImport.ts` | Orchestration | Import d'arbitres (dédoublonnage), import de classement | commande `importReferees` | `shared/utils/personIdentity` | #1959, MCP | S | après ADR-0008 |
| `hooks/useCompetitionTabs.ts` | Orchestration | Création, suppression d'épreuve | commande `createCompetition` | `main/engine/commands/competitions.ts` (lecture) | MCP | S | après ADR-0008 |
| `hooks/useExport.ts` | Orchestration | Export des résultats, QR des pistes | commande `exportResults` | `main/engine/commands/exportResults.ts` | MCP | S | après ADR-0008 |
| `components/QuestPhaseView.tsx` | Vue + orchestration | Lancement du Tour Quest | commande `launchQuest` | `shared/utils/questScheduler` | #1948 | S | 4 |
| `services/blackCardReport.ts` | Orchestration + règle | Rapport des cartons noirs | requête du contrat ; règle → `shared/domain/cards` | `shared/utils/blackCardRanking.isBlackCarded` | MCP | S | rattrapage #2020 |
| `services/federalCreation.ts` | Orchestration | Création depuis les fichiers fédéraux | commande `createFromFederalFiles` | `main/federalFiles.ts`, `main/batchImport.ts` | MCP | S | après ADR-0008 |
| `hooks/useCompetitionSession.ts`, `hooks/competitionView/useCompetitionCore.ts` | État + règle | Numéros de phase, réglages effectifs (scores max, départage) | `shared/domain/formula` | `sport.ts` (`PHASE`, effectiveSettings « comme l'écran ») | MCP | XS | 3 |
| `components/remote/sessionMatches.ts` | Règle | Matchs jouables d'une session | `shared/domain/pools` | — | tablettes | XS | 3 |
| `components/NewCompetitionModal.tsx`, `CompetitionPropertiesModal.tsx`, `CompetitionView.tsx`, `SeasonRankingView.tsx` | Vue + règle | Genre imposé par l'arme, assemblage des réglages, changement de statut, ajout au classement saisonnier | `shared/domain/formula`, commande `setFencerStatus` | `formulaDraft.draftToSettings`, `usePoolManagement` | MCP, #1948 | XS à S | 3–4 |

**Lot 5 ✅** : `features/rapieres` et `features/analytics` ne gardent que l'interface (composants, hooks, stores). Règles des rapières (vagues, ordre classique, catégories d’âge à date injectée, filtres de classement) → `shared/domain/rapieres` ; KPI d’épreuve purs (`competitionKpis`) → `shared/domain/analytics` ; `analyticsService` (lit la base par `window.electronAPI`) et `scheduleBaseline` (`localStorage`) restent dans `features` — ESLint interdit désormais `window`, `document`, `localStorage` dans le domaine ; hooks des rapières sans import du `Toast` (notification `notify` injectée).

**Lot 4 ✅** (#2040–#2043 et lot 4e) : statuts de tireur et « poule terminée », validation du score de poule, vainqueur d'un match, tirage des poules (`drawPools`) et génération du tableau (`planTableau`) ont chacun une seule fonction du domaine, appelée par l'écran et le moteur (MCP). Restent hors de #1979 : les écritures (écran → commandes du contrat) et les scores des tablettes, qui relèvent de #1980 et #1981.

### 9.4 Règles recodées à plusieurs endroits

À unifier dans `shared/domain` en même temps que le déplacement du lot concerné.

| Règle | Endroits | Risque |
|---|---|---|
| ✅ Tireur inactif (abandon, forfait, exclusion) → `shared/domain/fencers/fencerStatus` (`isWithdrawn`, `isTableauEligible`) ; « poule terminée » → `shared/domain/pools/poolCompletion` (lot 4a) | `PoolView.tsx`, `pool/PoolMatchList.tsx`, `pool/PoolScoreMatrix.tsx`, `CompetitionView.tsx`, `usePoolManagement.ts`, `useTableauViewScoring.ts`, `main/engine/commands/sport.ts` | « Poules terminées » diverge : l'écran compte un match d'un tireur inactif comme joué, le MCP exige `FINISHED` |
| ✅ Exclusion par carton noir → `isBlackCardExcluded` (lot 4a ; reste le gabarit HTML de `resultsPdf.ts`) | `PoolRankingView.tsx`, `ResultsView.tsx`, `services/blackCardReport.ts`, `shared/utils/pdfExport/resultsPdf.ts` (canonique : `shared/utils/blackCardRanking.ts`) | Classement différent entre écran et PDF |
| ✅ Validation d'un score de poule → `validatePoolScore` pour l'écran (fenêtre et saisie simplifiée) et le MCP (lot 4b ; les tablettes passent par #1980) | `usePoolViewActions.ts` (écran), `poolOrchestration.validatePoolScore` (MCP) | Un score refusé à l'écran peut être accepté par le MCP |
| ✅ Vainqueur d'un match de tableau → `decideMatchWinner` (`shared/domain/match/matchEndValidation`) pour l'écran, le MCP, les tablettes et les appareils de piste (lot 4c) | `tableauTypes.ts` (écran, MCP), `main/remote/routes/matchRoutes.ts` (tablettes), `useRemoteScoreSync.ts`, `usePoolManagement.ts` | Vainqueur différent selon la source du score |
| Objets score d'un match de poule | `poolOrchestration.buildMatchScores`, `usePoolManagement.ts`, `main/remote/poolScore.ts` | — |
| ✅ Tirage des poules → `drawPools` (`shared/domain/pools/poolDraw`) pour l'écran et le MCP, critères ordonnés transmissibles au MCP (`separation`), tirage des positions injecté (lot 4d) | `PoolPrepView.tsx` (critères configurables, niveau), `poolOrchestration.buildPools` (MCP, critères figés) | Tirage différent selon le client |
| ✅ Affectation des arbitres | ~~`refereeStats.autoAssignReferees`, `shared/services/refereeManager.assignRefereesToMatches`, `sport.ts` chooseNeutralReferee~~ → un seul moteur `shared/domain/referees` (lot 3e) ; réglages enregistrés (`setRefereeingSettings`), commandes `assignReferees` / `assignReferee` | [ADR-0014](docs/adr/0014-affectation-arbitres-moteur-unique.md) ; le bouton « Affecter » de l'écran passera par la commande quand le moteur gérera plusieurs tours, les équipes et les rapières (lot 4) |
| Numéros et ordre des phases | `useCompetitionSession.ts`, `useCompetitionPhases.ts`, `sport.ts`, `useSplitGroups.ts` (en dur) | — |
| Palier de relais d'équipe | `TeamManagerView.tsx`, `teamRelayLive.relayCapFor`, `teamCalculations.getRelayCap` | Écran et tablettes divergents |

### 9.5 Code sans importeur

À supprimer dans une PR dédiée (hors refactor, aucun changement visible) :
`components/TouchOptimizedReferee.tsx`, `components/LiveDashboard.tsx`,
`hooks/usePoolOptimizations.ts`, `hooks/useElectronDB.ts`, `hooks/useEventManager.ts`,
`hooks/useKeyboardShortcuts.ts`, `hooks/useTheme.ts`, `services/offlineSync.ts`, et sept composants :
`CardModal`, `ChangePoolModal`, `ConflictResolutionModal`,
`MultiStripManager`, `OptimizedPoolGrid`, `VoiceScoreController`, `VirtualList`.
`features/bracket/services/bracketService.ts` n'est appelé nulle part hors de son module.
