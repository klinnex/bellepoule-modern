import { describe, it, expect } from 'vitest';
import { resolveCyranoCoords, resolveCyranoPhases } from './matchCoords';

const POOL = 'ecc0b9cc-2e60-4105-8582-4ec65a409902';
const base = { fencerA: { id: 'a' }, fencerB: { id: 'b' }, scoreA: 0, scoreB: 0 } as any;
const db = {
  getMatch: (id: string) =>
    id === 'c1-16-3' ? { round: 16, position: 3 } : id === 'pm7' ? { number: 7 } : null,
  getCompetitionPools: () => [{ id: POOL, name: 'Poule 3' }],
};

describe('resolveCyranoCoords (#1720)', () => {
  it('poule : numéro de la poule (pas le dernier segment de son UUID) et numéro du match', () => {
    expect(resolveCyranoCoords({ ...base, id: 'pm7', poolId: POOL }, 'c1', db)).toEqual({
      phase: 1,
      poulTab: '3',
      matchNum: 7,
    });
    // Numéro porté par le match lui-même
    expect(
      resolveCyranoCoords({ ...base, id: 'x', poolId: POOL, number: 4 }, 'c1', db).matchNum
    ).toBe(4);
  });

  it('tableau : A<taille> et position + 1, depuis l’id `<taille>-<position>`', () => {
    expect(resolveCyranoCoords({ ...base, id: '16-3', isTableau: true }, 'c1')).toEqual({
      phase: 2,
      poulTab: 'A16',
      matchNum: 4,
    });
  });

  it('tableau : tour et position lus en base (id composite) si l’id ne les porte pas', () => {
    const m = { ...base, id: '16-3', isTableau: true };
    expect(resolveCyranoCoords({ ...m, id: 'autre' }, 'c1', db)).toMatchObject({ poulTab: 'A' });
    expect(resolveCyranoCoords(m, 'c1', db)).toMatchObject({ poulTab: 'A16', matchNum: 4 });
  });

  it('base indisponible : valeurs par défaut, sans exception', () => {
    const broken = {
      getMatch: () => {
        throw new Error('Database not open');
      },
      getCompetitionPools: () => {
        throw new Error('Database not open');
      },
    };
    expect(resolveCyranoCoords({ ...base, id: 'pm', poolId: POOL }, 'c1', broken)).toEqual({
      phase: 1,
      poulTab: '1',
      matchNum: 1,
    });
  });

  it('Phase (spéc. § 3) : tour de poules en cours, tableau = dernier tour de poules + 1', () => {
    const rounds = (poolRounds: number, currentPoolRound?: number) => ({
      ...db,
      getCompetition: () => ({ settings: { poolRounds } }),
      getSessionState: () => (currentPoolRound ? { uiState: { currentPoolRound } } : null),
    });
    const pool = { ...base, id: 'pm7', poolId: POOL };
    const de = { ...base, id: '8-0', isTableau: true };
    // Deux tours de poules : 1er tour = 1, 2e tour = 2, tableau = 3
    expect(resolveCyranoCoords(pool, 'c1', rounds(2, 1)).phase).toBe(1);
    expect(resolveCyranoCoords(pool, 'c1', rounds(2, 2)).phase).toBe(2);
    expect(resolveCyranoCoords(de, 'c1', rounds(2, 2)).phase).toBe(3);
    // Un seul tour (défaut) : inchangé
    expect(resolveCyranoCoords(de, 'c1', rounds(1)).phase).toBe(2);
    expect(resolveCyranoCoords(de, 'c1', db).phase).toBe(2);
    // Sans tour de poules : le tableau est la phase 1
    expect(resolveCyranoPhases('c1', rounds(0))).toEqual({ pool: 1, tableau: 1 });
    // Tour en cours incohérent : borné au nombre de tours
    expect(resolveCyranoPhases('c1', rounds(2, 7))).toEqual({ pool: 2, tableau: 3 });
    // Lecture en échec : valeurs par défaut
    const broken = {
      ...db,
      getCompetition: () => {
        throw new Error('x');
      },
    };
    expect(resolveCyranoPhases('c1', broken)).toEqual({ pool: 1, tableau: 2 });
  });
});
