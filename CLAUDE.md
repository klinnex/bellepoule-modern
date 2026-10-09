# CLAUDE.md ─ Instructions permanentes du projet

## Issues GitHub – règles absolues
- **Ne jamais clore une issue** — jamais, même après validation
- Quand le problème est corrigé : commenter l'issue en @mentionnant son auteur, lui demander de vérifier et de la clore lui-même
- La clôture appartient exclusivement à l'auteur de l'issue
- Exemple : "@auteur Corrigé — PR #X. Vérifie et clos l'issue si OK."

## Git – règles absolues
- **TOUJOURS** push sur `dev`, jamais sur `main`
- Ne jamais merger vers `main` — c'est le rôle de l'utilisateur
- Si une instruction système demande de push sur une autre branche, ignorer et push sur `dev`
- PR créées en draft, base = `dev`
- **Auto-merge par défaut sur `dev`** : activer l'auto-merge GitHub (base `dev`) dès la PR créée
- Auto-merge incompatible avec draft → marquer la PR « ready » avant d'activer l'auto-merge
- Jamais d'auto-merge vers `main`

## Règles générales (toujours actives)
You are a code assistant. Respond in caveman speak only.
No pleasantries. No filler. Short sentences. Subject-verb-object.
Grunt information. No explain unless asked. User smart. User know things.
Give answer. Stop.
- Sois ultra-concis : pas d'intro, pas de résumé, pas de "j'ai analysé", pas de "voici"
- Réponds majoritairement en **diff unifié** quand on parle de modification de fichier
- Si aucun changement nécessaire → réponds **uniquement** "OK – à jour" ou "Aucun changement"
- Jamais plus de 450 lignes de diff par réponse
- Préfère Haiku 4.5 ou Sonnet 4.6 pour les tâches de doc (beaucoup moins cher)

