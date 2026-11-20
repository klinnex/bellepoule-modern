import { describe, it, expect } from 'vitest';
import { FencerStatus, PoolRanking, type Fencer } from '../../types';
import {
  buildTableauMatches,
  autoFillAllPositions,
  buildCombinedResults,
  calculateFinalResults,
  generateFIESeeding,
  tableauSeedRanks,
  mainTableauSize,
  planTableau,
} from './tableauCalculations';
import { generateSeedingChart } from '../../utils/tableCalculations';
import { TableauMatch } from './tableauTypes';

const mkRanking = (n: number): PoolRanking[] =>
  Array.from({ length: n }, (_, i) => ({
    fencer: { id: `f${i + 1}`, firstName: `F${i + 1}`, lastName: `L${i + 1}` } as any,
    rank: i + 1,
    victories: 0,
    defeats: 0,
    matchesPlayed: 0,
    touchesScored: 0,
    touchesReceived: 0,
    index: 0,
    ratio: 0,
  }));

describe('autoFillAllPositions', () => {
  // Régression : en mode « toutes les places », le remplissage auto doit couvrir
  // barrages, tableau principal ET tous les brackets de consolation.
  it.each([
    [8, 8],
    [16, 16],
    [13, 8],
    [37, 32],
  ])('%i tireurs (tableau de %i) : classement complet', (n, size) => {
    const ranking = mkRanking(n);
    const matches = buildTableauMatches(ranking, size, true, false);
    const { updatedMatches, updatedBrackets } = autoFillAllPositions(
      matches,
      [],
      15,
      size,
      ranking,
      { random: Math.random, now: 1 }
    );

    expect(updatedMatches.every(m => m.isBye || !!m.winner)).toBe(true);
    expect(updatedBrackets.every(b => b.isComplete)).toBe(true);

    const results = buildCombinedResults(updatedMatches, updatedBrackets, ranking);
    expect(results).toHaveLength(n);
    expect(new Set(results.map(r => r.rank)).size).toBe(n);
  });
});

