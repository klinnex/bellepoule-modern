/**
 * Tests - Forfait DNS / DNF (#1256)
 */

import { describe, it, expect } from 'vitest';
import {
  hasStartedPoolMatch,
  checkInForfeitReason,
  checkInStatusUpdate,
  isDns,
  statusCode,
  poolEliminatedAt,
  finalRankLabel,
} from './forfeit';
import { Fencer, FencerStatus, Match, MatchStatus, Pool, Score } from '../types';

const fencer = (id: string): Fencer => ({ id, status: FencerStatus.CHECKED_IN }) as Fencer;
const score = (value: number | null, flags: Partial<Score> = {}): Score => ({
  value,
  isVictory: false,
  isAbstention: false,
  isExclusion: false,
  isForfait: false,
  ...flags,
});
const match = (
  a: string,
  b: string,
  status: MatchStatus,
  scoreA: Score | null = null,
  scoreB: Score | null = null
): Match => ({ fencerA: fencer(a), fencerB: fencer(b), status, scoreA, scoreB }) as Match;
const pool = (matches: Match[]): Pool => ({ fencers: [], matches }) as unknown as Pool;

describe('hasStartedPoolMatch', () => {
  it('aucun match commencé', () => {
    const pools = [pool([match('a', 'b', MatchStatus.NOT_STARTED)])];
    expect(hasStartedPoolMatch(pools, 'a')).toBe(false);
  });

  it('match en cours ou joué', () => {
    expect(hasStartedPoolMatch([pool([match('a', 'b', MatchStatus.IN_PROGRESS)])], 'a')).toBe(true);
    const played = match('b', 'a', MatchStatus.FINISHED, score(5, { isVictory: true }), score(3));
    expect(hasStartedPoolMatch([pool([played])], 'a')).toBe(true);
  });

  it("match clos par le forfait de l'adversaire : non commencé", () => {
    const closed = match('a', 'b', MatchStatus.FINISHED, score(5), score(0, { isForfait: true }));
    expect(hasStartedPoolMatch([pool([closed])], 'a')).toBe(false);
  });

  it("ignore les matchs d'autres tireurs", () => {
    expect(hasStartedPoolMatch([pool([match('b', 'c', MatchStatus.IN_PROGRESS)])], 'a')).toBe(
      false
    );
  });
});

describe('checkInForfeitReason', () => {
  it('DNS si aucun match de poule commencé', () => {
    expect(checkInForfeitReason([], 'a')).toBe('dns');
  });
  it('pas DNS si un match est commencé', () => {
    expect(checkInForfeitReason([pool([match('a', 'b', MatchStatus.IN_PROGRESS)])], 'a')).toBe(
      null
    );
  });
});

describe('isDns / statusCode / poolEliminatedAt', () => {
  it('DNS uniquement pour un forfait ou médical marqué dns', () => {
    expect(isDns({ status: FencerStatus.FORFAIT, exclusionReason: 'dns' })).toBe(true);
    expect(isDns({ status: FencerStatus.ABANDONED, exclusionReason: 'dns' })).toBe(true);
    expect(isDns({ status: FencerStatus.FORFAIT, exclusionReason: null })).toBe(false);
    expect(isDns({ status: FencerStatus.CHECKED_IN, exclusionReason: 'dns' })).toBe(false);
  });
  it('sigle MED, F, X', () => {
    expect(statusCode(FencerStatus.ABANDONED)).toBe('MED');
    expect(statusCode(FencerStatus.FORFAIT)).toBe('F');
    expect(statusCode(FencerStatus.EXCLUDED)).toBe('X');
    expect(statusCode(FencerStatus.QUALIFIED)).toBe('');
  });
  it('motif de sortie dans « Éliminé en »', () => {
    expect(poolEliminatedAt({ status: FencerStatus.FORFAIT })).toBe('Poules (forfait)');
    expect(poolEliminatedAt({ status: FencerStatus.ABANDONED })).toBe('Poules (médical)');
    expect(poolEliminatedAt({ status: FencerStatus.EXCLUDED })).toBe('Poules (exclusion)');
    expect(poolEliminatedAt({ status: FencerStatus.ELIMINATED })).toBe('Poules');
  });
});

describe('checkInStatusUpdate', () => {
  const started = [pool([match('a', 'b', MatchStatus.IN_PROGRESS)])];
  it('forfait à l’appel : DNS ou motif effacé', () => {
    expect(checkInStatusUpdate([], 'a', FencerStatus.FORFAIT)).toEqual({
      status: FencerStatus.FORFAIT,
      exclusionReason: 'dns',
    });
    expect(checkInStatusUpdate(started, 'a', FencerStatus.FORFAIT).exclusionReason).toBeNull();
  });
  it('médical à l’appel : DNS ou motif effacé', () => {
    expect(checkInStatusUpdate([], 'a', FencerStatus.ABANDONED).exclusionReason).toBe('dns');
    expect(checkInStatusUpdate(started, 'a', FencerStatus.ABANDONED).exclusionReason).toBeNull();
  });
  it('réactivation : motif effacé', () => {
    expect(checkInStatusUpdate([], 'a', FencerStatus.CHECKED_IN).exclusionReason).toBeNull();
  });
  it('exclusion : motif inchangé', () => {
    expect(checkInStatusUpdate([], 'a', FencerStatus.EXCLUDED)).toEqual({
      status: FencerStatus.EXCLUDED,
    });
  });
});

describe('finalRankLabel', () => {
  const f = (status: FencerStatus, exclusionReason?: string) =>
    ({ status, exclusionReason }) as Pick<Fencer, 'status' | 'exclusionReason'>;
  it('DNS en poules (forfait ou médical)', () => {
    expect(finalRankLabel(9, f(FencerStatus.FORFAIT, 'dns'), 'Poules (forfait)')).toBe('DNS');
    expect(finalRankLabel(9, f(FencerStatus.ABANDONED, 'dns'), 'Poules (médical)')).toBe('DNS');
  });
  it('DNF forfait/médical en poules', () => {
    expect(finalRankLabel(9, f(FencerStatus.FORFAIT), 'Poules (forfait)')).toBe('DNF');
    expect(finalRankLabel(9, f(FencerStatus.ABANDONED), 'Poules')).toBe('DNF');
  });
  it('rang conservé pendant le tableau ou sans forfait', () => {
    expect(finalRankLabel(5, f(FencerStatus.FORFAIT), 'Quarts de finale (forfait)')).toBe('5');
    expect(finalRankLabel(9, f(FencerStatus.CHECKED_IN), 'Poules')).toBe('9');
  });
});
