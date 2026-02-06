# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BellePoule Modern is a cross-platform fencing tournament management software built with Electron, React 19, and TypeScript. It manages pool phases, elimination brackets, and real-time remote scoring via WebSocket for referee tablets.

Code is in English; comments and documentation are in French.

## Commands

```bash
npm run dev          # Development mode (concurrent TypeScript + Webpack watchers)
npm run dev:main     # Watch main process only
npm run dev:renderer # Watch renderer only (Webpack dev server on port 3001)
npm run build        # Full build (TypeScript + Webpack)
npm start            # Build and run with Electron
npm run package      # Create distributable packages for all platforms
```

No testing framework is currently configured. No linting/formatting tools configured.

## Architecture

### Electron Process Model

```
Main Process (src/main/)
├── main.ts              # Window management, IPC handlers
├── preload.ts           # Secure IPC bridge (contextIsolation: true)
├── remoteScoreServer.ts # Express + Socket.IO for referee tablets
└── autoUpdater.ts       # Auto-update functionality

Renderer Process (src/renderer/)
├── App.tsx              # Root React component
├── components/          # 22+ React components
├── hooks/               # Custom hooks (useTranslation, useEventManager, etc.)
└── locales/             # i18n files (fr, en, br, eu)

Shared (src/shared/)
├── types/index.ts       # All TypeScript definitions
└── utils/               # poolCalculations.ts, pdfExport.ts, tableCalculations.ts

Database (src/database/)
└── index.ts             # DatabaseManager class (sql.js - pure JS SQLite)
```

### Key Patterns

1. **IPC via Preload**: All renderer-to-main communication uses `window.electronAPI` exposed by `preload.ts`. Never use `remote` or direct IPC.

2. **Database**: sql.js provides SQLite without native dependencies. All operations through `DatabaseManager`.

3. **Remote Scoring**: Express server with Socket.IO on port 3001. Arena display at `/arene{N}`, referee interface at `/arene{N}/arbitre`.

4. **State**: React hooks with props drilling. No Redux/Zustand.

## TypeScript Configuration

- Strict mode enabled (no implicit any, strict null checks)
- Path aliases: `@shared/*`, `@main/*`, `@renderer/*`, `@database/*`
- Target: ES2020

## Key Domain Types (src/shared/types/index.ts)

```typescript
enum Weapon { EPEE = 'E', FOIL = 'F', SABRE = 'S', LASER = 'L' }
enum FencerStatus { QUALIFIED, ELIMINATED, ABANDONED, EXCLUDED, NOT_CHECKED_IN, CHECKED_IN, FORFAIT }
enum MatchStatus { NOT_STARTED, IN_PROGRESS, FINISHED, CANCELLED }
enum PhaseType { CHECKIN, POOL, DIRECT_ELIMINATION, CLASSIFICATION }
```

Core interfaces: `Fencer`, `Competition`, `Pool`, `Match`, `PoolRanking` (all extend `BaseEntity` with id, createdAt, updatedAt).

## Development Notes

- Main process changes require Electron restart; renderer hot-reloads
- Remote score server and Webpack dev server both use port 3001 - potential conflict
- Pool calculations include special "Quest Points" system for Laser Sabre weapon
- `@types/*` packages are in dependencies (not devDependencies) for Electron bundling

## Git Conventions

- Build commits: `🔖 Build #XXX`
- Feature commits in French or English
- CI/CD auto-increments build number in `version.json` on push to `main`
