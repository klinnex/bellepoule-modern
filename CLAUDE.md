# CLAUDE.md ─ Instructions permanentes du projet

## Règles générales (toujours actives)
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
npm run build           # Full build (increment-build + TypeScript + Webpack)
npm run build:ci        # CI build (no build number increment)
npm run build:main      # TypeScript compilation only
npm run build:renderer  # Webpack only
npm start               # Build and run with Electron
npm run package         # Create distributable packages for all platforms
npm run package:win     # Windows (NSIS installer)
npm run package:mac     # macOS (DMG, x64)
npm run package:mac-arm # macOS (DMG, arm64)
npm run package:linux   # Linux (AppImage)
npm test                # Run Vitest unit tests (watch mode)
npm run test:run        # Vitest single run (CI)
npm run test:coverage   # Vitest with coverage report
npx vitest run src/shared/utils/poolCalculations.test.ts  # Run a single test file
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
npm run format          # Prettier format
npm run format:check    # Prettier validation
npm run type-check      # TypeScript no-emit check
npm run analyze         # Webpack bundle analyzer (opens browser)
npm run test:e2e        # Playwright E2E tests
npm run e2e:debug       # Playwright debug mode
```

## Architecture

### Electron Process Model

```
Main Process (src/main/)
├── main.ts              # Window management, menu (i18n: fr/en/de), IPC handlers, DB lifecycle
├── preload.ts           # Secure IPC bridge (contextIsolation: true)
├── remoteScoreServer.ts # Express + Socket.IO for referee tablets (port 8066)
└── autoUpdater.ts       # Auto-update functionality

Renderer Process (src/renderer/)
├── App.tsx              # Root React component (~520 lines)
├── components/          # 47+ React components
├── hooks/               # 14+ custom hooks
├── contexts/            # TranslationContext (i18n)
├── services/            # offlineStorage.ts, offlineSync.ts
├── locales/             # i18n: fr, en, br (Breton), ca (Catalan), de (Deutsch), es (Español), zh-HK
├── styles/              # CSS files
└── sw.js                # Service worker (offline support)

Feature Modules (src/features/)
├── analytics/           # AnalyticsService + useAnalyticsStore (Zustand)
├── bracket/             # BracketGenerator + useBracketStore
├── competition/         # CompetitionService + useCompetitionStore
├── doubleelimination/   # useDEBracketStore
├── latefencers/         # useLateFencerStore
├── penalties/           # PenaltyUtils + usePenaltyStore
├── pools/               # PoolCalculator + PoolService + usePoolStore
└── teams/               # TeamCalculations + useTeamStore

Shared (src/shared/)
├── types/
│   ├── index.ts         # All TypeScript definitions (enums, interfaces)
│   ├── preload.ts       # IPC API types
│   └── remote.ts        # Remote server types
├── services/
│   ├── cloudSyncService.ts    # Dropbox/Google Drive/OneDrive (AES-GCM encrypted)
│   ├── logger.ts              # Logging service
│   ├── notificationService.ts # Browser + Discord/Slack webhooks
│   ├── performanceService.ts  # Monitoring, caching, virtual lists
│   ├── refereeManager.ts      # Auto referee assignment + conflict detection
│   └── tournamentFlow.ts      # Tournament state machine
└── utils/
    ├── poolCalculations.ts    # Pool ranking + "Quest Points" (Laser Sabre)
    ├── pdfExport.ts / pdfTemplates.ts  # jsPDF generation
    ├── tableCalculations.ts   # Direct elimination bracket logic
    ├── cardSystem.ts          # Yellow/red/black card rules
    ├── scoreValidation.ts     # Score validation rules
    ├── suddenDeath.ts         # Overtime / sudden death logic
    ├── touchSystem.ts         # Sabre Laser touch zones (A=1pt, B=3pt, C=5pt)
    ├── fencerStatsCalculator.ts
    ├── bulkImport.ts          # Bulk fencer import
    ├── fileParser.ts          # XML / FFE / CSV parsing
    ├── conflictResolution.ts  # Merge conflict resolution for cloud sync
    ├── errorLogger.ts         # Structured error logging
    ├── fencerExport.ts        # Fencer data export helpers
    ├── multiFormatExport.ts   # Multi-format export (CSV, JSON, XML)
    └── tournamentTemplates.ts # Predefined tournament configuration templates

Remote Assets (src/remote/)
├── app.js               # Express + Socket.IO application
├── arena.html / referee.html / dashboard.html / kiosk.html
├── login.html / pool.html / public.html
├── styles.css
├── sw.js                # Service worker for offline tablet support
└── offlineQueue.ts      # Offline action queue for tablets

Database (src/database/)
├── index.ts             # DatabaseManager class (sql.js - pure JS SQLite)
└── validation.ts        # Input validation
```

### Key Patterns

1. **IPC via Preload**: All renderer-to-main communication uses `window.electronAPI` exposed by `preload.ts`. Never use `remote` or direct IPC in the renderer.

2. **Database**: sql.js provides SQLite without native dependencies. All operations go through `DatabaseManager`. Atomic writes (temp file + rename). Autosave every 2 minutes; save on quit.

3. **Remote Scoring**: Express server with Socket.IO on port 8066. Arena display at `/arene{N}`, referee interface at `/arene{N}/arbitre`. HTML served in-memory for bundling.

4. **State**: Zustand stores per feature module (`src/features/*/hooks/use*Store.ts`). App-level state in `App.tsx` via `useState`/`useReducer`.

5. **IPC API Groups** (`window.electronAPI`):
   - `db.*` – Competition, Fencer, Match, Pool, Session operations
   - `file.*` – Export, import, write file content
   - `dialog.*` – Open/save file dialogs
   - `remote.*` – Start/stop server, manage arenas/sessions
   - `updater.*` – Auto-update control
   - `notifyLanguageChanged(lang)` – Rebuild native menu when UI language changes

## TypeScript Configuration

- Strict mode enabled (no implicit any, strict null checks)
- Path aliases: `@shared/*`, `@main/*`, `@renderer/*`, `@database/*`
- Target: ES2020, Module: commonjs, JSX: react-jsx
- Output: `./dist/`

## Testing

- **Unit tests**: Vitest (`npm test`) – test files in `src/shared/utils/*.test.ts`
- **E2E tests**: Playwright (`playwright.config.ts`) – test files in `e2e/`
- Coverage: `@vitest/coverage-v8`

## Key Domain Types (src/shared/types/index.ts)

```typescript
enum Weapon { EPEE = 'E', FOIL = 'F', SABRE = 'S', LASER = 'L' }

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
- `@types/*` packages are in `dependencies` (not `devDependencies`) for Electron bundling
- Window: 1400×900, min 1024×768; CSP enforced (no inline scripts)
- Electron version: 40.x; React 19; Socket.IO 4.x; sql.js 1.13

## Git Conventions

- Build commits: `🔖 Build #XXX`
- Feature commits in French or English
- CI/CD auto-increments build number in `version.json` on push to `main`
- Branch prefix for AI: `claude/`
