/**
 * Règle de retrait et de réintégration (docs/adr/0016) : fonctions pures.
 */
import { describe, it, expect } from 'vitest';
import { FencerStatus, MatchStatus, type Fencer, type Match, type Pool } from '../../types';
import { planReinstatement, planWithdrawal, withdrawalExclusionReason } from './withdrawal';
import type { TableauMatch } from '../tableau/tableauTypes';

const now = new Date('2026-12-06T10:00:00Z');
const F = (id: string) =>
  ({ id, lastName: id, firstName: id, status: FencerStatus.CHECKED_IN }) as Fencer;
const [a, b, c] = ['a', 'b', 'c'].map(F);

function pool(matches: Array<[Fencer, Fencer, MatchStatus]>): Pool {
  return {
    id: 'p1',
    number: 1,
    fencers: [a, b, c],
    matches: matches.map(([x, y, status], i) => ({
      id: `m${i}`,
      number: i + 1,
      fencerA: x,
      fencerB: y,
      scoreA: status === MatchStatus.FINISHED ? { value: 5, isVictory: true } : null,
      scoreB: status === MatchStatus.FINISHED ? { value: 2, isVictory: false } : null,
      status,
    })) as unknown as Match[],
    ranking: [],
    isComplete: false,
  } as unknown as Pool;
}

const empty = { tableau: [], consolation: [], isLaserSabre: false };

describe('planWithdrawal', () => {
  it('appel : statut seul, DNS pour un forfait', () => {
    const plan = planWithdrawal(
      { pools: [], ...empty },
      { fencerId: 'a', currentStatus: 'P', reason: 'forfait', now }
    );
    expect(plan).toMatchObject({
      ok: true,
      phase: 'checkin',
      status: FencerStatus.FORFAIT,
      exclusionReason: 'dns',
    });
  });

  it('poules : matchs non disputés perdus, motif DNS seulement sans match commencé', () => {
    const p = pool([
      [a, b, MatchStatus.FINISHED],
      [a, c, MatchStatus.NOT_STARTED],
      [b, c, MatchStatus.NOT_STARTED],
    ]);
    const plan = planWithdrawal(
      { pools: [p], ...empty },
      { fencerId: 'a', currentStatus: 'P', reason: 'abandon', now }
    );
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.forfeitedMatchIds).toEqual(['m1']);
    expect(plan.exclusionReason).toBeNull();
    expect(plan.snapshot.map(s => s.matchId)).toEqual(['m0', 'm1']);
    const notStarted = pool([[a, b, MatchStatus.NOT_STARTED]]);
    expect(withdrawalExclusionReason('forfait', false, [notStarted], 'a')).toBe('dns');
    expect(withdrawalExclusionReason('exclusion', true, [notStarted], 'a')).toBe('black_card');
  });

  it('déjà retiré : refus', () => {
    expect(
      planWithdrawal(
        { pools: [], ...empty },
        { fencerId: 'a', currentStatus: FencerStatus.EXCLUDED, reason: 'forfait', now }
      )
    ).toEqual({ ok: false, code: 'already_withdrawn' });
  });

  it('tableau : match en cours perdu, adversaire inconnu refusé', () => {
    const m = (
      id: string,
      round: number,
      position: number,
      x: Fencer | null,
      y: Fencer | null
    ): TableauMatch => ({
      id,
      round,
      position,
      fencerA: x,
      fencerB: y,
      scoreA: null,
      scoreB: null,
      winner: null,
      isBye: false,
    });
    const tableau = [m('4-0', 4, 0, a, b), m('4-1', 4, 1, c, null), m('2-0', 2, 0, null, null)];
    const state = { pools: [], tableau, consolation: [], isLaserSabre: false };
    const plan = planWithdrawal(state, {
      fencerId: 'a',
      currentStatus: 'Q',
      reason: 'forfait',
      now,
    });
    if (!plan.ok) throw new Error(plan.code);
    expect(plan.tableau.find(x => x.id === '4-0')).toMatchObject({
      winner: { id: 'b' },
      specialStatus: { fencerId: 'a', status: 'forfait' },
    });
    expect(
      planWithdrawal(state, { fencerId: 'c', currentStatus: 'Q', reason: 'forfait', now })
    ).toEqual({
      ok: false,
      code: 'match_not_ready',
    });
  });
});

describe('planReinstatement', () => {
  it('sans instantané : withdrawal_not_found', () => {
    expect(
      planReinstatement({ pools: [], ...empty }, { fencerId: 'a', snapshot: null, now })
    ).toEqual({
      ok: false,
      code: 'withdrawal_not_found',
    });
  });

  it('poules : statut et matchs d’avant', () => {
    const p = pool([[a, b, MatchStatus.NOT_STARTED]]);
    const withdrawn = planWithdrawal(
      { pools: [p], ...empty },
      { fencerId: 'a', currentStatus: 'P', reason: 'forfait', now }
    );
    if (!withdrawn.ok) throw new Error(withdrawn.code);
    const back = planReinstatement(
      { pools: withdrawn.pools, ...empty },
      { fencerId: 'a', snapshot: { previousStatus: 'P', matchSnapshots: withdrawn.snapshot }, now }
    );
    if (!back.ok) throw new Error(back.code);
    expect(back.pools[0].matches[0].status).toBe(MatchStatus.NOT_STARTED);
    expect(back.pools[0].fencers.find(f => f.id === 'a')?.status).toBe('P');
  });
});
