/**
 * Tests - Forfait DNS / DNF (#1256)
 */

import { describe, it, expect } from 'vitest';
import {
  hasStartedPoolMatch,
  checkInForfeitReason,
  checkInStatusUpdate,
  isDns,
  forfeitCode,
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

describe('isDns / forfeitCode', () => {
  it('DNS uniquement pour un forfait marqué dns', () => {
    expect(isDns({ status: FencerStatus.FORFAIT, exclusionReason: 'dns' })).toBe(true);
    expect(isDns({ status: FencerStatus.FORFAIT, exclusionReason: null })).toBe(false);
    expect(isDns({ status: FencerStatus.CHECKED_IN, exclusionReason: 'dns' })).toBe(false);
  });
  it('sigle DNS ou F', () => {
    expect(forfeitCode({ status: FencerStatus.FORFAIT, exclusionReason: 'dns' })).toBe('DNS');
    expect(forfeitCode({ status: FencerStatus.FORFAIT })).toBe('F');
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
  it('réactivation / abandon : motif effacé', () => {
    expect(checkInStatusUpdate([], 'a', FencerStatus.CHECKED_IN).exclusionReason).toBeNull();
    expect(checkInStatusUpdate([], 'a', FencerStatus.ABANDONED).exclusionReason).toBeNull();
  });
  it('exclusion : motif inchangé', () => {
    expect(checkInStatusUpdate([], 'a', FencerStatus.EXCLUDED)).toEqual({
      status: FencerStatus.EXCLUDED,
    });
  });
});
