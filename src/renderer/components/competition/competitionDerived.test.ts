import { describe, expect, it } from 'vitest';
import { MatchStatus } from '../../../shared/types';
import type { Pool, PoolRanking } from '../../../shared/types';
import type { TableauMatch } from '../tableau/tableauTypes';
import { computeEffectiveTableauRanking, computeMatchProgress } from './competitionDerived';

const pool = (statuses: MatchStatus[]): Pool =>
  ({
    id: 'p',
    number: 1,
    fencers: [],
    matches: statuses.map((status, i) => ({ id: `m${i}`, status })),
  }) as unknown as Pool;

const rank = (id: string, gender: string, r: number): PoolRanking =>
  ({ fencer: { id, gender }, rank: r }) as unknown as PoolRanking;

const baseOptions = {
  isRapieres: false,
  rapieresTableauMode: undefined,
  poolWinnersOnly: false,
  customFormula: undefined,
  postPoolSplitCriteria: undefined,
  activeSplitGroup: null,
  splitOffCompetitionIds: undefined,
};

describe('computeMatchProgress', () => {
  it('renvoie null sans poule ni tableau', () => {
    expect(computeMatchProgress([], [])).toBeNull();
  });

  it('compte les matchs de poule terminés', () => {
    const pools = [pool([MatchStatus.FINISHED, MatchStatus.NOT_STARTED])];
    expect(computeMatchProgress(pools, [])).toEqual({ done: 1, total: 2, label: 'poules' });
  });

  it('retombe sur le tableau quand il n’y a pas de poule', () => {
    const matches = [
      { id: 'a', fencerA: {}, fencerB: {}, winner: {} },
      { id: 'b', fencerA: {}, fencerB: {}, winner: null },
      { id: 'c', fencerA: {}, fencerB: null, winner: null },
    ] as unknown as TableauMatch[];
    expect(computeMatchProgress([], matches)).toEqual({ done: 1, total: 2, label: 'tableau' });
  });
});

describe('computeEffectiveTableauRanking', () => {
  const ranking = [rank('a', 'M', 1), rank('b', 'F', 2), rank('c', 'M', 3)];

  it('garde le classement tel quel sans option', () => {
    expect(computeEffectiveTableauRanking(ranking, [], baseOptions)).toBe(ranking);
  });

  it('ne garde que le groupe actif et renumérote', () => {
    const result = computeEffectiveTableauRanking(ranking, [], {
      ...baseOptions,
      postPoolSplitCriteria: 'gender',
      activeSplitGroup: 'M',
    });
    expect(result.map(r => [r.fencer.id, r.rank])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });

  it('exclut les groupes déjà extraits dans une compétition séparée', () => {
    const result = computeEffectiveTableauRanking(ranking, [], {
      ...baseOptions,
      postPoolSplitCriteria: 'gender',
      splitOffCompetitionIds: { F: 'comp-f' },
    });
    expect(result.map(r => r.fencer.id)).toEqual(['a', 'c']);
  });
});
