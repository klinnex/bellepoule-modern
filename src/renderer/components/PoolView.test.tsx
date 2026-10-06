// @vitest-environment jsdom
/**
 * Tests de composant - PoolView
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PoolView from './PoolView';
import { Pool, Fencer, Match, MatchStatus, Gender, FencerStatus } from '../../shared/types';

const fencer = (id: string, last: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: last,
  firstName: 'F',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const f1 = fencer('1', 'Dupont');
const f2 = fencer('2', 'Martin');

const finishedMatch: Match = {
  id: 'm',
  number: 1,
  fencerA: f1,
  fencerB: f2,
  scoreA: { value: 5, isVictory: true } as any,
  scoreB: { value: 2, isVictory: false } as any,
  status: MatchStatus.FINISHED,
  maxScore: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const testPool: Pool = {
  id: 'p1',
  number: 1,
  phaseId: 'ph',
  fencers: [f1, f2],
  matches: [finishedMatch],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PoolView - saisie simplifiée : suppression au survol', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: {
        getPoolSignatures: vi.fn().mockResolvedValue([]),
      },
      onPoolSignatureUpdated: vi.fn().mockReturnValue(() => {}),
    };
    localStorage.setItem('bellepoule-simplified-input-mode', 'true');
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('survoler une case scorée puis appuyer sur Suppr efface le score du match', () => {
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    const cell = screen.getByLabelText(/Dupont F contre Martin F/i);
    fireEvent.mouseEnter(cell);
    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onMatchReset).toHaveBeenCalledTimes(1);
    expect(onMatchReset).toHaveBeenCalledWith(0);
  });

  it("n'efface rien si la souris ne survole aucune case", () => {
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onMatchReset).not.toHaveBeenCalled();
  });

  it('Suppr est sans effet hors saisie simplifiée', () => {
    localStorage.setItem('bellepoule-simplified-input-mode', 'false');
    const onMatchReset = vi.fn();
    render(<PoolView pool={testPool} onScoreUpdate={vi.fn()} onMatchReset={onMatchReset} />);

    const cell = screen.getByLabelText(/Dupont F contre Martin F/i);
    fireEvent.mouseEnter(cell);
    fireEvent.keyDown(document, { key: 'Delete' });

    expect(onMatchReset).not.toHaveBeenCalled();
  });
});
