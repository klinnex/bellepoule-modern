// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ScoreAuditEntry } from '../../../shared/types/preload';
import { ScoreAuditLog } from '../ScoreAuditLog';

vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

function entry(id: string, matchId: string, extra: Partial<ScoreAuditEntry> = {}): ScoreAuditEntry {
  return {
    id,
    matchId,
    arenaId: null,
    poolId: 'p1',
    matchNumber: 1,
    poolNumber: 1,
    previousScoreA: null,
    previousScoreB: null,
    newScoreA: { value: 5 },
    newScoreB: { value: 3 },
    changedBy: 'ui',
    changedAt: `2026-01-01T10:0${id.slice(-1)}:00Z`,
    reason: null,
    refereeId: null,
    refereeName: null,
    ipAddress: null,
    ...extra,
  };
}

describe('ScoreAuditLog — colonne Arbitre (#1031)', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: {
        getScoreAuditLogByCompetition: vi
          .fn()
          .mockResolvedValue([
            entry('e1', 'm1', { refereeName: 'Durand' }),
            entry('e2', 'm2'),
            entry('e3', 'c1-t3', { poolNumber: null, tableauRound: 2, tableauPosition: 0 }),
            entry('e4', 'm4'),
          ]),
      },
      onScoreIpConflict: () => () => {},
    };
  });

  it("affiche l'arbitre saisi, sinon le ou les arbitres assignés au match", async () => {
    render(
      <ScoreAuditLog
        competitionId="c1"
        matchOptions={[
          { id: 'm2', label: 'P1 M2', referees: ['Martin'] },
          { id: 't3', label: 'Finale', referees: ['Petit', 'Leroy'] },
        ]}
      />
    );
    expect(await screen.findByText('Durand')).toBeInTheDocument();
    expect(screen.getByText('Martin')).toBeInTheDocument();
    expect(screen.getByText('Petit / Leroy')).toBeInTheDocument();
    // Auteur technique « ui » jamais affiché comme arbitre
    expect(screen.queryByText('ui')).not.toBeInTheDocument();
  });
});
