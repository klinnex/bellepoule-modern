import { describe, it, expect } from 'vitest';
import {
  resolveReferee,
  resolvePoolReferee,
  resolveTableauMatchReferees,
  resolveDeMatchReferee,
  type RefereeResolverContext,
} from './refereeResolver';

const referees = [
  { id: 'r1', name: 'Anne Durand', code: '1', isActive: true, lastActivity: '' },
  { id: 'r2', name: 'Paul Martin', code: '2', isActive: true, lastActivity: '' },
];

function makeCtx(state: any = {}, withSession = true): RefereeResolverContext {
  const session = { competitionId: 'c1', referees } as any;
  return {
    getSession: () => (withSession ? session : null),
    getSessionReferees: () => referees as any,
    getSessionState: () => state,
  };
}

describe('refereeResolver (#1240)', () => {
  it('resolveReferee : trouve par id, null sinon ou sans session', () => {
    expect(resolveReferee(makeCtx(), 'r1')).toEqual({ id: 'r1', name: 'Anne Durand' });
    expect(resolveReferee(makeCtx(), 'zz')).toBeNull();
    expect(resolveReferee(makeCtx(), null)).toBeNull();
    expect(resolveReferee(makeCtx({}, false), 'r1')).toBeNull();
  });

  it('resolvePoolReferee : joint les arbitres de la poule, repli sur les champs du payload', () => {
    const state = {
      pools: [
        { id: 'p1', referees: [{ id: 'r1' }, { id: 'x', lastName: 'Zed', firstName: 'Al' }] },
      ],
    };
    expect(resolvePoolReferee(makeCtx(state), 'p1')).toEqual({
      id: 'r1',
      name: 'Anne Durand / Zed Al',
    });
    expect(resolvePoolReferee(makeCtx(state), 'p2')).toBeNull();
    expect(resolvePoolReferee(makeCtx({ pools: [{ id: 'p1', referees: [] }] }), 'p1')).toBeNull();
  });

  it('resolveTableauMatchReferees : seulement à partir de 2 arbitres, consolantes incluses', () => {
    const state = {
      tableauMatches: [{ id: 'm1', referees: [{ id: 'r1' }] }],
      consolationBrackets: [{ matches: [{ id: 'm2', referees: [{ id: 'r1' }, { id: 'r2' }] }] }],
    };
    expect(resolveTableauMatchReferees(makeCtx(state), 'm1')).toBeNull();
    expect(resolveTableauMatchReferees(makeCtx(state), 'm2')).toEqual({
      id: 'r1',
      name: 'Anne Durand / Paul Martin',
    });
  });

  it('resolveDeMatchReferee : referees, puis referee, puis refereeId', () => {
    const ctx = makeCtx();
    expect(resolveDeMatchReferee(ctx, { referees: [{ id: 'r2' }] })?.name).toBe('Paul Martin');
    expect(resolveDeMatchReferee(ctx, { referee: { id: 'r1' } })?.id).toBe('r1');
    expect(resolveDeMatchReferee(ctx, { refereeId: 'r2' })?.id).toBe('r2');
    expect(resolveDeMatchReferee(ctx, {})).toBeNull();
  });
});
