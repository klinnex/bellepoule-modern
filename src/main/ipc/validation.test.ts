import { describe, it, expect } from 'vitest';
import {
  validateUUID,
  validateCompetitionData,
  validateFencerData,
  validateMatchData,
} from './validation';
import type {
  CompetitionCreateData,
  FencerCreateData,
  MatchCreateData,
} from '../../shared/types/preload';

describe('validation IPC (#1774)', () => {
  it('validateUUID accepte un UUID, refuse le reste', () => {
    expect(() => validateUUID('123e4567-e89b-12d3-a456-426614174000', 'id')).not.toThrow();
    expect(() => validateUUID('', 'id')).toThrow('Invalid id format');
    expect(() => validateUUID('abc', 'competition ID')).toThrow('Invalid competition ID format');
  });

  it('validateCompetitionData exige titre, date (Date) et arme', () => {
    const ok = { title: 'T', date: new Date(), weapon: 'E' } as CompetitionCreateData;
    expect(() => validateCompetitionData(ok)).not.toThrow();
    expect(() => validateCompetitionData({ ...ok, title: '' })).toThrow(/title/);
    expect(() => validateCompetitionData({ ...ok, date: '2026-01-01' as unknown as Date })).toThrow(
      /date/
    );
    expect(() => validateCompetitionData({ ...ok, weapon: '' as never })).toThrow(/Weapon/);
  });

  it('validateFencerData exige nom/prénom, ref optionnelle positive', () => {
    const ok = { lastName: 'A', firstName: 'B' } as FencerCreateData;
    expect(() => validateFencerData(ok)).not.toThrow();
    expect(() => validateFencerData({ ...ok, ref: 3 })).not.toThrow();
    expect(() => validateFencerData({ ...ok, ref: -1 })).toThrow(/positive/);
    expect(() => validateFencerData({ ...ok, lastName: '' })).toThrow(/last name/);
    expect(() => validateFencerData({ ...ok, firstName: '' })).toThrow(/first name/);
  });

  it('validateMatchData exige numéro et score max positifs', () => {
    const ok = { number: 1, maxScore: 5 } as MatchCreateData;
    expect(() => validateMatchData(ok)).not.toThrow();
    expect(() => validateMatchData({ ...ok, number: -1 })).toThrow(/number/);
    expect(() => validateMatchData({ ...ok, maxScore: 'x' as unknown as number })).toThrow(
      /max score/
    );
  });
});
