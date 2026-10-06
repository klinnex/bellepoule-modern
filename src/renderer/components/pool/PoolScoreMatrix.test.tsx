// @vitest-environment jsdom
/**
 * Tests de composant - PoolScoreMatrix
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PoolScoreMatrix from './PoolScoreMatrix';
import { Pool, Fencer, Match, MatchStatus, Gender, FencerStatus } from '../../../shared/types';

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

const match = (status: MatchStatus, sa?: number, sb?: number): Match => ({
  id: 'm',
  number: 1,
  fencerA: f1,
  fencerB: f2,
  scoreA: sa != null ? ({ value: sa, isVictory: (sa ?? 0) > (sb ?? 0) } as any) : null,
  scoreB: sb != null ? ({ value: sb, isVictory: (sb ?? 0) > (sa ?? 0) } as any) : null,
  status,
  maxScore: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const pool = (m: Match): Pool => ({
  id: 'p1',
  number: 1,
  phaseId: 'ph',
  fencers: [f1, f2],
  matches: [m],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const renderMatrix = (m: Match, over: Partial<Record<string, any>> = {}) => {
  const props = {
    pool: pool(m),
    isLaserSabre: false,
    isVisible: (col: string) => col === 'victories',
    toggleColumn: vi.fn(),
    onCellClick: vi.fn(),
    ...over,
  };
  render(<PoolScoreMatrix {...(props as any)} />);
  return props;
};

describe('PoolScoreMatrix', () => {
  it('affiche les noms des tireurs en en-tête de ligne', () => {
    renderMatrix(match(MatchStatus.NOT_STARTED));
    expect(screen.getByText('Dupont')).toBeInTheDocument();
    expect(screen.getByText('Martin')).toBeInTheDocument();
  });

  it('affiche la colonne Victoires quand isVisible le permet', () => {
    renderMatrix(match(MatchStatus.NOT_STARTED));
    expect(screen.getByText('V')).toBeInTheDocument();
  });

  it('affiche le score V5 pour un match gagné', () => {
    renderMatrix(match(MatchStatus.FINISHED, 5, 2));
    expect(screen.getByText('V5')).toBeInTheDocument();
  });

  it('clic sur une cellule éditable déclenche onCellClick', () => {
    const props = renderMatrix(match(MatchStatus.NOT_STARTED));
    // cellule Dupont vs Martin (aria-label commence par "Dupont")
    const cell = screen.getByLabelText(/Dupont F contre Martin F/i);
    fireEvent.click(cell);
    expect(props.onCellClick).toHaveBeenCalledTimes(1);
    expect(props.onCellClick.mock.calls[0][0].id).toBe('1');
    expect(props.onCellClick.mock.calls[0][1].id).toBe('2');
  });

  it('ne déclenche pas onCellClick si verrouillé', () => {
    const props = renderMatrix(match(MatchStatus.NOT_STARTED), { isLocked: true });
    const cell = screen.getByLabelText(/Dupont F contre Martin F/i);
    fireEvent.click(cell);
    expect(props.onCellClick).not.toHaveBeenCalled();
  });
});
