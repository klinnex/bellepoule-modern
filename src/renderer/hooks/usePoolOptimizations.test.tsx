// @vitest-environment jsdom
/**
 * Tests unitaires - usePoolOptimizations
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePoolCalculations,
  useOrderedMatches,
  useScoreEditing,
  useFencerDisplay,
  usePoolGridData,
} from './usePoolOptimizations';
import { Pool, Fencer, Match, MatchStatus, Gender, FencerStatus } from '../../shared/types';

const fencer = (id: string, ref: number): Fencer => ({
  id,
  ref,
  lastName: 'L' + id,
  firstName: 'F' + id,
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const f1 = fencer('1', 1),
  f2 = fencer('2', 2),
  f3 = fencer('3', 3);

const finished = (a: Fencer, b: Fencer, sa: number, sb: number): Match => ({
  id: `${a.id}-${b.id}`,
  number: 1,
  fencerA: a,
  fencerB: b,
  scoreA: { value: sa, isVictory: sa > sb } as any,
  scoreB: { value: sb, isVictory: sb > sa } as any,
  status: MatchStatus.FINISHED,
  maxScore: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const pending = (a: Fencer, b: Fencer): Match => ({
  id: `${a.id}-${b.id}`,
  number: 1,
  fencerA: a,
  fencerB: b,
  scoreA: null,
  scoreB: null,
  status: MatchStatus.NOT_STARTED,
  maxScore: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const pool = (fencers: Fencer[], matches: Match[]): Pool => ({
  id: 'p1',
  number: 1,
  phaseId: 'ph1',
  fencers,
  matches,
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('usePoolCalculations - fencerStats', () => {
  it('agrège victoires, touches et matchs joués', () => {
    const p = pool([f1, f2, f3], [finished(f1, f2, 5, 3), finished(f1, f3, 5, 2)]);
    const { result } = renderHook(() => usePoolCalculations(p));
    const s1 = result.current.fencerStats.get('1')!;
    expect(s1.victories).toBe(2);
    expect(s1.matchesPlayed).toBe(2);
    expect(s1.touchesScored).toBe(10);
    expect(s1.touchesReceived).toBe(5);
    expect(result.current.fencerStats.get('2')!.defeats).toBe(1);
  });

  it('ignore les matchs non terminés', () => {
    const p = pool([f1, f2], [pending(f1, f2)]);
    const { result } = renderHook(() => usePoolCalculations(p));
    expect(result.current.fencerStats.get('1')!.matchesPlayed).toBe(0);
  });
});

describe('useOrderedMatches', () => {
  it('réordonne tous les matchs (permutation) en limitant les enchaînements', () => {
    const f4 = fencer('4', 4);
    // 4 tireurs : on peut alterner les paires disjointes
    const p = pool(
      [f1, f2, f3, f4],
      [pending(f1, f2), pending(f3, f4), pending(f1, f3), pending(f2, f4)]
    );
    const { result } = renderHook(() => useOrderedMatches(p));
    const order = result.current.pending;
    expect(order).toHaveLength(4);
    // C'est bien une permutation des matchs d'origine
    expect(new Set(order.map(o => o.match.id)).size).toBe(4);
    // Le 2e match ne partage aucun tireur avec le 1er (évitement possible ici)
    const prev = new Set([order[0].match.fencerA!.id, order[0].match.fencerB!.id]);
    const cur = [order[1].match.fencerA!.id, order[1].match.fencerB!.id];
    expect(cur.some(id => prev.has(id))).toBe(false);
  });

  it('sépare terminés et en attente', () => {
    const p = pool([f1, f2, f3], [finished(f1, f2, 5, 1), pending(f1, f3)]);
    const { result } = renderHook(() => useOrderedMatches(p));
    expect(result.current.finished).toHaveLength(1);
    expect(result.current.pending).toHaveLength(1);
  });
});

describe('useScoreEditing', () => {
  it('startEditing initialise les champs depuis le match', () => {
    const { result } = renderHook(() => useScoreEditing());
    act(() => result.current.startEditing(finished(f1, f2, 5, 3)));
    expect(result.current.editScoreA).toBe('5');
    expect(result.current.editScoreB).toBe('3');
    expect(result.current.victoryA).toBe(true);
  });

  it('cancelEditing réinitialise tout', () => {
    const { result } = renderHook(() => useScoreEditing());
    act(() => result.current.startEditing(finished(f1, f2, 5, 3)));
    act(() => result.current.cancelEditing());
    expect(result.current.editingMatch).toBeNull();
    expect(result.current.editScoreA).toBe('');
    expect(result.current.victoryA).toBe(false);
  });
});

describe('useFencerDisplay', () => {
  it('formate l’affichage long et court', () => {
    const { result } = renderHook(() => useFencerDisplay([f1]));
    expect(result.current.getFencerDisplay(f1)).toBe('1. F1 L1');
    expect(result.current.getFencerShortDisplay(f1)).toBe('F. L1');
    expect(result.current.getFencerDisplay(null)).toBe('');
    expect(result.current.fencerById.get('1')).toBe(f1);
  });
});

describe('usePoolGridData', () => {
  it('remplit la grille avec scores et vainqueur', () => {
    const p = pool([f1, f2], [finished(f1, f2, 5, 2)]);
    const { result } = renderHook(() => usePoolGridData(p, []));
    expect(result.current.gridSize).toBe(2);
    const cell = result.current.grid[0][1];
    expect(cell.score).toBe('5-2');
    expect(cell.winner).toBe('A');
  });
});