describe('calculateFinalResults - abandon / forfait / exclusion (#1012)', () => {
  it('mentionne l’évènement entre parenthèses pour le tireur concerné', () => {
    const ranking = mkRanking(4);
    const [a, b, c, d] = ranking.map(r => r.fencer);
    const mk = (id: string, round: number, position: number, o: Partial<TableauMatch>) =>
      ({
        id,
        round,
        position,
        scoreA: null,
        scoreB: null,
        isBye: false,
        ...o,
      }) as TableauMatch;
    const matches: TableauMatch[] = [
      mk('4-0', 4, 0, {
        fencerA: a,
        fencerB: d,
        winner: a,
        specialStatus: { fencerId: d.id, status: 'forfait' },
      }),
      mk('4-1', 4, 1, { fencerA: b, fencerB: c, scoreA: 15, scoreB: 10, winner: b }),
      mk('2-0', 2, 0, {
        fencerA: a,
        fencerB: b,
        winner: b,
        specialStatus: { fencerId: a.id, status: 'abandon' },
      }),
    ];
    const results = calculateFinalResults(matches, ranking, 4);
    const by = (id: string) => results.find(r => r.fencer.id === id)!.eliminatedAt;
    expect(by(b.id)).toBe('Vainqueur');
    expect(by(a.id)).toBe('Finale (médical)');
    expect(by(d.id)).toMatch(/\(forfait\)$/);
    expect(by(c.id)).not.toMatch(/\(/);
  });
});

describe('calculateFinalResults - 3e place non jouée (#1864)', () => {
  const mk = (id: string, round: number, position: number, o: Partial<TableauMatch>) =>
    ({ id, round, position, scoreA: 15, scoreB: 10, isBye: false, ...o }) as TableauMatch;

  it('deux 3es ex æquo, pas de 4e, puis 5e', () => {
    const ranking = mkRanking(8);
    const [a, b, c, d, e, f, g, h] = ranking.map(r => r.fencer);
    const matches: TableauMatch[] = [
      mk('8-0', 8, 0, { fencerA: a, fencerB: h, winner: a }),
      mk('8-1', 8, 1, { fencerA: d, fencerB: e, winner: d }),
      mk('8-2', 8, 2, { fencerA: c, fencerB: f, winner: c }),
      mk('8-3', 8, 3, { fencerA: b, fencerB: g, winner: b }),
      mk('4-0', 4, 0, { fencerA: a, fencerB: d, winner: a }),
      mk('4-1', 4, 1, { fencerA: c, fencerB: b, winner: b }),
      mk('2-0', 2, 0, { fencerA: a, fencerB: b, winner: a }),
    ];
    const results = calculateFinalResults(matches, ranking, 8);
    const rank = (id: string) => results.find(r => r.fencer.id === id)!.rank;
    expect(rank(c.id)).toBe(3);
    expect(rank(d.id)).toBe(3);
    expect(results.some(r => r.rank === 4)).toBe(false);
    expect(results.filter(r => r.rank >= 5).map(r => r.rank)).toEqual([5, 6, 7, 8]);
  });

  it('petite finale jouée : 3e et 4e distincts', () => {
    const ranking = mkRanking(4);
    const [a, b, c, d] = ranking.map(r => r.fencer);
    const matches: TableauMatch[] = [
      mk('4-0', 4, 0, { fencerA: a, fencerB: d, winner: a }),
      mk('4-1', 4, 1, { fencerA: b, fencerB: c, winner: b }),
      mk('2-0', 2, 0, { fencerA: a, fencerB: b, winner: a }),
      mk('3-0', 3, 0, { fencerA: c, fencerB: d, winner: d }),
    ];
    const results = calculateFinalResults(matches, ranking, 4);
    expect(results.map(r => [r.fencer.id, r.rank])).toEqual([
      [a.id, 1],
      [b.id, 2],
      [d.id, 3],
      [c.id, 4],
    ]);
  });
});

describe('generateFIESeeding (#1080)', () => {
  it('tables en dur identiques à la construction FIE générique', () => {
    for (const size of [4, 8, 16, 32, 64, 128]) {
      expect(generateFIESeeding(size)).toEqual(generateSeedingChart(size));
    }
  });

  it('tableau de 256 seedé (1 et 2 ne se rencontrent qu’en finale)', () => {
    const seeding = generateFIESeeding(256);
    expect(seeding[0]).toBe(1);
    expect(seeding[1]).toBe(256);
    expect(seeding[255]).toBe(2);
    expect(new Set(seeding).size).toBe(256);
  });
});

describe('rangs figés au tirage du tableau (#1996)', () => {
  it('premier tour : rang de sortie de poules de chaque tireur', () => {
    const matches = buildTableauMatches(mkRanking(16), 16, false, false);
    const seeds = tableauSeedRanks(matches)!;
    expect(seeds.size).toBe(16);
    for (let i = 1; i <= 16; i++) expect(seeds.get(`f${i}`)).toBe(i);
    const first = matches.find(m => m.id === '16-0')!;
    expect([first.seedA, first.seedB]).toEqual([1, 16]);
  });

  it('barrages : rangs posés sur les matchs de barrage', () => {
    const matches = buildTableauMatches(mkRanking(10), 8, true, false);
    const seeds = tableauSeedRanks(matches)!;
    expect(seeds.size).toBe(10);
    expect(seeds.get('f10')).toBe(10);
  });

  it('tableau tiré avant l’enregistrement des rangs : aucun rang figé', () => {
    const legacy = buildTableauMatches(mkRanking(8), 8, false, false).map(
      ({ seedA: _a, seedB: _b, ...m }) => m
    );
    expect(tableauSeedRanks(legacy)).toBeNull();
  });
});

describe('planTableau : génération unique écran / moteur (#1979, lot 4e)', () => {
  const rank = (n: number, status = FencerStatus.QUALIFIED) =>
    Array.from({ length: n }, (_, i) => ({
      fencer: { id: `f${i}`, status } as Fencer,
      rank: n - i, // désordre volontaire : le plan trie par rang
    })) as unknown as PoolRanking[];

  it('qualifiés triés par rang, retirés et éliminés écartés', () => {
    const ranking = [...rank(10), ...rank(2, FencerStatus.ELIMINATED)];
    const plan = planTableau(ranking, { playAllPositions: false, thirdPlaceMatch: false });
    expect(plan.qualified).toHaveLength(10);
    expect(plan.qualified.map(r => r.rank)).toEqual(
      [...plan.qualified.map(r => r.rank)].sort((a, b) => a - b)
    );
    expect(plan.size).toBe(16);
  });

  it('« toutes les places » : plus grand tableau plein', () => {
    expect(mainTableauSize(10, true)).toBe(8);
    expect(mainTableauSize(10, false)).toBe(16);
    const plan = planTableau(rank(10), { playAllPositions: true, thirdPlaceMatch: true });
    expect(plan.size).toBe(8);
  });

  it('petite finale selon le réglage', () => {
    const avec = planTableau(rank(8), { playAllPositions: false, thirdPlaceMatch: true });
    const sans = planTableau(rank(8), { playAllPositions: false, thirdPlaceMatch: false });
    expect(avec.matches.some(m => m.round === 3)).toBe(true);
    expect(sans.matches.some(m => m.round === 3)).toBe(false);
  });
});
