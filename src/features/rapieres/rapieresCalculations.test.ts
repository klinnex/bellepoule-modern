import { describe, it, expect } from 'vitest';
import { Fencer, FencerStatus, Gender, Match, MatchStatus, Pool } from '../../shared/types';
import {
  canLaunchNextWave,
  distributeByLevel,
  filterRanking,
  filterRapieresQualifiers,
  isWaveComplete,
  mergeFinalRanking,
  poolMatchWaves,
  qualifiersPerPool,
  scheduleWaves,
  teamMembersLabel,
  waveCount,
  waveMatchIds,
  waveMatchOrder,
  waveSheetMatches,
} from './rapieresCalculations';
import { calculateOverallRanking } from '../../shared/utils/poolCalculations';
import { RapieresLevel, RapieresTeamInfo } from './rapieres.types';

const fencer = (id: string, status = FencerStatus.CHECKED_IN): Fencer =>
  ({
    id,
    ref: 0,
    lastName: `Équipe ${id}`,
    firstName: '',
    gender: Gender.MIXED,
    nationality: 'FRA',
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Fencer;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

/** Poule générée comme en préparation : ordre des matchs suivant les vagues */
const makePool = (fencers: Fencer[], number = 1): Pool => {
  const poolId = `p${number}`;
  const matches: Match[] = waveMatchOrder(fencers).map(([a, b], i) => ({
    id: `${poolId}-m${i + 1}`,
    number: i + 1,
    fencerA: fencers[a - 1],
    fencerB: fencers[b - 1],
    scoreA: null,
    scoreB: null,
    maxScore: 5,
    status: MatchStatus.NOT_STARTED,
    poolId,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  return {
    id: poolId,
    number,
    phaseId: 'phase-pools',
    fencers,
    matches,
    referees: [],
    isComplete: false,
    hasError: false,
    ranking: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Pool;
};

/** Le plus petit numéro gagne toujours */
const play = (pool: Pool, filter: (m: Match) => boolean = () => true) => {
  for (const m of pool.matches.filter(filter)) {
    const aWins = Number(m.fencerA!.id.slice(1)) < Number(m.fencerB!.id.slice(1));
    m.scoreA = { value: aWins ? 5 : 1, isVictory: aWins } as Match['scoreA'];
    m.scoreB = { value: aWins ? 1 : 5, isVictory: !aWins } as Match['scoreB'];
    m.status = MatchStatus.FINISHED;
  }
};

describe('Tournoi des rapières (#1118)', () => {
  it('libellé des tireurs de l’équipe', () => {
    expect(
      teamMembersLabel([
        { lastName: 'Dupont', firstName: 'A', category: 'M20' },
        { lastName: 'Martin', firstName: 'B', category: 'V1' },
      ])
    ).toBe('DUPONT / MARTIN');
  });

  describe('répartition', () => {
    it('regroupe par niveau, tailles équilibrées', () => {
      const levels: Record<string, RapieresLevel> = {
        e1: 'expert',
        b1: 'beginner',
        i1: 'intermediate',
        b2: 'beginner',
        e2: 'expert',
        i2: 'intermediate',
      };
      const pools = distributeByLevel(
        Object.keys(levels).map(id => fencer(id)),
        3,
        id => levels[id]
      );
      expect(pools.map(p => p.map(f => f.id))).toEqual([
        ['b1', 'b2'],
        ['i1', 'i2'],
        ['e1', 'e2'],
      ]);
      expect(
        distributeByLevel(
          ids(23).map(id => fencer(id)),
          3,
          () => 'beginner'
        ).map(p => p.length)
      ).toEqual([8, 8, 7]);
    });
  });

  describe('vagues', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 9, 10]) {
      it(`${n} équipes : round-robin complet, toutes les équipes tirent à chaque vague`, () => {
        const teams = ids(n);
        const bouts = scheduleWaves(teams);
        expect(bouts).toHaveLength((n * (n - 1)) / 2);
        const pairs = new Set(bouts.map(b => [b.teamAId, b.teamBId].sort().join('|')));
        expect(pairs.size).toBe(bouts.length);
        const doubled: string[] = [];
        const waves = Math.max(...bouts.map(b => b.wave));
        for (let w = 1; w <= waves; w++) {
          const counts = new Map<string, number>();
          for (const b of bouts.filter(x => x.wave === w))
            for (const id of [b.teamAId, b.teamBId]) counts.set(id, (counts.get(id) ?? 0) + 1);
          for (const [id, c] of counts) if (c === 2) doubled.push(id);
          if (w < waves) expect(counts.size).toBe(n);
        }
        // Une équipe ne tire jamais deux fois dans deux vagues différentes
        expect(new Set(doubled).size).toBe(doubled.length);
      });
    }

    it('ordre des matchs de la poule suivant les vagues', () => {
      const pool = makePool(ids(4).map(id => fencer(id)));
      const waves = poolMatchWaves(pool);
      const order = pool.matches.map(m => waves.get(m.id));
      expect(order).toEqual([...order].sort());
      expect(waveCount([pool])).toBe(3);
      expect(waveMatchIds([pool], 1).size).toBe(2);
    });

    it('vague suivante lancée seulement quand la précédente est saisie', () => {
      const pool = makePool(ids(4).map(id => fencer(id)));
      expect(canLaunchNextWave([pool], 0)).toBe(true);
      expect(canLaunchNextWave([pool], 1)).toBe(false);
      const wave1 = waveMatchIds([pool], 1);
      play(pool, m => wave1.has(m.id));
      expect(isWaveComplete([pool], 1)).toBe(true);
      expect(canLaunchNextWave([pool], 1)).toBe(true);
      expect(canLaunchNextWave([pool], 3)).toBe(false);
    });

    it('équipe retirée : ses matchs ne bloquent pas la vague', () => {
      const fencers = ids(4).map(id => fencer(id));
      const pool = makePool(fencers);
      fencers[0].status = FencerStatus.ABANDONED;
      const wave1 = waveMatchIds([pool], 1);
      play(pool, m => wave1.has(m.id) && m.fencerA!.id !== 't1' && m.fencerB!.id !== 't1');
      expect(isWaveComplete([pool], 1)).toBe(true);
    });
  });

  describe('feuilles de la vague active', () => {
    it('ne contient que les matchs de la vague, triés par poule', () => {
      const poolB = makePool(
        ids(4).map(id => fencer(`b${id}`)),
        2
      );
      const poolA = makePool(
        ids(4).map(id => fencer(`a${id}`)),
        1
      );
      const sheets = waveSheetMatches([poolB, poolA], 1);
      expect(sheets).toHaveLength(4);
      expect(sheets.map(m => m.label)).toEqual([
        'Vague 1 — Poule 1',
        'Vague 1 — Poule 1',
        'Vague 1 — Poule 2',
        'Vague 1 — Poule 2',
      ]);
      const wave1 = new Set([...waveMatchIds([poolA], 1), ...waveMatchIds([poolB], 1)]);
      expect(sheets.every(m => wave1.has(m.id))).toBe(true);
      expect(sheets.every(m => !m.isBye && m.scoreA === null && m.winner === null)).toBe(true);
    });

    it('vague 0 ou inexistante : aucune feuille', () => {
      const pool = makePool(ids(4).map(id => fencer(id)));
      expect(waveSheetMatches([pool], 0)).toEqual([]);
      expect(waveSheetMatches([pool], 9)).toEqual([]);
    });

    it('exclut les matchs annulés et ceux d’une équipe retirée', () => {
      const fencers = ids(4).map(id => fencer(id));
      const pool = makePool(fencers);
      const wave1 = [...waveMatchIds([pool], 1)];
      pool.matches.find(m => m.id === wave1[0])!.status = MatchStatus.CANCELLED;
      expect(waveSheetMatches([pool], 1)).toHaveLength(1);
      fencers.forEach(f => (f.status = FencerStatus.FORFAIT));
      expect(waveSheetMatches([pool], 1)).toHaveLength(0);
    });

    it('reprend la piste de la poule', () => {
      const pool = makePool(ids(4).map(id => fencer(id)));
      pool.strip = 3;
      expect(waveSheetMatches([pool], 1).every(m => m.arena === 3)).toBe(true);
    });
  });

  describe('qualification', () => {
    it('3 poules ou moins : 1ers et 2es ; au-delà : 1ers', () => {
      expect(qualifiersPerPool(3)).toBe(2);
      expect(qualifiersPerPool(4)).toBe(1);
      const pools = [0, 1, 2].map(p =>
        makePool(
          [1, 2, 3, 4].map(i => fencer(`t${p * 4 + i}`)),
          p + 1
        )
      );
      pools.forEach(p => play(p));
      const qualified = filterRapieresQualifiers(pools, calculateOverallRanking(pools));
      expect(qualified.map(r => r.fencer.id).sort()).toEqual(
        ['t1', 't2', 't5', 't6', 't9', 't10'].sort()
      );
      expect(qualified.map(r => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('classements', () => {
    const teams: Record<string, RapieresTeamInfo> = {
      x: {
        level: 'expert',
        fencers: [
          { firstName: 'A', lastName: 'x1', category: 'M20' },
          { firstName: 'B', lastName: 'x2', category: 'V1' },
        ],
      },
      y: {
        level: 'beginner',
        fencers: [
          { firstName: 'A', lastName: 'y1', category: 'M20' },
          { firstName: 'B', lastName: 'y2', category: 'M20' },
        ],
      },
    };
    const ranked = [
      { teamId: 'x', rank: 1 },
      { teamId: 'y', rank: 2 },
    ];

    it('filtres : niveau et catégorie d’âge (un rang par tireur)', () => {
      expect(filterRanking(ranked, teams, { kind: 'level', level: 'beginner' })).toEqual([
        { teamId: 'y', rank: 1 },
      ]);
      expect(filterRanking(ranked, teams, { kind: 'category', category: 'M20' })).toEqual([
        { teamId: 'x', fencerIndex: 0, rank: 1 },
        { teamId: 'y', fencerIndex: 0, rank: 2 },
        { teamId: 'y', fencerIndex: 1, rank: 2 },
      ]);
    });

    it('final : tableau, puis non qualifiées, exclues en dernier', () => {
      const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(id => fencer(id));
      d.status = FencerStatus.EXCLUDED;
      const overall = [a, b, c, d].map((f, i) => ({ fencer: f, rank: i + 1 }) as never);
      expect(
        mergeFinalRanking(
          [
            { fencer: b, rank: 1 },
            { fencer: d, rank: 2 },
            { fencer: a, rank: 3 },
          ],
          overall
        )
      ).toEqual([
        { teamId: 'b', rank: 1 },
        { teamId: 'a', rank: 2 },
        { teamId: 'c', rank: 3 },
        { teamId: 'd', rank: 4 },
      ]);
    });
  });
});
