import { describe, expect, it } from 'vitest';
import { FencerStatus, MatchStatus } from '../../types';
import { areAllPoolsComplete, isPoolComplete, isPoolMatchSettled } from './poolCompletion';
import { isBlackCardExcluded, isTableauEligible, isWithdrawn } from '../fencers/fencerStatus';

const f = (status?: FencerStatus, exclusionReason?: string) => ({ status, exclusionReason });

describe('statuts de tireur (#1979, lot 4)', () => {
  it('retiré : abandon, forfait, exclusion', () => {
    expect(
      [FencerStatus.ABANDONED, FencerStatus.FORFAIT, FencerStatus.EXCLUDED].map(s =>
        isWithdrawn(f(s))
      )
    ).toEqual([true, true, true]);
    expect(isWithdrawn(f(FencerStatus.ELIMINATED))).toBe(false);
    expect(isWithdrawn(null)).toBe(false);
  });

  it('éligible au tableau : ni retiré ni éliminé', () => {
    expect(isTableauEligible(f(FencerStatus.QUALIFIED))).toBe(true);
    expect(isTableauEligible(f(FencerStatus.ELIMINATED))).toBe(false);
    expect(isTableauEligible(f(FencerStatus.FORFAIT))).toBe(false);
  });

  it('carton noir : exclusion motivée seulement', () => {
    expect(isBlackCardExcluded(f(FencerStatus.EXCLUDED, 'black_card'))).toBe(true);
    expect(isBlackCardExcluded(f(FencerStatus.EXCLUDED))).toBe(false);
  });
});

describe('poule terminée (#1979, lot 4)', () => {
  const m = (status: MatchStatus, a?: FencerStatus) => ({ status, fencerA: f(a), fencerB: f() });

  it('match terminé ou tireur retiré : réglé', () => {
    expect(isPoolMatchSettled(m(MatchStatus.FINISHED))).toBe(true);
    expect(isPoolMatchSettled(m(MatchStatus.NOT_STARTED, FencerStatus.ABANDONED))).toBe(true);
    expect(isPoolMatchSettled(m(MatchStatus.NOT_STARTED))).toBe(false);
  });

  it('toutes les poules', () => {
    const done = { matches: [m(MatchStatus.FINISHED)] };
    const open = { matches: [m(MatchStatus.IN_PROGRESS)] };
    expect(isPoolComplete(done)).toBe(true);
    expect(areAllPoolsComplete([done, open])).toBe(false);
    expect(areAllPoolsComplete([done])).toBe(true);
  });
});
