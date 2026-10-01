// @vitest-environment jsdom
/**
 * Tests unitaires - usePoolManagement
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePoolManagement } from './usePoolManagement';
import { Fencer, Pool, Match, MatchStatus, Gender, FencerStatus } from '../../shared/types';

const fencer = (id: number): Fencer => ({
  id: String(id), ref: id, lastName: 'L' + id, firstName: 'F',
  gender: Gender.MALE, nationality: 'FRA', status: FencerStatus.CHECKED_IN,
  createdAt: new Date(), updatedAt: new Date(),
});

let showToast: ReturnType<typeof vi.fn>;
beforeEach(() => { showToast = vi.fn(); });

const setup = () =>
  renderHook(() =>
    usePoolManagement({ isLaserSabre: false, poolMaxScore: 5, showToast: showToast as any })
  ).result;

describe('generatePools', () => {
  it('refuse moins de 4 tireurs', () => {
    const r = setup();
    let res: Pool[] | null = [];
    act(() => { res = r.current.generatePools([fencer(1), fencer(2)]); });
    expect(res).toBeNull();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('4 tireurs'), 'warning');
  });

  it('génère des poules avec matchs pour 8 tireurs', () => {
    const r = setup();
    const fencers = Array.from({ length: 8 }, (_, i) => fencer(i + 1));
    let res: Pool[] | null = null;
    act(() => { res = r.current.generatePools(fencers); });
    expect(res).not.toBeNull();
    expect(r.current.pools.length).toBeGreaterThan(0);
    // tous les tireurs répartis
    const total = r.current.pools.reduce((n, p) => n + p.fencers.length, 0);
    expect(total).toBe(8);
    // chaque poule a des matchs
    expect(r.current.pools.every(p => p.matches.length > 0)).toBe(true);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('poules créées'), 'success');
  });
});

describe('areAllPoolsComplete', () => {
  const poolWith = (status: MatchStatus): Pool => ({
    id: 'p1', number: 1, phaseId: 'ph', fencers: [fencer(1), fencer(2)],
    matches: [{
      id: 'm', number: 1, fencerA: fencer(1), fencerB: fencer(2),
      scoreA: null, scoreB: null, maxScore: 5, status,
      createdAt: new Date(), updatedAt: new Date(),
    } as Match],
    referees: [], isComplete: false, hasError: false, ranking: [],
    createdAt: new Date(), updatedAt: new Date(),
  });

  it('faux si un match n’est pas terminé', () => {
    const r = setup();
    act(() => r.current.setPools([poolWith(MatchStatus.NOT_STARTED)]));
    expect(r.current.areAllPoolsComplete()).toBe(false);
  });

  it('vrai si tous les matchs sont terminés', () => {
    const r = setup();
    act(() => r.current.setPools([poolWith(MatchStatus.FINISHED)]));
    expect(r.current.areAllPoolsComplete()).toBe(true);
  });
});

describe('computePoolRanking', () => {
  it('retourne un classement (tableau)', () => {
    const r = setup();
    const pool = poolFixture();
    const ranking = r.current.computePoolRanking(pool);
    expect(Array.isArray(ranking)).toBe(true);
  });
});

function poolFixture(): Pool {
  return {
    id: 'p1', number: 1, phaseId: 'ph', fencers: [fencer(1), fencer(2)],
    matches: [], referees: [], isComplete: false, hasError: false, ranking: [],
    createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('handleBlackCardCancelled', () => {
  const sc = (value: number, extra: Partial<Match['scoreA']> = {}) => ({
    value, isVictory: false, isAbstention: false, isExclusion: false, isForfait: false, ...extra,
  });

  it('réintègre le combattant, rouvre le match du carton et rend ses résultats aux adversaires', () => {
    const r = setup();
    const excluded = { ...fencer(1), status: FencerStatus.EXCLUDED, exclusionReason: 'black_card' as const };
    const f2 = fencer(2), f3 = fencer(3), f4 = fencer(4);
    const m = (id: string, a: Fencer, b: Fencer, status: MatchStatus, sa: any, sb: any) =>
      ({ id, number: 1, fencerA: a, fencerB: b, scoreA: sa, scoreB: sb, maxScore: 5, status,
        createdAt: new Date(), updatedAt: new Date() }) as Match;
    const pool: Pool = {
      id: 'p1', number: 1, phaseId: 'ph', fencers: [excluded, f2, f3, f4],
      matches: [
        m('played', excluded, f2, MatchStatus.FINISHED, sc(5, { isVictory: true }), sc(1)),
        m('black', excluded, f3, MatchStatus.FINISHED, sc(3), sc(2, { isVictory: true })),
        m('next', excluded, f4, MatchStatus.FINISHED, sc(0, { isExclusion: true }), sc(0)),
      ],
      referees: [], isComplete: false, hasError: false, ranking: [],
      createdAt: new Date(), updatedAt: new Date(),
    };
    act(() => r.current.setPools([pool]));
    act(() => r.current.handleBlackCardCancelled('1', 'black', FencerStatus.CHECKED_IN, 3, 2));

    const p = r.current.pools[0];
    expect(p.fencers[0].status).toBe(FencerStatus.CHECKED_IN);
    const [played, black, next] = p.matches;
    expect(played.status).toBe(MatchStatus.FINISHED);
    expect(played.scoreA?.value).toBe(5);
    expect(black.status).toBe(MatchStatus.IN_PROGRESS);
    expect(black.scoreA).toMatchObject({ value: 3, isVictory: false });
    expect(black.scoreB).toMatchObject({ value: 2, isVictory: false });
    expect(next.status).toBe(MatchStatus.NOT_STARTED);
    expect(next.scoreA).toBeNull();
    // La victoire 5-1 compte de nouveau pour le combattant réintégré
    const row = p.ranking.find(rk => rk.fencer.id === '1');
    expect(row?.victories).toBe(1);
  });
});
