# BellePoule Modern — Architecture

> Version **1.0.3**, build **#1365** (octobre 2026).
> Dépendances et versions : [docs/STACK_TECHNIQUE.md](docs/STACK_TECHNIQUE.md).
> Interface d'arbitrage : [docs/ARBITRAGE.md](docs/ARBITRAGE.md).

## 1. Vue d'ensemble

Application **Electron** (poste organisateur) + **serveur web embarqué** (tablettes,
écrans, spectateurs sur le réseau local).

```
┌──────────────────────────── Poste organisateur (Electron 44) ────────────────────────────┐
│                                                                                          │
│  Renderer (React 19 + Zustand)          Preload (contextBridge)        Main (Node 22)    │
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
│   │   ├── locales/              # fr, en, br, ca, de, es, zh-HK
│   │   ├── styles/, assets/
│   │   └── sw.js                 # Service worker
│   │
│   ├── features/                 # Modules métier (store Zustand + services)
│   │   ├── analytics/            # analyticsService, useAnalyticsStore, FencerDetailModal
│   │   ├── bracket/              # bracketGenerator, bracketService
│   │   ├── competition/          # competitionService, useCompetitionStore (immer)
│   │   ├── doubleelimination/    # useDEBracketStore
│   │   ├── latefencers/          # useLateFencerStore
│   │   ├── matchAuditLog/        # useMatchAuditStore
│   │   ├── pdfTemplates/         # usePdfTemplateStore
│   │   ├── penalties/            # penaltyUtils, usePenaltyStore
│   │   ├── pools/                # poolCalculator, poolService, usePoolStore
│   │   └── teams/                # teamCalculations, teamBracketService, laserArena*,
│   │                             # teamCardEscalation, useTeamStore
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
│   │       ├── poolCalculations, tableCalculations, scoreValidation, suddenDeath
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
│   │   ├── app.js, i18n.js, styles.css, sw.js, offlineQueue.ts
│   │   └── unicorn-bg.png
│   │
│   └── examples/
├── e2e/                          # Playwright : app, competition(-full), pools, tableau,
│                                 # import-export, remote-scoring, accessibility
├── scripts/                      # increment-build, check-i18n-completeness, check-bundle-size
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

## 7. État côté interface

- Stores Zustand par fonctionnalité (`src/features/*/hooks/use*Store.ts`), certains avec
  `immer`.
- État applicatif dans `App.tsx` / `useAppState`.
- Calculs purs dans `src/shared/utils` (testés unitairement).
- i18n : `TranslationContext` + `src/renderer/locales/*.json` (complétude vérifiée par
  `npm run check:i18n`).

## 8. Tests

- **Unitaires** : Vitest + jsdom, ~100 fichiers `*.test.ts(x)` co-localisés
  (`src/shared`, `src/main`, `src/database`, `src/renderer`, `src/features`).
- **E2E** : Playwright (`e2e/`).
- **CI** : type-check, i18n, tests, budget bundle avant chaque build.