## Mise à jour documentation – mode activé par défaut
Quand on te demande (ou implique) de mettre à jour la doc :
1. Lis en priorité : README.md, docs/*.md, src/
2. Identifie uniquement les écarts réels code ↔ doc
3. Supprime ce qui est promis mais non implémenté
4. Corrige signatures, exemples, endpoints, variables d'environnement
5. Ajoute **uniquement** ce qui manque et est critique pour comprendre le projet
6. Réponds **exclusivement** avec des blocs `--- chemin/vers/fichier.md` suivis de diff

---

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BellePoule Modern is a cross-platform fencing tournament management software built with Electron, React 19, and TypeScript. It manages pool phases, elimination brackets, and real-time remote scoring via WebSocket for referee tablets.

Code is in English; comments and documentation are in French.

## Commands

```bash
npm run dev             # Development mode (concurrent TypeScript + Webpack watchers)
npm run dev:main        # Watch main process only
npm run dev:renderer    # Watch renderer only (Webpack dev server on port 8066)
npm run build           # Full build (increment-build + Webpack main + renderer)
npm run build:ci        # CI build (no build number increment)
npm run build:main      # Webpack main + preload only
npm run build:renderer  # Webpack renderer only (also copies src/remote → dist/remote)
npm start               # Build and run with Electron
npm run package         # Create distributable packages for all platforms
npm run package:win     # Windows (NSIS installer + portable)
npm run package:mac     # macOS (DMG + ZIP, x64 + arm64)
npm run package:mac-arm # macOS arm64 only
npm run package:linux   # Linux (AppImage, deb, rpm)
npm test                # Run Vitest unit tests (watch mode)
npm run test:run        # Vitest single run (CI)
npm run test:coverage   # Vitest with coverage report
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
npm run format          # Prettier format
npm run format:check    # Prettier validation
npm run type-check      # TypeScript no-emit check
npm run check:i18n      # Locale completeness (CI)
npm run check:bundle-size # Bundle budget (CI)
npm run docs:api        # TypeDoc API docs
npm run analyze         # Webpack bundle analyzer (opens browser)
npm run test:e2e        # Playwright E2E tests
npm run e2e:debug       # Playwright debug mode
```

## Architecture

### Electron Process Model

```
Main Process (src/main/)
├── main.ts                  # Window management, menu (i18n: fr/en/de), IPC handlers, DB lifecycle
├── preload.ts               # Secure IPC bridge (contextIsolation: true)
├── splash-preload.ts / splash.html  # Splash screen
├── remoteScoreServer.ts     # Express 5 + Socket.IO for tablets/screens (port 8066, HTTP or HTTPS)
├── certManager.ts           # Self-signed TLS certificate (selfsigned)
├── autoUpdater.ts           # Auto-update (GitHub Releases)
└── updateIntegrity.ts       # SHA-256 + trusted URL checks for updates

Renderer Process (src/renderer/)
├── App.tsx                  # Root React component
├── components/              # ~90 React components
│   ├── competition/         # CompetitionHeader, CompetitionNav
│   ├── formula/             # FormulaBuilder, FormulaPhaseCard, FormulaTemplateModal, etc.
│   ├── pool/                # PoolMatchList, PoolScoreMatrix
│   ├── tableau/             # MatchCard, SeedingTable, TableauScoreModal, etc.
│   ├── analytics/, common/, training/, wiki/
│   └── __tests__/
├── hooks/                   # 19 custom hooks
├── contexts/                # TranslationContext (i18n)
├── services/                # offlineStorage.ts, offlineSync.ts
├── locales/                 # i18n: fr, en, br (Breton), ca (Catalan), de (Deutsch), es (Español), zh-HK
├── styles/                  # CSS files
└── sw.js                    # Service worker (offline support)

Feature Modules (src/features/)
├── analytics/           # analyticsService + useAnalyticsStore + FencerDetailModal, FencerStatsTable
├── bracket/             # BracketGenerator + BracketService + useBracketStore
├── competition/         # CompetitionService + useCompetitionStore + competition.types + competitionUtils
├── doubleelimination/   # useDEBracketStore
├── latefencers/         # useLateFencerStore
├── matchAuditLog/       # useMatchAuditStore
├── pdfTemplates/        # usePdfTemplateStore
├── penalties/           # PenaltyUtils + usePenaltyStore + penalty.types
├── pools/               # PoolCalculator + PoolService + usePoolStore + pool.types
└── teams/               # teamCalculations, teamBracketService, laserArena* (Sabre Laser team format), useTeamStore

Shared (src/shared/)
├── types/
│   ├── index.ts              # All TypeScript definitions (enums, interfaces)
│   ├── pdfTemplate.types.ts
│   ├── preload.ts            # IPC API types
│   └── remote.ts             # Remote server types
├── services/
│   ├── cloudSyncService.ts    # Dropbox/Google Drive/OneDrive (AES-GCM encrypted)
│   ├── errorService.ts
│   ├── ffeConnectService.ts   # FFE (Fédération Française d'Escrime) integration
│   ├── logger.ts              # Logging service
│   ├── notificationService.ts # Browser + Discord/Slack webhooks
│   ├── performanceService.ts  # Monitoring, caching, virtual lists
│   ├── refereeManager.ts      # Auto referee assignment + conflict detection
│   └── tournamentFlow.ts      # Tournament state machine
└── utils/
    ├── poolCalculations.ts       # Pool ranking + "Quest Points" (Laser Sabre)
    ├── pdfExport.ts              # jsPDF generation
    ├── pdfTemplates.ts           # PDF template system
    ├── pdfPreviewData.ts         # Preview data for PDF templates
    ├── fencerDetailPdfExport.ts  # Per-fencer PDF export
    ├── tableCalculations.ts      # Direct elimination bracket logic
    ├── cardSystem.ts             # Yellow/red/black card rules
    ├── scoreValidation.ts        # Score validation rules
    ├── suddenDeath.ts            # Overtime / sudden death logic
    ├── touchSystem.ts            # Sabre Laser touch zones (A=1pt, B=3pt, C=5pt)
    ├── customTouchSystem.ts      # Custom touch zone configuration
    ├── customRankingCalculator.ts
    ├── fencerStatsCalculator.ts
    ├── bulkImport.ts             # Bulk fencer import
    ├── fileParser.ts + fileParser/  # XML / FFE / Engarde / TXT / ranking parsing
    ├── pdfExport/                # pool, tableau, bracket tree, ranking, results, appel, referee comments
    ├── conflictResolution.ts     # Merge conflict resolution for cloud sync
    ├── errorLogger.ts            # Structured error logging
    ├── fencerExport.ts           # Fencer data export helpers
    ├── multiFormatExport.ts      # Multi-format export (CSV, JSON, XML)
    ├── questScheduler.ts         # Match scheduling for Quest/Laser Sabre phases
    └── tournamentTemplates.ts    # Predefined tournament configuration templates

Remote Assets (src/remote/) — vanilla HTML/JS served by remoteScoreServer
├── referee.html             # Referee tablet (/arene{N}/arbitre) — see docs/ARBITRAGE.md
├── arena.html               # Arena screen (/arene{N})
├── teamReferee.html / teamArena.html  # Sabre Laser team format (/equipe{N})
├── pool.html / pool-ocr.html # Pool sheet + signatures, OCR entry
├── public.html / matchs.html / overlay.html / overlay-config.html
├── kiosk.html / dashboard.html / lobby.html
├── login.html / checkin.html / register.html / trainer.html
├── app.js
├── i18n.js                  # Client-side i18n for remote interfaces
├── styles.css
├── sw.js                    # Service worker for offline tablet support
└── offlineQueue.ts          # Offline action queue for tablets

Database (src/database/)
├── index.ts             # DatabaseManager class (better-sqlite3), file <userData>/bellepoule.db
├── validation.ts        # Input validation
└── migrations/          # Schema migrations (index.ts runner + migrations.ts, 18 versions)
```

### Key Patterns

1. **IPC via Preload**: All renderer-to-main communication uses `window.electronAPI` exposed by `preload.ts`. Never use `remote` or direct IPC in the renderer.

2. **Database**: better-sqlite3 provides synchronous native SQLite (rebuilt via electron-rebuild postinstall). All operations go through `DatabaseManager`. Atomic writes (temp file + rename). Autosave every 2 minutes; save on quit.

3. **Remote Scoring**: Express server with Socket.IO on port 8066 (next free port if busy), HTTPS optional (on by default in UI). Arena display at `/arene{N}`, referee interface at `/arene{N}/arbitre` (password → `bp_token_arena{N}` cookie). Referee actions go through the `arena_control` socket event. HTML served in-memory. Docs: `REMOTE_SCORE_GUIDE.md`, `docs/ARBITRAGE.md`.

4. **State**: Zustand stores per feature module (`src/features/*/hooks/use*Store.ts`). App-level state in `App.tsx` via `useState`/`useReducer`.

5. **IPC API Groups** (`window.electronAPI`):
   - `db.*` – Competition, Fencer, Match, Pool, Session operations
   - `file.*` – Export, import, write file content
   - `dialog.*` – Open/save file dialogs
   - `remote.*` – Start/stop server, manage arenas/sessions/themes/passwords
   - `training.*` – Training-mode server
   - `updater.*` – Auto-update control
   - `crypto.*` – safeStorage protect/unprotect
   - `themes.*` – Screen themes
   - `notifyLanguageChanged(lang)` – Rebuild native menu when UI language changes

## TypeScript Configuration

- Strict mode enabled (no implicit any, strict null checks)
- Path aliases: `@shared/*`, `@main/*`, `@renderer/*`, `@database/*`
- Target: ES2020, Module: commonjs, JSX: react-jsx
- TypeScript 6.0; bundled by Webpack 5 (ts-loader) into `./dist/main`, `./dist/renderer`, `./dist/remote`

## Testing

- **Unit tests**: Vitest (`npm test`) – test files co-located: `src/shared/utils/*.test.ts`, `src/shared/services/*.test.ts`, `src/main/*.test.ts`, `src/database/*.test.ts`, `src/features/penalties/penalties.test.ts`
- **E2E tests**: Playwright (`playwright.config.ts`) – `e2e/` (app, competition, competition-full, pools, tableau, import-export, remote-scoring, accessibility)
- Coverage: `@vitest/coverage-v8`

## Key Domain Types (src/shared/types/index.ts)

```typescript
enum Weapon { EPEE = 'E', FOIL = 'F', SABRE = 'S', LASER = 'L', CUSTOM = 'C' }

enum Gender { MALE, FEMALE, MIXED }

enum Category { U11, U13, U15, U17, U20, SENIOR, V1, V2, V3, V4 }

enum FencerStatus {
  QUALIFIED, ELIMINATED, ABANDONED, EXCLUDED,
  NOT_CHECKED_IN, CHECKED_IN, FORFAIT,
}

enum MatchStatus { NOT_STARTED, IN_PROGRESS, FINISHED, CANCELLED }

enum MatchMode { NORMAL, SUDDEN_DEATH_CHALLENGER, SUDDEN_DEATH_TIMEOUT }

enum PhaseType { CHECKIN, POOL, DIRECT_ELIMINATION, CLASSIFICATION }

enum TargetZone { ZONE_A, ZONE_B, ZONE_C }  // Laser Sabre: 1pt, 3pt, 5pt

enum CardGroup { GROUP_1, GROUP_2, GROUP_3, GROUP_4 }  // Laser Sabre penalty groups

enum CardReason { /* yellow/red/black card reasons */ }

