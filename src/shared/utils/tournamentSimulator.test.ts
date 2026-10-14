import { describe, it, expect } from 'vitest';
import { MatchStatus } from '../types';
import { createRng, simulateTournament } from './tournamentSimulator';

describe('createRng', () => {
  it('est déterministe pour une graine donnée', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(seqA.every(x => x >= 0 && x < 1)).toBe(true);
  });
});

describe('simulateTournament', () => {
  it('joue un tournoi complet de 200 tireurs (poules → tableau → classement)', () => {
    const r = simulateTournament({ fencerCount: 200, seed: 7 });

    // Poules : tous les tireurs répartis une fois, tous les matchs joués
    const pooled = r.pools.flatMap(p => p.fencers.map(f => f.id));
    expect(new Set(pooled).size).toBe(200);
    expect(pooled).toHaveLength(200);
    for (const pool of r.pools) {
      expect(pool.fencers.length).toBeGreaterThanOrEqual(5);
      expect(pool.fencers.length).toBeLessThanOrEqual(7);
      const n = pool.fencers.length;
      expect(pool.matches).toHaveLength((n * (n - 1)) / 2);
      expect(pool.matches.every(m => m.status === MatchStatus.FINISHED)).toBe(true);
    }

    // Classement général : 200 tireurs, rangs croissants (ex aequo possibles), cohérent V/D
    expect(r.overallRanking).toHaveLength(200);
    r.overallRanking.forEach((x, i) => {
      expect(x.rank).toBeLessThanOrEqual(i + 1);
      if (i > 0) expect(x.rank).toBeGreaterThanOrEqual(r.overallRanking[i - 1].rank);
    });
    expect(r.overallRanking[0].rank).toBe(1);
    const victories = r.overallRanking.reduce((s, x) => s + x.victories, 0);
    const defeats = r.overallRanking.reduce((s, x) => s + x.defeats, 0);
    expect(victories).toBe(r.poolMatchCount);
    expect(defeats).toBe(r.poolMatchCount);

    // Tableau de 256 : 199 matchs pour départager 200 tireurs, tableau terminé
    expect(r.table.size).toBe(256);
    expect(r.table.isComplete).toBe(true);
    expect(r.tableMatchCount).toBe(199);

    // Classement final : 200 tireurs, un seul vainqueur, rangs distincts
    expect(r.tableRanking).toHaveLength(200);
    const ranks = r.tableRanking.map(x => x.rank);
    expect(ranks.filter(x => x === 1)).toHaveLength(1);
    expect(new Set(ranks).size).toBe(200);
    const final = r.table.nodes.find(n => n.round === 1);
    expect(r.tableRanking.find(x => x.rank === 1)?.fencer.id).toBe(final?.winner?.id);
  });

  it('est reproductible : même graine → même vainqueur', () => {
    const a = simulateTournament({ fencerCount: 40, seed: 3 });
    const b = simulateTournament({ fencerCount: 40, seed: 3 });
    expect(a.tableRanking.map(x => x.fencer.id)).toEqual(b.tableRanking.map(x => x.fencer.id));
  });

  it.each([4, 5, 13, 33, 64, 65])('tient pour %i tireurs', n => {
    const r = simulateTournament({ fencerCount: n, seed: n });
    expect(r.table.isComplete).toBe(true);
    expect(r.tableMatchCount).toBe(n - 1);
    expect(r.tableRanking).toHaveLength(n);
  });

  it('refuse moins de 4 tireurs', () => {
    expect(() => simulateTournament({ fencerCount: 3 })).toThrow(RangeError);
  });
});
