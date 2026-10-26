import { describe, it, expect } from 'vitest';
import { MatchStatus } from '../../shared/types';
import { healMatchStatus, parsePoolRefereeIds, rowToReferee } from './rowMappers';

describe('rowMappers', () => {
  it('healMatchStatus : scores complets → terminé', () => {
    expect(healMatchStatus(MatchStatus.IN_PROGRESS, 5, 3)).toBe(MatchStatus.FINISHED);
  });

  it('healMatchStatus : en cours sans score → non commencé', () => {
    expect(healMatchStatus(MatchStatus.IN_PROGRESS, null, null)).toBe(MatchStatus.NOT_STARTED);
  });

  it('parsePoolRefereeIds : liste JSON, sinon repli sur referee_id', () => {
    expect(parsePoolRefereeIds({ referee_ids: '["r1","r2",3]' })).toEqual(['r1', 'r2']);
    expect(parsePoolRefereeIds({ referee_ids: '{oops', referee_id: 'r9' })).toEqual(['r9']);
    expect(parsePoolRefereeIds({})).toEqual([]);
  });

  it('rowToReferee : découpe nom / prénom', () => {
    const r = rowToReferee({ id: 'a', name: 'Jean Paul DUPONT', created_at: '2026-01-01' });
    expect(r.lastName).toBe('DUPONT');
    expect(r.firstName).toBe('Jean Paul');
    expect(r.status).toBe('available');
  });
});