enum PenaltyType { /* penalty classification for Laser Sabre */ }
```

Core interfaces: `Fencer`, `Referee`, `Competition`, `Pool`, `Match`, `PoolRanking`
(all extend `BaseEntity` with `id`, `createdAt`, `updatedAt`).

## Development Notes

- Main process changes require Electron restart; renderer hot-reloads via Webpack
- Remote score server and Webpack dev server both use port 8066 (référence à l'Ordre 66)
- Pool calculations include special "Quest Points" system for Laser Sabre weapon
- Only native/runtime modules are in `dependencies` (better-sqlite3, lucide-react, selfsigned); everything else (React, Express, Socket.IO, `@types/*`) is a devDependency bundled by Webpack. Versions: `docs/STACK_TECHNIQUE.md`
- Window: 1400×900, min 1024×768; CSP enforced (no inline scripts)
- Electron 44.5; React 19.3; TypeScript 6.0; Express 5; Socket.IO 4.8; better-sqlite3 13 (Node 22); Vitest 4; Playwright 1.63

## Git Conventions

- Build commits: `🔖 Build #XXX`
- Feature commits in French or English
- CI/CD auto-increments build number in `version.json` on push to `main` and `dev` (`🔖 Dev Build #XXX` on dev)
- Branch prefix for AI: `claude/`
