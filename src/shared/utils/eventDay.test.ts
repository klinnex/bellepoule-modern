import { describe, it, expect } from 'vitest';
import { Weapon } from '../types';
import type { DayRefereeAssignment } from '../types/eventDay';
import {
  refereeNameKey,
  splitRefereeName,
  busyElsewhere,
  canOfficiate,
  computeDayStatuses,
  dayRefereeFullName,
  detectDayConflicts,
  parseWeapons,
  serializeWeapons,
} from './eventDay';

const a = (over: Partial<DayRefereeAssignment>): DayRefereeAssignment => ({
  dayRefereeId: 'd1',
  competitionId: 'c1',
  competitionTitle: 'M15 Fleuret',
  refereeId: 'r1',
  kind: 'pool',
  number: 1,
  strip: 1,
  ...over,
});

describe('eventDay (#1714)', () => {
  it('parse et sérialise les armes', () => {
    expect(parseWeapons('F, e,X,F')).toEqual([Weapon.FOIL, Weapon.EPEE]);
    expect(parseWeapons(null)).toEqual([]);
    expect(serializeWeapons([Weapon.SABRE, Weapon.FOIL])).toBe('S,F');
    expect(serializeWeapons(undefined)).toBe('');
  });

  it('autorise selon les armes (vide = toutes)', () => {
    expect(canOfficiate({ weapons: [Weapon.FOIL] }, Weapon.FOIL)).toBe(true);
    expect(canOfficiate({ weapons: [Weapon.FOIL] }, Weapon.EPEE)).toBe(false);
    expect(canOfficiate({ weapons: [] }, Weapon.EPEE)).toBe(true);
  });

  it('nom complet', () => {
    expect(dayRefereeFullName({ firstName: 'Anne', lastName: 'Martin' })).toBe('Anne Martin');
    expect(dayRefereeFullName({ firstName: '', lastName: 'Martin' })).toBe('Martin');
  });

  it('statut commun libre / occupé', () => {
    const st = computeDayStatuses([{ id: 'd1' }, { id: 'd2' }], [a({})]);
    expect(st[0]).toMatchObject({ state: 'busy', assignments: [a({})] });
    expect(st[1]).toEqual({ dayRefereeId: 'd2', state: 'free', assignments: [] });
  });

  it('détecte les conflits sur toute la journée', () => {
    const refs = [
      { id: 'd1', weapons: [Weapon.FOIL] },
      { id: 'd2', weapons: [] },
      { id: 'd3', weapons: [Weapon.FOIL] },
    ];
    const weapons = { c1: Weapon.FOIL, c2: Weapon.FOIL, c3: Weapon.EPEE };
    const list = [
      a({ dayRefereeId: 'd1', competitionId: 'c1' }),
      a({ dayRefereeId: 'd1', competitionId: 'c2', strip: 5 }),
      a({ dayRefereeId: 'd2', competitionId: 'c3', strip: 2 }),
      a({ dayRefereeId: 'd2', competitionId: 'c3', strip: 3, kind: 'match' }),
      a({ dayRefereeId: 'd3', competitionId: 'c3' }),
    ];
    const conflicts = detectDayConflicts(refs, list, weapons);
    expect(conflicts.map(c => [c.dayRefereeId, c.kind])).toEqual([
      ['d1', 'multi_competition'],
      ['d2', 'multi_strip'],
      ['d3', 'weapon'],
    ]);
  });

  it('pas de conflit pour deux poules successives sur la même piste', () => {
    const list = [a({ number: 1 }), a({ number: 2 })];
    expect(detectDayConflicts([{ id: 'd1', weapons: [] }], list, { c1: Weapon.FOIL })).toEqual([]);
  });

  it('occupé ailleurs : ignore l’épreuve courante', () => {
    const list = [a({ competitionId: 'c1' }), a({ competitionId: 'c2', strip: 4 })];
    expect(busyElsewhere(list, 'c1', { r1: 'd1', r2: 'd2' })).toEqual({
      r1: [a({ competitionId: 'c2', strip: 4 })],
    });
    expect(busyElsewhere(list, 'c1', {})).toEqual({});
  });
});

describe('noms d’arbitres importés des épreuves (#1872)', () => {
  it('rapproche les homonymes sans accents, casse ni ordre', () => {
    expect(refereeNameKey('MARTIN  Anne')).toBe(refereeNameKey('anne Martin'));
    expect(refereeNameKey('Zoé Roux')).toBe(refereeNameKey('Zoe ROUX'));
    expect(refereeNameKey('Anne Martin')).not.toBe(refereeNameKey('Anne Martine'));
  });

  it('découpe « Prénom Nom » et « NOM Prénom »', () => {
    expect(splitRefereeName('Anne Martin')).toEqual({ firstName: 'Anne', lastName: 'Martin' });
    expect(splitRefereeName('MARTIN Anne')).toEqual({ firstName: 'Anne', lastName: 'MARTIN' });
    expect(splitRefereeName('Jean de La Tour')).toEqual({
      firstName: 'Jean',
      lastName: 'de La Tour',
    });
    expect(splitRefereeName('Solo')).toEqual({ firstName: '', lastName: 'Solo' });
  });
});
