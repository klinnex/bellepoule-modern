# BellePoule Modern - Agent Instructions

## Project Overview

BellePoule Modern is an Electron desktop application for fencing tournament management. It uses React 19 + TypeScript 6 for the frontend, SQLite via better-sqlite3 for data storage, and Webpack 5 for bundling.

**Version:** v1.0.3 Build #1365  
**Last Updated:** October 2026  
**Dependency versions:** see `docs/STACK_TECHNIQUE.md`

---

## Build & Development Commands

```bash
# Start the application (build + run)
npm start

# Development mode with hot reload
npm run dev

# Build all code
npm run build

# Build main process only (Webpack)
npm run build:main

# Build renderer process only
npm run build:renderer

# Unit Testing (Vitest)
npm test                          # Run tests in watch mode
npm run test:run                  # Run tests once
npm run test:coverage             # Run tests with coverage
npx vitest run path/to/file.test.ts  # Run single test file

# E2E Testing (Playwright)
npm run test:e2e                  # Run E2E tests headless
npm run e2e:debug                 # Playwright debug mode
npx playwright test --ui          # Playwright UI mode

# Linting & Formatting
npm run lint                      # Check for linting errors
npm run lint:fix                  # Fix linting errors
npm run format                    # Format all files with Prettier
npm run format:check              # Check formatting without fixing
```

**Important:** Always run `npm run lint` and `npm run format` before committing.

---

## Code Style Guidelines

### TypeScript & React

- **Functional components only** (no class components)
- **TypeScript strict mode** - always type props and returns
- **Interfaces** for component props, **types** for data models
- **React.FC** typing for components:
  ```typescript
  const Component: React.FC<Props> = ({ prop1, prop2 }) => {};
  ```
- **No `any` type** - use proper types (ESLint warns on explicit any)

### Naming Conventions

| Type                | Convention                     | Example                      |
| ------------------- | ------------------------------ | ---------------------------- |
| Components          | PascalCase                     | `CompetitionList.tsx`        |
| Utilities/Hooks     | camelCase                      | `usePoolCalculations.ts`     |
| Types/Interfaces    | PascalCase                     | `Fencer`, `Competition`      |
| Enums               | PascalCase + UPPER_CASE values | `Weapon.EPEE`                |
| Variables/Functions | camelCase                      | `calculateScore()`           |
| Constants           | UPPER_SNAKE_CASE               | `MAX_POOL_SIZE`              |
| CSS Classes         | kebab-case                     | `.pool-grid`, `.fencer-card` |

### Import Order

```typescript
// 1. React imports first
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';

// 3. Shared types and utilities (relative paths)
import { Competition, Fencer } from '../../shared/types';
import { logger, LogCategory } from '../../shared/services/logger';
import { calculatePoolResults } from '../../shared/utils/poolCalculations';

// 4. Local components
import CompetitionList from './components/CompetitionList';
import { useToast } from './Toast';
```

**Important:** Use relative imports (`../../shared/`) not path aliases (`@shared/`).

### Formatting (Prettier)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid"
}
```

### Error Handling

```typescript
// Always use try-catch with proper error typing
try {
  await operation();
} catch (error) {
  // Use logger instead of console.log
  logger.error(LogCategory.DB, 'Operation failed', error instanceof Error ? error : undefined);

  // Show user-friendly message
  showToast('Une erreur est survenue', 'error');
}
```

**Never use console.log in production** - use the logger service instead.

---

## Architecture Patterns

### Project Structure

```
src/
├── main/                    # Electron main process
│   ├── main.ts
│   ├── preload.ts
│   ├── autoUpdater.ts
│   └── remoteScoreServer.ts
├── renderer/                # React frontend
│   ├── components/          # React components
│   ├── hooks/               # Custom React hooks
│   ├── services/            # Renderer services
│   └── styles/              # CSS files
├── features/                # Feature-based modules
│   ├── competition/         # Competition CRUD + store
│   ├── pools/               # Pool management + store
│   ├── bracket/             # Elimination bracket + store
│   ├── analytics/           # Statistics + store
│   ├── teams/               # Team competitions
│   ├── penalties/           # Penalty system
│   └── latefencers/         # Late fencer management
├── shared/                  # Code shared between processes
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Business logic utilities
│   ├── services/            # Shared services
│   └── constants.ts         # Application constants
├── database/                # SQLite operations
└── e2e/                     # E2E tests (Playwright)
```

### State Management (Zustand)

```typescript
// Import from feature stores
import { useCompetitionStore } from '../../features/competition/hooks/useCompetitionStore';

// Use in components
const { competitions, loadCompetitions } = useCompetitionStore();
```

**Store Pattern:**

- One store per feature in `features/{feature}/hooks/use{Feature}Store.ts`
- Use Immer for immutable mutations
- Persist middleware for local storage
- DevTools middleware for debugging

### Electron IPC

- Database operations stay in main process
- Use preload script for secure IPC bridge
- Type-safe interfaces for all IPC communication
- Always use async/await for IPC calls

---

## Localization

- **Primary language**: French (all UI text, errors, messages)
- **Supported languages**: French (fr), English (en), Breton (br), Spanish (es), German (de)
- Translation files: `src/renderer/locales/{lang}.json`
- Date formatting: French locale (`'fr-FR'`)
- Comments: French or English acceptable

---

## Security Guidelines

- **Never expose Node.js APIs** directly to renderer
- **Always use preload script** for IPC bridge
- **Validate all data** coming from renderer process
- **Use contextIsolation** in Electron configuration
- **Content Security Policy** headers implemented in main.ts

---

## Common Pitfalls to Avoid

1. Don't use `console.log` - use `logger.info()` from `shared/services/logger`
2. Don't bypass the preload script for IPC
3. Don't mix French and English in UI text
4. Don't ignore TypeScript strict mode errors
5. Don't use Node.js modules in renderer process
6. Always handle async operations with try-catch
7. Always run lint and format before committing

---

## Testing Guidelines

- Place test files next to source: `*.test.ts`
- Test utilities and business logic thoroughly
- Use descriptive test names
- Test edge cases and error conditions
- Minimum coverage target: 60%

---

## Development Checklist

Before committing:

- [ ] Code follows naming conventions
- [ ] Imports are properly ordered
- [ ] No `console.log` statements (use logger)
- [ ] TypeScript compiles without errors
- [ ] ESLint passes (`npm run lint`)
- [ ] Prettier formatting applied (`npm run format`)
- [ ] Tests pass (`npm run test:run`)
- [ ] UI text is in French
- [ ] Error handling is implemented
