# Development Guide

This comprehensive guide is for contributors who want to develop, extend, or maintain BellePoule Modern.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Environment Setup](#development-environment-setup)
3. [Code Style and Conventions](#code-style-and-conventions)
4. [Testing Procedures](#testing-procedures)
5. [Build and Deployment](#build-and-deployment)
6. [Contributing Guidelines](#contributing-guidelines)
7. [Code Structure](#code-structure)
8. [API Documentation](#api-documentation)

## 🏗️ Architecture Overview

BellePoule Modern is built using modern web technologies wrapped in an Electron desktop application.

### Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Framework** | Electron | 44.5 | Cross-platform desktop application (Node 22) |
| **UI Library** | React | 19.3 | User interface components |
| **State** | Zustand (+ immer) | 5.0 | Feature stores |
| **Language** | TypeScript | 6.0 | Strict type-safe code |
| **Database** | better-sqlite3 | 13.0 | Native SQLite binding (synchronous) |
| **Bundler** | Webpack | 5.111 | Main, preload and renderer bundles |
| **Web Server** | Express | 5.2 | Remote scoring server |
| **WebSocket** | Socket.IO | 4.8 | Real-time communication |
| **PDF** | jsPDF + autotable | 4.2 / 5.0 | PDF exports |
| **OCR** | tesseract.js | 5.1 | Pool sheet photo entry |
| **Tests** | Vitest / Playwright | 4.1 / 1.63 | Unit / E2E |

Full list: [docs/STACK_TECHNIQUE.md](docs/STACK_TECHNIQUE.md). Detailed architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

### Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│ │   Main Thread   │  │   IPC Bridge   │  │ Remote Server  │ │
│ │                 │  │                 │  │                 │ │
│ │ • Menu System  │  │ • Main ↔ Render │  │ • Express      │ │
│ │ • Window Mgmt  │  │ • Preload API  │  │ • Socket.IO    │ │
│ │ • File System  │  │ • Security     │  │ • REST API     │ │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Electron Renderer Process                   │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│ │    React UI     │  │   State Mgmt   │  │   Components   │ │
│ │                 │  │                 │  │                 │ │
│ │ • Competition   │  │ • Hooks        │  │ • Forms        │ │
│ │ • Fencer Mgmt   │  │ • Context      │  │ • Tables       │ │
│ │ • Score Entry   │  │ • Local State  │  │ • Modals       │ │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer                                 │
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│ │   SQLite DB     │  │   File System  │  │   IPC Channel  │ │
│ │                 │  │                 │  │                 │ │
│ │ • Competitions │  │ • Import/Export │  │ • Database     │ │
│ │ • Fencers      │  │ • Configuration │  │ • File Ops     │ │
│ │ • Matches      │  │ • Logs         │  │ • Events       │ │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Type Safety**: Full TypeScript coverage
2. **Component Reusability**: Modular React components
3. **Data Integrity**: SQLite with validation
4. **Real-time Updates**: WebSocket for remote scoring
5. **Cross-Platform**: Single codebase, multiple targets
6. **Extensibility**: Plugin-friendly architecture

## 🛠️ Development Environment Setup

### Prerequisites

- **Node.js**: Version 22 (same as CI; required by better-sqlite3 13)
- **npm**: Version 10 or higher
- **Build tools** for the native module (`postinstall` runs `electron-rebuild -f -w better-sqlite3`): Python 3 + C++ toolchain (Visual Studio Build Tools on Windows, Xcode CLT on macOS, build-essential on Linux)
- **Git**: For source control
- **VS Code**: Recommended IDE

### IDE Configuration

#### VS Code Extensions (Recommended)

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-eslint",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

#### VS Code Settings

```json
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}
```

### Project Setup

#### 1. Clone Repository

```bash
git clone https://github.com/klinnex/bellepoule-modern.git
cd bellepoule-modern
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Development Scripts

```bash
# Development mode with hot reload
npm run dev

# Build and run in production mode
npm start

# Build only
npm run build

# Build main process only
npm run build:main

# Build renderer only
npm run build:renderer

# Package for distribution
npm run package

# Build for specific platforms
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

#### 4. Development Workflow

```bash
# Terminal 1: Watch main process changes
npm run dev:main

# Terminal 2: Watch renderer changes
npm run dev:renderer

# Terminal 3: Start Electron
npm start
```

### Debugging Configuration

#### VS Code Launch Configuration

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Main Process",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "windows": {
        "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron.cmd"
      },
      "args": [".", "--remote-debugging-port=9222"],
      "outputCapture": "std",
      "env": {
        "NODE_ENV": "development"
      }
    },
    {
      "name": "Debug Renderer Process",
      "type": "chrome",
      "request": "attach",
      "port": 9222,
      "webRoot": "${workspaceFolder}/src/renderer",
      "timeout": 30000
    }
  ]
}
```

## 📝 Code Style and Conventions

### TypeScript Configuration

The project uses strict TypeScript settings in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Naming Conventions

#### Files and Directories

```typescript
// Components: PascalCase
FencerList.tsx
CompetitionView.tsx
RemoteScoreManager.tsx

// Utilities: camelCase
fileParser.ts
poolCalculations.ts
tableCalculations.ts

// Types: camelCase
index.ts
remote.ts
preload.ts

// Constants: UPPER_SNAKE_CASE
const DEFAULT_POOL_SIZE = 6;
const MAX_TOUCHES_POOL = 21;
```

#### Variables and Functions

```typescript
// Variables: camelCase
const currentFencer = fencers[0];
const poolRankings = calculatePoolRankings(pool);

// Functions: camelCase
function calculateIndicator(victories, touchesGiven, touchesReceived) {
  return touchesGiven - touchesReceived + (victories * 5);
}

// Classes: PascalCase
class CompetitionManager {
  private competitions: Competition[] = [];
  
  public addCompetition(competition: Competition): void {
    // Implementation
  }
}

// Interfaces: PascalCase, I prefix optional
interface Fencer {
  id: string;
  lastName: string;
  firstName: string;
  gender: Gender;
}

// Enums: PascalCase
enum Gender {
  MALE = 'M',
  FEMALE = 'F',
  MIXED = 'X'
}
```

### React Component Patterns

#### Functional Components with Hooks

```typescript
import React, { useState, useEffect, useCallback } from 'react';

interface CompetitionViewProps {
  competitionId: string;
  onCompetitionUpdate: (competition: Competition) => void;
}

export const CompetitionView: React.FC<CompetitionViewProps> = ({
  competitionId,
  onCompetitionUpdate
}) => {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoize callback to prevent unnecessary re-renders
  const handleFencerUpdate = useCallback((fencer: Fencer) => {
    if (!competition) return;
    
    const updatedFencers = competition.fencers.map(f => 
      f.id === fencer.id ? fencer : f
    );
    
    const updatedCompetition = { ...competition, fencers: updatedFencers };
    setCompetition(updatedCompetition);
    onCompetitionUpdate(updatedCompetition);
  }, [competition, onCompetitionUpdate]);

  useEffect(() => {
    const loadCompetition = async () => {
      try {
        setLoading(true);
        const data = await window.electronAPI.getCompetition(competitionId);
        setCompetition(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadCompetition();
  }, [competitionId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!competition) return <div>Competition not found</div>;

  return (
    <div className="competition-view">
      <h2>{competition.name}</h2>
      <FencerList 
        fencers={competition.fencers} 
        onFencerUpdate={handleFencerUpdate} 
      />
    </div>
  );
};
```

#### Custom Hooks

```typescript
// hooks/useCompetitionData.ts
import { useState, useEffect, useCallback } from 'react';
import { Competition, Fencer } from '../shared/types';

export const useCompetitionData = (competitionId: string) => {
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCompetition = useCallback(async () => {
    try {
      setLoading(true);
      const data = await window.electronAPI.getCompetition(competitionId);
      setCompetition(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  const updateFencer = useCallback(async (fencer: Fencer) => {
    if (!competition) return false;
    
    try {
      await window.electronAPI.updateFencer(fencer);
      await refreshCompetition();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      return false;
    }
  }, [competition, refreshCompetition]);

  useEffect(() => {
    refreshCompetition();
  }, [refreshCompetition]);

  return {
    competition,
    loading,
    error,
    refreshCompetition,
    updateFencer
  };
};
```

### Error Handling Patterns

#### Async Error Handling

```typescript
class CompetitionService {
  static async getCompetition(id: string): Promise<Competition> {
    try {
      const result = await window.electronAPI.getCompetition(id);
      
      if (!result) {
        throw new Error(`Competition with id ${id} not found`);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to load competition:', error);
      throw new Error(`Unable to load competition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async saveCompetition(competition: Competition): Promise<void> {
    try {
      // Validate competition before saving
      this.validateCompetition(competition);
      
      await window.electronAPI.saveCompetition(competition);
    } catch (error) {
      console.error('Failed to save competition:', error);
      throw new Error(`Unable to save competition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static validateCompetition(competition: Competition): void {
    if (!competition.name || competition.name.trim() === '') {
      throw new Error('Competition name is required');
    }
    
    if (competition.fencers.length === 0) {
      throw new Error('Competition must have at least one fencer');
    }
    
    if (!competition.weapon) {
      throw new Error('Weapon is required');
    }
  }
}
```

### Database Patterns

#### Database Access Layer

```typescript
// database/competitionRepository.ts
import { Competition, Fencer, Match } from '../shared/types';

export class CompetitionRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createCompetition(competition: Omit<Competition, 'id' | 'createdAt' | 'updatedAt'>): Promise<Competition> {
    const id = generateId();
    const now = new Date().toISOString();
    
    const newCompetition: Competition = {
      ...competition,
      id,
      createdAt: now,
      updatedAt: now
    };

    const stmt = this.db.prepare(`
      INSERT INTO competitions (
        id, name, weapon, gender, date, location, 
        created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      newCompetition.id,
      newCompetition.name,
      newCompetition.weapon,
      newCompetition.gender,
      newCompetition.date,
      newCompetition.location,
      newCompetition.createdAt,
      newCompetition.updatedAt,
      JSON.stringify(newCompetition.metadata || {})
    );

    return newCompetition;
  }

  async getCompetition(id: string): Promise<Competition | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM competitions WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      weapon: row.weapon,
      gender: row.gender,
      date: row.date,
      location: row.location,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: JSON.parse(row.metadata || '{}'),
      fencers: await this.getFencersForCompetition(id),
      matches: await this.getMatchesForCompetition(id)
    };
  }

  async updateCompetition(id: string, updates: Partial<Competition>): Promise<boolean> {
    const fields = Object.keys(updates).filter(key => 
      key !== 'id' && key !== 'createdAt'
    );

    if (fields.length === 0) return true;

    const setClause = fields.map(field => `${this.camelToSnake(field)} = ?`).join(', ');
    const values = fields.map(field => (updates as any)[field]);
    values.push(new Date().toISOString()); // updated_at
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE competitions 
      SET ${setClause}, updated_at = ? 
      WHERE id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}
```

## 🧪 Testing Procedures

### Testing Framework Setup

Unit tests use **Vitest 4** (`vitest.config.ts`) with `jsdom`, `@testing-library/react`,
`@testing-library/jest-dom` and `fake-indexeddb`. Test files are co-located with the code
(`*.test.ts` / `*.test.tsx`, plus `src/renderer/components/__tests__/`).

```bash
npm test                              # watch mode
npm run test:run                      # single run (CI)
npm run test:coverage                 # coverage (@vitest/coverage-v8)
npx vitest run src/shared/utils/poolCalculations.test.ts   # single file
```

### Unit Tests

#### Testing Utility Functions

```typescript
// src/shared/utils/poolCalculations.test.ts
import { calculateIndicator, calculatePoolRankings } from '../poolCalculations';
import { Fencer } from '../../types';

describe('Pool Calculations', () => {
  const mockFencer: Fencer = {
    id: '1',
    lastName: 'Test',
    firstName: 'Fencer',
    gender: 'M',
    victories: 3,
    touchesGiven: 15,
    touchesReceived: 12
  };

  describe('calculateIndicator', () => {
    it('should calculate correct indicator', () => {
      const result = calculateIndicator(3, 15, 12);
      expect(result).toBe(18); // (15 - 12) + (3 * 5) = 3 + 15 = 18
    });

    it('should handle zero victories', () => {
      const result = calculateIndicator(0, 10, 15);
      expect(result).toBe(-5); // (10 - 15) + (0 * 5) = -5 + 0 = -5
    });

    it('should handle negative values', () => {
      expect(() => calculateIndicator(-1, 15, 12)).toThrow('Victories cannot be negative');
      expect(() => calculateIndicator(3, -5, 12)).toThrow('Touches given cannot be negative');
      expect(() => calculateIndicator(3, 15, -5)).toThrow('Touches received cannot be negative');
    });
  });

  describe('calculatePoolRankings', () => {
    it('should rank fencers by correct criteria', () => {
      const fencers: Fencer[] = [
        { ...mockFencer, id: '1', victories: 3, touchesGiven: 15, touchesReceived: 12 },
        { ...mockFencer, id: '2', victories: 4, touchesGiven: 20, touchesReceived: 10 },
        { ...mockFencer, id: '3', victories: 3, touchesGiven: 18, touchesReceived: 9 }
      ];

      const rankings = calculatePoolRankings(fencers);

      expect(rankings[0].id).toBe('2'); // 4 victories, indicator 20
      expect(rankings[1].id).toBe('3'); // 3 victories, indicator 19
      expect(rankings[2].id).toBe('1'); // 3 victories, indicator 18
    });
  });
});
```

#### Testing React Components

```typescript
// src/renderer/components/FencerList.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FencerList } from '../FencerList';
import { Fencer } from '../../../shared/types';

describe('FencerList', () => {
  const mockFencers: Fencer[] = [
    {
      id: '1',
      lastName: 'DUPONT',
      firstName: 'Jean',
      gender: 'M',
      status: 'NOT_CHECKED_IN'
    },
    {
      id: '2',
      lastName: 'MARTIN',
      firstName: 'Marie',
      gender: 'F',
      status: 'PRESENT'
    }
  ];

  const mockOnFencerUpdate = vi.fn();

  beforeEach(() => {
    mockOnFencerUpdate.mockClear();
  });

  it('should render fencer list', () => {
    render(
      <FencerList 
        fencers={mockFencers} 
        onFencerUpdate={mockOnFencerUpdate} 
      />
    );

    expect(screen.getByText('DUPONT Jean')).toBeInTheDocument();
    expect(screen.getByText('MARTIN Marie')).toBeInTheDocument();
  });

  it('should handle fencer status change', async () => {
    render(
      <FencerList 
        fencers={mockFencers} 
        onFencerUpdate={mockOnFencerUpdate} 
      />
    );

    const statusSelect = screen.getByLabelText('Status for DUPONT Jean');
    fireEvent.change(statusSelect, { target: { value: 'PRESENT' } });

    await waitFor(() => {
      expect(mockOnFencerUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          status: 'PRESENT'
        })
      );
    });
  });

  it('should filter fencers by search term', () => {
    render(
      <FencerList 
        fencers={mockFencers} 
        onFencerUpdate={mockOnFencerUpdate} 
      />
    );

    const searchInput = screen.getByPlaceholderText('Search fencers...');
    fireEvent.change(searchInput, { target: { value: 'DUPONT' } });

    expect(screen.getByText('DUPONT Jean')).toBeInTheDocument();
    expect(screen.queryByText('MARTIN Marie')).not.toBeInTheDocument();
  });
});
```

### Integration Tests

#### Testing File Operations

```typescript
// exemple : src/shared/utils/fileParser.test.ts
import { readFileSync } from 'fs';
import { parseFFEFile } from '../fileParser';

describe('File Parser Integration', () => {
  it('should parse real FFE file', async () => {
    const fileContent = readFileSync('./test-data/sample.fff', 'utf-8');
    const result = parseFFEFile(fileContent);

    expect(result.success).toBe(true);
    expect(result.fencers.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    
    const firstFencer = result.fencers[0];
    expect(firstFencer.lastName).toBe('DUPONT');
    expect(firstFencer.firstName).toBe('Jean');
  });

  it('should handle mixed format with commas in names', () => {
    const mixedFormat = `DUPONT,Jean,15/03/1995,M,FRA,,12345678,ÎLE-DE-FRANCE,PARIS ESCRIME,12`;
    const result = parseFFEFile(mixedFormat);

    expect(result.success).toBe(true);
    expect(result.fencers[0]).toEqual({
      lastName: 'DUPONT',
      firstName: 'Jean',
      gender: 'M',
      nationality: 'FRA',
      league: 'ÎLE-DE-FRANCE',
      club: 'PARIS ESCRIME',
      license: '12345678',
      ranking: 12
    });
  });
});
```

### End-to-End Tests

#### E2E with Playwright

```typescript
// tests/e2e/competition.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Competition Management', () => {
  test('should create and manage a competition', async ({ page }) => {
    await page.goto('http://localhost:3000'); // Development server
    
    // Create new competition
    await page.click('[data-testid="new-competition"]');
    await page.fill('[data-testid="competition-name"]', 'Test Competition');
    await page.selectOption('[data-testid="weapon"]', 'Épée');
    await page.click('[data-testid="create-competition"]');
    
    // Verify competition created
    await expect(page.locator('h1')).toContainText('Test Competition');
    
    // Add fencer
    await page.click('[data-testid="add-fencer"]');
    await page.fill('[data-testid="last-name"]', 'Test');
    await page.fill('[data-testid="first-name"]', 'Fencer');
    await page.click('[data-testid="save-fencer"]');
    
    // Verify fencer added
    await expect(page.locator('[data-testid="fencer-list"]')).toContainText('Test Fencer');
    
    // Generate pools
    await page.click('[data-testid="check-in-all"]');
    await page.click('[data-testid="generate-pools"]');
    
    // Verify pools generated
    await expect(page.locator('[data-testid="pool-view"]')).toBeVisible();
  });
});
```

### Test Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "e2e:debug": "playwright test --debug"
  }
}
```

## 🏗️ Build and Deployment

### Build Process

#### Development Build

```bash
# Fast rebuild for development
npm run build:main
npm run build:renderer
```

#### Production Build

```bash
# Full production build
npm run build

# Build for specific platform
npm run build && electron-builder --win    # Windows
npm run build && electron-builder --mac    # macOS
npm run build && electron-builder --linux  # Linux
```

#### Build Configuration

`electron-builder` configuration lives in the `build` key of `package.json`:

| OS | Targets |
|---|---|
| Windows | `nsis`, `portable` |
| macOS | `dmg`, `zip` (x64 + arm64) |
| Linux | `AppImage`, `deb`, `rpm` |

`asarUnpack`: `dist/remote/**`, `better-sqlite3`, `tesseract.js`. `extraResources`: `resources/`, `version.json`. Output: `release/`.

### CI/CD Pipeline

#### GitHub Actions Workflow

| Workflow | Trigger | Jobs |
|---|---|---|
| `.github/workflows/build-dev.yml` | push `dev` | type-check, i18n completeness, unit tests, bundle budget → build number increment → Windows/macOS/Linux builds → dev pre-release |
| `.github/workflows/build.yml` | push `main` | same → stable release |
| `.github/workflows/claude-code-review.yml` | pull request | automated review |
| `.github/workflows/track-downloads.yml` | daily cron | download stats |

All jobs use Node 22.

### Version Management

#### Version Configuration

`version.json`:
```json
{
  "version": "1.0.0",
  "build": 81,
  "channel": "stable"
}
```

#### Build Scripts

```json
{
  "scripts": {
    "version:patch": "npm version patch && npm run version:update",
    "version:minor": "npm version minor && npm run version:update",
    "version:major": "npm version major && npm run version:update",
    "version:update": "node scripts/updateVersion.js"
  }
}
```

## 🤝 Contributing Guidelines

### Code Review Process

#### Before Submitting

1. **Fork and Branch**
   ```bash
   git clone https://github.com/your-username/bellepoule-modern.git
   cd bellepoule-modern
   git checkout -b feature/your-feature-name
   ```

2. **Development**
   - Follow code style guidelines
   - Write tests for new features
   - Update documentation
   - Ensure all tests pass

3. **Pre-commit Checks**
   ```bash
   npm run lint
   npm run test
   npm run build
   ```

#### Pull Request Requirements

- **Clear Description**: Explain what and why
- **Tests Included**: Unit and integration tests
- **Documentation Updated**: README, code comments
- **No Breaking Changes**: Or clearly documented
- **Single Purpose**: One feature/fix per PR

#### Code Review Checklist

**For Reviewers**:
- [ ] Code follows style guidelines
- [ ] Tests are comprehensive
- [ ] Documentation is accurate
- [ ] No performance regressions
- [ ] Security considerations addressed
- [ ] Cross-platform compatibility

**For Authors**:
- [ ] All tests pass locally
- [ ] Code is self-documenting
- [ ] Error handling is robust
- [ ] No console.log statements
- [ ] Types are properly defined

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, missing semicolons)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes
- `perf`: Performance improvements

#### Examples

```bash
feat(fencer): add bulk import functionality
fix(pool): resolve ranking calculation error
docs(readme): update installation instructions
test(fileparser): add mixed format tests
refactor(remote): extract server logic to separate module
```

## 📁 Code Structure

### Directory Organization

See the full, up-to-date tree in [ARCHITECTURE.md §2](ARCHITECTURE.md#2-arborescence).

```
src/
├── main/        # Electron main: main.ts, preload.ts, remoteScoreServer.ts, certManager.ts, autoUpdater.ts
├── renderer/    # React UI: App.tsx, components/, hooks/, contexts/, services/, locales/
├── features/    # Business modules (Zustand stores + services): pools, bracket, teams, ...
├── shared/      # types/, services/, utils/ (calculations, parsers, PDF export)
├── database/    # DatabaseManager, validation, migrations/
└── remote/      # Vanilla HTML/JS pages served to tablets and screens (referee.html, arena.html, ...)
```

### Module Organization

#### Main Process Modules

```typescript
// main/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { createMainWindow } from './windowManager';
import { setupIpcHandlers } from './ipcHandlers';
import { AutoUpdater } from './autoUpdater';

class Application {
  private mainWindow: BrowserWindow | null = null;
  private autoUpdater: AutoUpdater;

  constructor() {
    this.autoUpdater = new AutoUpdater();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    app.whenReady().then(() => {
      this.mainWindow = createMainWindow();
      setupIpcHandlers();
      this.autoUpdater.checkForUpdates();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}

new Application();
```

#### Renderer Process Modules

```typescript
// renderer/components/CompetitionView.tsx
import React, { useState, useEffect } from 'react';
import { useCompetitionData } from '../hooks/useCompetitionData';
import { FencerList } from './FencerList';
import { PoolView } from './PoolView';
import { TableauView } from './TableauView';

export const CompetitionView: React.FC<{ competitionId: string }> = ({ competitionId }) => {
  const { competition, loading, error } = useCompetitionData(competitionId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!competition) return <div>Competition not found</div>;

  return (
    <div className="competition-view">
      <h1>{competition.name}</h1>
      <FencerList competition={competition} />
      <PoolView competition={competition} />
      <TableauView competition={competition} />
    </div>
  );
};
```

#### Shared Modules

```typescript
// shared/types/index.ts
export interface Fencer {
  id: string;
  lastName: string;
  firstName: string;
  gender: Gender;
  birthDate?: Date;
  nationality: string;
  league?: string;
  club?: string;
  license?: string;
  ranking?: number;
  status: FencerStatus;
  victories?: number;
  touchesGiven?: number;
  touchesReceived?: number;
}

export enum Gender {
  MALE = 'M',
  FEMALE = 'F',
  MIXED = 'X'
}

export enum FencerStatus {
  NOT_CHECKED_IN = 'NOT_CHECKED_IN',
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  WITHDRAW = 'WITHDRAW',
  EXCLUDED = 'EXCLUDED'
}

export interface Competition {
  id: string;
  name: string;
  weapon: Weapon;
  gender: Gender;
  date: string;
  location?: string;
  fencers: Fencer[];
  pools?: Pool[];
  matches?: Match[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}
```

## 📡 API Documentation

### IPC Communication

#### Main Process API

```typescript
// main/ipcHandlers.ts
import { ipcMain } from 'electron';
import { CompetitionRepository } from '../database/competitionRepository';

export function setupIpcHandlers(): void {
  // Competition operations
  ipcMain.handle('competition:getAll', async () => {
    return await CompetitionRepository.getAll();
  });

  ipcMain.handle('competition:get', async (event, id: string) => {
    return await CompetitionRepository.getById(id);
  });

  ipcMain.handle('competition:create', async (event, competitionData) => {
    return await CompetitionRepository.create(competitionData);
  });

  ipcMain.handle('competition:update', async (event, id: string, updates) => {
    return await CompetitionRepository.update(id, updates);
  });

  ipcMain.handle('competition:delete', async (event, id: string) => {
    return await CompetitionRepository.delete(id);
  });

  // File operations
  ipcMain.handle('file:importFFF', async (event, filePath: string) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseFFEFile(content);
  });

  ipcMain.handle('file:exportXML', async (event, competitionId: string, filePath: string) => {
    const competition = await CompetitionRepository.getById(competitionId);
    const xml = generateCompetitionXML(competition);
    await fs.writeFile(filePath, xml, 'utf-8');
    return { success: true };
  });
}
```

#### Renderer Process API

```typescript
// renderer/services/api.ts
export class CompetitionAPI {
  static async getAll(): Promise<Competition[]> {
    return await window.electronAPI.invoke('competition:getAll');
  }

  static async get(id: string): Promise<Competition | null> {
    return await window.electronAPI.invoke('competition:get', id);
  }

  static async create(competitionData: Omit<Competition, 'id' | 'createdAt' | 'updatedAt'>): Promise<Competition> {
    return await window.electronAPI.invoke('competition:create', competitionData);
  }

  static async update(id: string, updates: Partial<Competition>): Promise<boolean> {
    return await window.electronAPI.invoke('competition:update', id, updates);
  }

  static async delete(id: string): Promise<boolean> {
    return await window.electronAPI.invoke('competition:delete', id);
  }
}
```

### Remote Scoring API

Referee tablets talk to `RemoteScoreServer` through:

- **Socket.IO** — `join_arena`, `client:register`, and a single `arena_control` event
  whose `action` field selects the command (`select_match`, `start`, `pause`,
  `update_score`, `update_timer`, `waiting_overtime`, `coin_flip`, `arena_exit`,
  `card_announcement`, `dt_call`, `change_referee`, `finish`, ...). The server broadcasts
  `arena:{id}:update` to screens.
- **REST** — `POST /api/matches/:id/score` (intermediate save), `POST /api/matches/:id/finish`
  (final result), `POST /api/auth/login/:arenaId` (arena password → cookie).

Reference: [REMOTE_SCORE_GUIDE.md §7](REMOTE_SCORE_GUIDE.md#7-api-référence) and
[docs/ARBITRAGE.md §7](docs/ARBITRAGE.md#7-protocole-référence-technique).
Types: `src/shared/types/remote.ts`.

### Database Schema

The schema is created and evolved by versioned migrations in
`src/database/migrations/migrations.ts` (18 versions, tracked in `schema_migrations`).
Main tables: `competitions`, `fencers`, `referees`, `phases`, `pools`, `pool_fencers`,
`matches`, `bracket_nodes`, `match_cards`, `match_touches`, `match_arena_exits`,
`score_audit_log`, `pool_signatures`, `de_match_signatures`, `arena_state`,
`session_state`, `teams`, `team_fencers`, `team_matches`, `team_bouts`,
`team_match_cards`, `season_results`, `referee_comments`.
See [ARCHITECTURE.md §5](ARCHITECTURE.md#5-base-de-données).

To add a migration: append an entry `{ version, description, up(db) }` with the next
version number; never edit an existing migration.

---

## 🎯 Development Best Practices

### Performance Optimization

1. **React Optimization**
   - Use `React.memo` for pure components
   - Implement `useMemo` and `useCallback` appropriately
   - Avoid unnecessary re-renders

2. **Database Optimization**
   - Use prepared statements
   - Implement proper indexing
   - Batch operations when possible

3. **Memory Management**
   - Clean up event listeners
   - Dispose of database connections
   - Monitor for memory leaks

### Security Considerations

1. **Input Validation**
   - Validate all user inputs
   - Sanitize file uploads
   - Prevent SQL injection

2. **IPC Security**
   - Use preload scripts properly
   - Don't expose entire Node.js API
   - Validate IPC message parameters

3. **Remote Scoring Security**
   - Generate secure access codes
   - Implement rate limiting
   - Validate WebSocket messages

### Accessibility

1. **Keyboard Navigation**
   - Support tab navigation
   - Provide keyboard shortcuts
   - Focus management

2. **Screen Reader Support**
   - Semantic HTML
   - ARIA labels and roles
   - Alt text for images

3. **Visual Accessibility**
   - High contrast mode
   - Resizable text
   - Color-blind friendly design

This development guide provides comprehensive information for contributing to BellePoule Modern. For specific questions or issues, please refer to the GitHub discussions or create an issue.