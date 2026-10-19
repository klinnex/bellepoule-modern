import { describe, it, expect } from 'vitest';
import {
  arePoolsComplete,
  buildBouts,
  canLaunchNextWave,
  checkedInTeams,
  computeFinalRanking,
  computeOverallRanking,
  createTableau,
  defaultPoolCount,
  distributeTeams,
  filterRanking,
  isPlayable,
  isTableauComplete,
  rankTeams,
  resolveTableau,
  scheduleWaves,
  selectQualifiers,
  setTableauScore,
  withdrawnTeamIds,
} from './rapieresCalculations';
import { createRapieresState, RapieresLevel, RapieresState, RapieresTeam } from './rapieres.types';

const team = (id: string, level: RapieresLevel = 'beginner'): RapieresTeam => ({
  id,
  name: `Équipe ${id}`,
  level,
  fencers: [
    { firstName: 'A', lastName: `${id}1`, category: 'M20' },
    { firstName: 'B', lastName: `${id}2`, category: 'V1' },
  ],
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);

describe('Tournoi des rapières (#1118)', () => {
  describe('poules', () => {
    it('poules de 10 équipes au plus, tailles équilibrées', () => {
      expect(defaultPoolCount(10)).toBe(1);
      expect(defaultPoolCount(23)).toBe(3);
      const pools = distributeTeams(
        ids(23).map(id => team(id)),
        3
      );
      expect(pools.map(p => p.teamIds.length)).toEqual([8, 8, 7]);
    });

    it('regroupe les équipes de même niveau', () => {
      const teams = [
        team('e1', 'expert'),
        team('b1', 'beginner'),
        team('i1', 'intermediate'),
        team('b2', 'beginner'),
        team('e2', 'expert'),
        team('i2', 'intermediate'),
      ];
      expect(distributeTeams(teams, 3).map(p => p.teamIds)).toEqual([
        ['b1', 'b2'],
        ['i1', 'i2'],
        ['e1', 'e2'],
      ]);
    });
  });

  describe('vagues', () => {
    for (let n = 2; n <= 10; n++) {
      it(`${n} équipes : round-robin complet, toutes les équipes tirent à chaque vague`, () => {
        const teamIds = ids(n);
        const bouts = scheduleWaves(teamIds);
        // Chaque paire exactement une fois
        const keys = bouts.map(b => [b.teamAId, b.teamBId].sort().join('|'));
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.length).toBe((n * (n - 1)) / 2);

        const waves = Math.max(...bouts.map(b => b.wave));
        const doubled: string[] = [];
        for (let w = 1; w <= waves; w++) {
          const counts = new Map<string, number>();
          for (const b of bouts.filter(x => x.wave === w))
            for (const id of [b.teamAId, b.teamBId]) counts.set(id, (counts.get(id) ?? 0) + 1);
          for (const [id, c] of counts) {
            expect(c).toBeLessThanOrEqual(2);
            if (c === 2) doubled.push(id);
          }
          if (w < waves) {
            // Toutes les vagues sauf la dernière font tirer toutes les équipes
            expect(counts.size).toBe(n);
          }
        }
        // Une équipe ne tire deux fois qu'une seule fois sur l'ensemble des vagues
        expect(new Set(doubled).size).toBe(doubled.length);
        if (n % 2 === 0) expect(doubled).toEqual([]);
      });
    }

    it('vague suivante lancée seulement quand la précédente est saisie', () => {
      const state: RapieresState = { ...createRapieresState(), pools: [{ teamIds: ids(4) }] };
      state.bouts = buildBouts(state.pools);
      expect(canLaunchNextWave(state)).toBe(true);
      state.launchedWave = 1;
      expect(canLaunchNextWave(state)).toBe(false);
      for (const b of state.bouts.filter(x => x.wave === 1)) {
        b.scoreA = 5;
        b.scoreB = 2;
      }
      expect(canLaunchNextWave(state)).toBe(true);
    });
  });

  describe('classements', () => {
    it('règle FIE : V/M, indice, touches données ; ex æquo', () => {
      const stats = new Map([
        ['a', { matches: 2, victories: 1, touchesGiven: 8, touchesReceived: 6 }],
        ['b', { matches: 2, victories: 2, touchesGiven: 10, touchesReceived: 5 }],
        ['c', { matches: 2, victories: 1, touchesGiven: 9, touchesReceived: 7 }],
        ['d', { matches: 2, victories: 1, touchesGiven: 8, touchesReceived: 6 }],
      ]);
      expect(rankTeams(['a', 'b', 'c', 'd'], stats).map(r => [r.teamId, r.rank])).toEqual([
        ['b', 1],
        ['c', 2],
        ['a', 3],
        ['d', 3],
      ]);
    });

    it('filtres : niveau et catégorie d’âge (un rang par tireur)', () => {
      const teams = [team('x', 'expert'), team('y', 'beginner')];
      teams[1].fencers[1].category = 'M20';
      const ranked = [
        { teamId: 'x', rank: 1 },
        { teamId: 'y', rank: 2 },
      ];
      expect(filterRanking(ranked, teams, { kind: 'level', level: 'beginner' })).toEqual([
        { teamId: 'y', rank: 1 },
      ]);
      expect(filterRanking(ranked, teams, { kind: 'category', category: 'M20' })).toEqual([
        { teamId: 'x', fencerIndex: 0, rank: 1 },
        { teamId: 'y', fencerIndex: 0, rank: 2 },
        { teamId: 'y', fencerIndex: 1, rank: 2 },
      ]);
    });
  });

  describe('qualification et tableau', () => {
    const playPools = (poolSizes: number[]): RapieresState => {
      let n = 0;
      const pools = poolSizes.map(size => ({
        teamIds: Array.from({ length: size }, () => `t${++n}`),
      }));
      const state: RapieresState = {
        ...createRapieresState(),
        teams: pools.flatMap(p => p.teamIds).map(id => team(id)),
        pools,
      };
      state.bouts = buildBouts(pools);
      // Le plus petit numéro gagne toujours
      for (const b of state.bouts) {
        const aWins = Number(b.teamAId.slice(1)) < Number(b.teamBId.slice(1));
        b.scoreA = aWins ? 5 : 1;
        b.scoreB = aWins ? 1 : 5;
      }
      return state;
    };

    it('3 poules ou moins : 1ers et 2es qualifiés', () => {
      expect(selectQualifiers(playPools([4, 4, 4])).sort()).toEqual(
        ['t1', 't2', 't5', 't6', 't9', 't10'].sort()
      );
    });

    it('plus de 3 poules : seulement les 1ers', () => {
      expect(selectQualifiers(playPools([3, 3, 3, 3])).sort()).toEqual(
        ['t1', 't4', 't7', 't10'].sort()
      );
    });

    it('tableau : exempts, finale, match pour la 3e place, classement final', () => {
      const state = playPools([3, 3, 3]);
      const seeds = selectQualifiers(state); // 6 équipes → tableau de 8, 2 exempts
      let t = createTableau(seeds);
      expect(t.size).toBe(8);
      const first = resolveTableau(t).filter(m => m.round === 4);
      expect(first.filter(m => m.isBye)).toHaveLength(2);
      const win = (round: number) => {
        for (const m of resolveTableau(t).filter(
          x => x.round === round && x.teamAId && x.teamBId && !x.isBye
        ))
          t = setTableauScore(t, round, m.position, { scoreA: 10, scoreB: 4 });
      };
      win(4);
      win(2);
      expect(isTableauComplete(t)).toBe(false);
      win(1);
      win(0);
      expect(isTableauComplete(t)).toBe(true);
      const final = computeFinalRanking({ ...state, tableau: t });
      expect(final).toHaveLength(9);
      const finalMatch = resolveTableau(t).find(m => m.round === 1)!;
      expect(final[0].teamId).toBe(finalMatch.winnerId);
      expect(final[1].teamId).toBe(finalMatch.loserId);
      // Non qualifiées en fin de classement, ordre des poules
      const overall = computeOverallRanking(state).map(r => r.teamId);
      const notQualified = overall.filter(id => !seeds.includes(id));
      expect(final.slice(-3).map(r => r.teamId)).toEqual(notQualified);
    });

    it('modifier un score efface les tours suivants', () => {
      let t = createTableau(['a', 'b', 'c', 'd']);
      t = setTableauScore(t, 2, 0, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 2, 1, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 1, 0, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 0, 0, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 2, 0, { scoreA: 1, scoreB: 10 });
      expect(t.scores.map(s => s.round).sort()).toEqual([2, 2]);
    });
  });

  describe('pointage, abandon, forfait, exclusion', () => {
    it('seules les équipes pointées sont réparties ; statut absent = pointée', () => {
      const teams = [team('a'), { ...team('b'), status: 'not_checked_in' as const }, team('c')];
      teams.push({ ...team('d'), status: 'forfait' });
      expect(checkedInTeams(teams).map(t => t.id)).toEqual(['a', 'c']);
      expect([...withdrawnTeamIds(teams)]).toEqual(['d']);
    });

    it('équipe retirée : rencontres annulées, classée dernière, non qualifiée', () => {
      const state: RapieresState = {
        ...createRapieresState(),
        teams: ids(4).map(id => team(id)),
        pools: [{ teamIds: ids(4) }],
      };
      state.bouts = buildBouts(state.pools);
      for (const b of state.bouts) {
        const aWins = Number(b.teamAId.slice(1)) < Number(b.teamBId.slice(1));
        b.scoreA = aWins ? 5 : 1;
        b.scoreB = aWins ? 1 : 5;
      }
      state.teams[0].status = 'abandoned';
      const overall = computeOverallRanking(state);
      expect(overall.map(r => r.teamId)).toEqual(['t2', 't3', 't4', 't1']);
      // Rencontres contre t1 annulées : t2 n'a plus que 2 matchs
      expect(overall[0].stats.matches).toBe(2);
      expect(overall[3].rank).toBe(4);
      expect(selectQualifiers(state).sort()).toEqual(['t2', 't3']);
    });

    it('vague complète sans les rencontres annulées', () => {
      const state: RapieresState = {
        ...createRapieresState(),
        teams: ids(4).map(id => team(id)),
        pools: [{ teamIds: ids(4) }],
        launchedWave: 1,
      };
      state.bouts = buildBouts(state.pools);
      state.teams[0].status = 'excluded';
      for (const b of state.bouts.filter(
        x => x.wave === 1 && x.teamAId !== 't1' && x.teamBId !== 't1'
      )) {
        b.scoreA = 5;
        b.scoreB = 2;
      }
      expect(canLaunchNextWave(state)).toBe(true);
      expect(arePoolsComplete(state)).toBe(false);
    });

    it('tableau : adversaire retiré, qualification d’office', () => {
      const t = createTableau(['a', 'b', 'c', 'd']);
      const withdrawn = new Set(['d']);
      const semi = resolveTableau(t, withdrawn).find(m => m.round === 2 && m.teamBId === 'd')!;
      expect(semi).toMatchObject({ walkover: true, winnerId: semi.teamAId, loserId: 'd' });
      expect(resolveTableau(t, withdrawn).filter(isPlayable)).toHaveLength(1);
    });

    it('exclusion : classée dernière au classement final', () => {
      const state: RapieresState = {
        ...createRapieresState(),
        teams: ['a', 'b', 'c', 'd', 'e'].map(id => team(id)),
        pools: [{ teamIds: ['a', 'b', 'c', 'd', 'e'] }],
      };
      state.bouts = buildBouts(state.pools);
      for (const b of state.bouts) {
        const aWins = b.teamAId < b.teamBId;
        b.scoreA = aWins ? 5 : 1;
        b.scoreB = aWins ? 1 : 5;
      }
      let t = createTableau(['a', 'b', 'c', 'd']);
      t = setTableauScore(t, 2, 0, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 2, 1, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 1, 0, { scoreA: 10, scoreB: 2 });
      t = setTableauScore(t, 0, 0, { scoreA: 10, scoreB: 2 });
      state.tableau = t;
      state.teams[0].status = 'excluded';
      expect(computeFinalRanking(state).at(-1)!.teamId).toBe('a');
    });
  });
});
