import { describe, it, expect } from 'vitest';
import { Competition, Fencer, FencerStatus, Gender, PoolRanking } from '../types';
import {
  defaultSplitCompetitionTitle,
  buildSplitCompetitionData,
  extractSplitGroupRanking,
  toSplitFencerData,
  remapRankingFencers,
} from './splitCompetition';
import { validateCompetitionData } from '../../database/validation';

const fencer = (id: string, gender: Gender, status = FencerStatus.QUALIFIED): Fencer =>
  ({
    id,
    ref: 1,
    lastName: `Nom${id}`,
    firstName: `Prenom${id}`,
    gender,
    nationality: 'FRA',
    club: 'Club',
    status,
    poolStats: {
      victories: 2,
      defeats: 1,
      touchesScored: 10,
      touchesReceived: 6,
      index: 4,
      matchesPlayed: 3,
      victoryRatio: 0.67,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Fencer;

const rank = (f: Fencer, r: number): PoolRanking => ({
  fencer: f,
  rank: r,
  victories: 2,
  defeats: 1,
  matchesPlayed: 3,
  touchesScored: 10,
  touchesReceived: 6,
  index: 4,
  ratio: 0.67,
  questPoints: 0,
});

describe('splitCompetition', () => {
  it('propose un titre par défaut', () => {
    expect(defaultSplitCompetitionTitle('Open', Gender.FEMALE)).toBe('Open – Dames');
  });

  it('copie les paramètres sans le mode couplé et lie la compétition source', () => {
    const source = {
      id: 'c1',
      title: 'Open',
      date: new Date('2026-10-01'),
      weapon: 'E',
      gender: Gender.MIXED,
      category: 'SEN',
      color: '#fff',
      settings: {
        postPoolSplitCriteria: 'gender',
        poolWinnersOnly: true,
        splitOffCompetitionIds: { F: 'x' },
        defaultTableMaxScore: 15,
      },
    } as unknown as Competition;
    const data = buildSplitCompetitionData(source, '  Open Dames ', Gender.FEMALE);
    expect(data.title).toBe('Open Dames');
    expect(data.gender).toBe(Gender.FEMALE);
    expect(data.settings).toEqual({
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 15,
      poolRounds: 1,
      defaultRanking: 0,
      minTeamSize: 3,
      splitFromCompetitionId: 'c1',
    });
    expect(() => validateCompetitionData(data)).not.toThrow();
  });

  it('borne le score de poule et normalise une date sérialisée', () => {
    const source = {
      id: 'c2',
      title: 'Open',
      date: '2026-10-01T00:00:00.000Z',
      weapon: 'E',
      gender: Gender.MIXED,
      category: 'SEN',
      color: '#3B82F6',
      settings: { defaultPoolMaxScore: 21 },
    } as unknown as Competition;
    const data = buildSplitCompetitionData(source, 'Open Dames', Gender.FEMALE);
    expect(data.date).toBeInstanceOf(Date);
    expect(data.settings?.defaultPoolMaxScore).toBe(15);
    expect(() => validateCompetitionData(data)).not.toThrow();
  });

  it('extrait et renumérote le classement du groupe', () => {
    const ranking = [
      rank(fencer('a', Gender.MALE), 1),
      rank(fencer('b', Gender.FEMALE), 2),
      rank(fencer('c', Gender.FEMALE), 3),
    ];
    const girls = extractSplitGroupRanking(ranking, Gender.FEMALE);
    expect(girls.map(r => [r.fencer.id, r.rank])).toEqual([
      ['b', 1],
      ['c', 2],
    ]);
    expect(extractSplitGroupRanking(ranking, Gender.MIXED)).toEqual([]);
  });

  it('prépare les données tireur avec le rang après poules et pointe les non-pointés', () => {
    const data = toSplitFencerData(
      rank(fencer('b', Gender.FEMALE, FencerStatus.NOT_CHECKED_IN), 4)
    );
    expect(data.ranking).toBe(4);
    expect(data.status).toBe(FencerStatus.CHECKED_IN);
    expect(
      toSplitFencerData(rank(fencer('d', Gender.FEMALE, FencerStatus.ABANDONED), 5)).status
    ).toBe(FencerStatus.ABANDONED);
  });

  it('remappe les tireurs en conservant les stats de poule', () => {
    const old = fencer('b', Gender.FEMALE);
    const created = { ...fencer('new-b', Gender.FEMALE), poolStats: undefined };
    const out = remapRankingFencers(
      [rank(old, 1), rank(fencer('z', Gender.FEMALE), 2)],
      new Map([['b', created]])
    );
    expect(out).toHaveLength(1);
    expect(out[0].fencer.id).toBe('new-b');
    expect(out[0].fencer.poolStats).toEqual(old.poolStats);
    expect(out[0].victories).toBe(2);
  });
});
