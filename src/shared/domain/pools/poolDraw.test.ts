import { describe, expect, it } from 'vitest';
import { Gender, FencerStatus, type Fencer } from '../../types';
import { DEFAULT_POOL_SEPARATION, drawPools, splitSeparation } from './poolDraw';
import { buildPools } from '../../utils/poolOrchestration';

const fencer = (i: number, club: string, nationality = 'FRA'): Fencer =>
  ({
    id: `f${i}`,
    ref: i,
    lastName: `N${i}`,
    firstName: 'P',
    club,
    nationality,
    gender: Gender.MALE,
    ranking: i,
    status: FencerStatus.CHECKED_IN,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }) as Fencer;

let n = 0;
const ids = () => `id${++n}`;
const fixed = () => new Date(0);
/** Tirage des positions reproductible */
const seeded = () => {
  let x = 0;
  return () => (x = (x * 9301 + 49297) % 233280) / 233280;
};

describe('tirage des poules : fonction unique (#1979, lot 4)', () => {
  const fencers = Array.from({ length: 14 }, (_, i) => fencer(i + 1, ['A', 'B', 'C'][i % 3]));

  it('défaut : classement puis club et région dans le chapeau', () => {
    expect(splitSeparation(DEFAULT_POOL_SEPARATION)).toEqual({
      above: [],
      below: ['byClub', 'byRegion'],
    });
  });

  it('buildPools (MCP) et drawPools (écran) donnent le même tirage par défaut', () => {
    n = 0;
    const screen = drawPools(fencers, {
      poolCount: 2,
      poolMaxScore: 5,
      newId: ids,
      now: fixed,
      random: seeded(),
    });
    n = 0;
    const engine = buildPools(fencers, {
      poolCount: 2,
      poolMaxScore: 5,
      newId: ids,
      now: fixed,
      random: seeded(),
    });
    expect(engine).toEqual(screen);
  });

  it('critères de l’écran transmis au MCP : même résultat', () => {
    const separation = [
      { key: 'byNation' as const, enabled: true },
      { key: 'byRanking' as const, enabled: true },
      { key: 'byClub' as const, enabled: false },
    ];
    n = 0;
    const screen = drawPools(fencers, {
      poolCount: 3,
      poolMaxScore: 5,
      separation,
      newId: ids,
      now: fixed,
      random: seeded(),
    });
    n = 0;
    const engine = buildPools(fencers, {
      poolCount: 3,
      poolMaxScore: 5,
      separation,
      newId: ids,
      now: fixed,
      random: seeded(),
    });
    expect(engine).toEqual(screen);
    expect(splitSeparation(separation)).toEqual({ above: ['byNation'], below: [] });
  });

  it('ni tireur ni poule : aucun tirage', () => {
    expect(
      drawPools([], { poolCount: 2, poolMaxScore: 5, newId: ids, now: fixed, random: seeded() })
    ).toEqual([]);
  });
});
