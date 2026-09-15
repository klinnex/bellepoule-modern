/**
 * Tests unitaires pour les calculs de poules
 * BellePoule Modern
 */

import { describe, it, expect } from 'vitest';
import {
  generatePoolMatchOrder,
  calculateFencerPoolStats,
  calculatePoolRanking,
  formatRatio,
  formatIndex,
} from './poolCalculations';
import { Fencer, FencerStatus, Match, MatchStatus, Pool, Score, Weapon, Gender } from '../types';

// ============================================================================
// Helper Functions for Tests
// ============================================================================

const createMockFencer = (id: string, ref: number, lastName: string): Fencer => ({
  id,
  ref,
  lastName,
  firstName: 'Test',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockMatch = (
  id: string,
  fencerA: Fencer,
  fencerB: Fencer,
  scoreA: number | null,
  scoreB: number | null,
  status: MatchStatus = MatchStatus.FINISHED
): Match => {
  const createScore = (value: number | null, isWinner: boolean = false): Score | null => {
    if (value === null) return null;
    return {
      value,
      isVictory: isWinner,
      isAbstention: false,
      isExclusion: false,
      isForfait: false,
    };
  };

  // Détermine qui est le vainqueur
  const isAWinner = scoreA !== null && scoreB !== null && scoreA > scoreB;

  return {
    id,
    number: 1,
    fencerA,
    fencerB,
    scoreA: createScore(scoreA, isAWinner),
    scoreB: createScore(scoreB, !isAWinner),
    maxScore: 5,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

// ============================================================================
// Tests pour generatePoolMatchOrder
// ============================================================================

describe('generatePoolMatchOrder', () => {
  it('should generate correct match order for pool of 3 fencers', () => {
    const order = generatePoolMatchOrder(3);
    expect(order).toHaveLength(3);
    expect(order).toEqual([
      [2, 3],
      [1, 3],
      [1, 2],
    ]);
  });

  it('should generate correct match order for pool of 4 fencers', () => {
    const order = generatePoolMatchOrder(4);
    expect(order).toHaveLength(6);
  });

  it('should generate correct match order for pool of 5 fencers', () => {
    const order = generatePoolMatchOrder(5);
    expect(order).toHaveLength(10);
  });

  it('should generate correct match order for pool of 6 fencers', () => {
    const order = generatePoolMatchOrder(6);
    expect(order).toHaveLength(15);
  });

  it('should generate correct match order for pool of 7 fencers', () => {
    const order = generatePoolMatchOrder(7);
    expect(order).toHaveLength(21);
  });

  it('should generate correct match order for pool of 8 fencers', () => {
    const order = generatePoolMatchOrder(8);
    expect(order).toHaveLength(28);
  });

  it('should generate correct count for non-standard pool sizes', () => {
    [9, 10].forEach(n => {
      const order = generatePoolMatchOrder(n);
      expect(order.length).toBe((n * (n - 1)) / 2);
    });
  });

  it('should not have duplicate matches', () => {
    [4, 6, 9, 10].forEach(n => {
      const order = generatePoolMatchOrder(n);
      const uniqueMatches = new Set(order.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
      expect(uniqueMatches.size).toBe(order.length);
    });
  });

  it('should not have consecutive bouts for same fencer (pools 5-10)', () => {
    // n=3 et n=4 : inévitable sur 1 piste (trop peu de tireurs)
    [5, 6, 7, 8, 9, 10].forEach(n => {
      const order = generatePoolMatchOrder(n);
      for (let i = 0; i < order.length - 1; i++) {
        const [a1, b1] = order[i];
        const [a2, b2] = order[i + 1];
        const hasConsecutive = a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2;
        expect(hasConsecutive).toBe(false);
      }
    });
  });

  it('should cover all fencer pairs exactly once (pools 2-10)', () => {
    for (let n = 2; n <= 10; n++) {
      const order = generatePoolMatchOrder(n);
      const pairs = new Set(order.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
      expect(pairs.size).toBe((n * (n - 1)) / 2);
      for (const [a, b] of order) {
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(n);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(n);
      }
    }
  });
});

// ============================================================================
// Tests pour calculateFencerPoolStats
// ============================================================================

describe('calculateFencerPoolStats', () => {
  const fencer1 = createMockFencer('f1', 1, 'FencerOne');
  const fencer2 = createMockFencer('f2', 2, 'FencerTwo');
  const fencer3 = createMockFencer('f3', 3, 'FencerThree');

  it('should calculate stats correctly for a winner', () => {
    const matches: Match[] = [
      createMockMatch('m1', fencer1, fencer2, 5, 3),
      createMockMatch('m2', fencer1, fencer3, 5, 2),
    ];

    const stats = calculateFencerPoolStats(fencer1, matches);

    expect(stats.victories).toBe(2);
    expect(stats.defeats).toBe(0);
    expect(stats.touchesScored).toBe(10);
    expect(stats.touchesReceived).toBe(5);
    expect(stats.index).toBe(5);
    expect(stats.matchesPlayed).toBe(2);
    expect(stats.victoryRatio).toBe(1);
    expect(stats.maxSingleMatchScore).toBe(5); // max(5, 5) = 5
  });

  it('should calculate stats correctly for a loser', () => {
    const matches: Match[] = [
      createMockMatch('m1', fencer1, fencer2, 5, 3),
      createMockMatch('m2', fencer1, fencer3, 2, 5),
    ];

    const stats = calculateFencerPoolStats(fencer2, matches);

    expect(stats.victories).toBe(0);
    expect(stats.defeats).toBe(1);
    expect(stats.touchesScored).toBe(3);
    expect(stats.touchesReceived).toBe(5);
    expect(stats.index).toBe(-2);
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.victoryRatio).toBe(0);
    expect(stats.maxSingleMatchScore).toBe(3);
  });

  it('should ignore unfinished matches', () => {
    const matches: Match[] = [
      createMockMatch('m1', fencer1, fencer2, 5, 3),
      createMockMatch('m2', fencer1, fencer3, null, null, MatchStatus.NOT_STARTED),
    ];

    const stats = calculateFencerPoolStats(fencer1, matches);

    expect(stats.matchesPlayed).toBe(1);
    expect(stats.victories).toBe(1);
  });

  it('should return zero stats when no matches played', () => {
    const matches: Match[] = [];
    const stats = calculateFencerPoolStats(fencer1, matches);

    expect(stats.victories).toBe(0);
    expect(stats.defeats).toBe(0);
    expect(stats.matchesPlayed).toBe(0);
    expect(stats.victoryRatio).toBe(0);
  });

  it("devrait annuler les matchs déjà disputés contre un tireur déclaré forfait", () => {
    // Règle : si un adversaire est FORFAIT, les points acquis lors de TOUS
    // ses matchs (même déjà joués) sont annulés pour les deux parties.
    const forfaitFencer = createMockFencer('ff', 99, 'Forfait');
    forfaitFencer.status = FencerStatus.FORFAIT;

    // Match already played before forfeit was declared — statut FORFAIT
    // maintenant propagé dans la référence fencer du match (comme handleFencerForfeit le fait)
    const matchVsFF: Match = {
      ...createMockMatch('m_ff', fencer1, forfaitFencer, 5, 2),
      fencerB: forfaitFencer, // statut FORFAIT dans la référence
    };

    const otherMatch = createMockMatch('m2', fencer1, fencer2, 5, 3);

    const stats = calculateFencerPoolStats(fencer1, [matchVsFF, otherMatch]);

    // Seul le match contre fencer2 doit compter
    expect(stats.matchesPlayed).toBe(1);
    expect(stats.victories).toBe(1);
    expect(stats.touchesScored).toBe(5);
    expect(stats.touchesReceived).toBe(3);
  });
});

// ============================================================================
// Tests pour calculatePoolRanking
// ============================================================================

describe('calculatePoolRanking', () => {
  it('should rank fencers by victory ratio', () => {
    const fencer1 = createMockFencer('f1', 1, 'Winner');
    const fencer2 = createMockFencer('f2', 2, 'Loser');

    const pool: Pool = {
      id: 'p1',
      number: 1,
      phaseId: 'ph1',
      fencers: [fencer1, fencer2],
      matches: [createMockMatch('m1', fencer1, fencer2, 5, 2)],
      referees: [],
      isComplete: true,
      hasError: false,
      ranking: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ranking = calculatePoolRanking(pool);

    expect(ranking).toHaveLength(2);
    expect(ranking[0].fencer.id).toBe(fencer1.id);
    expect(ranking[0].victories).toBe(1);
    expect(ranking[1].fencer.id).toBe(fencer2.id);
    expect(ranking[1].victories).toBe(0);
  });

  it('should rank by ratio, not absolute victories — same wins but different match counts', () => {
    // fencerA: 2 wins / 3 matches → ratio 0.667
    // fencerB: 2 wins / 2 matches → ratio 1.000
    // Same absolute victories, fencerB must rank first
    const fencerA = createMockFencer('fA', 1, 'TwoThree');
    const fencerB = createMockFencer('fB', 2, 'TwoTwo');
    const fencerC = createMockFencer('fC', 3, 'Helper1');
    const fencerD = createMockFencer('fD', 4, 'Helper2');

    // fencerA: beats C (m1), beats D (m2), loses to C (m3) → 2W/3M
    // fencerB: beats C (m4), beats D (m5)                  → 2W/2M
    const matches: Match[] = [
      createMockMatch('m1', fencerA, fencerC, 5, 2), // A beats C
      createMockMatch('m2', fencerA, fencerD, 5, 2), // A beats D
      createMockMatch('m3', fencerC, fencerA, 5, 2), // C beats A
      createMockMatch('m4', fencerB, fencerC, 5, 2), // B beats C
      createMockMatch('m5', fencerB, fencerD, 5, 2), // B beats D
    ];

    const pool: Pool = {
      id: 'p1',
      number: 1,
      phaseId: 'ph1',
      fencers: [fencerA, fencerB, fencerC, fencerD],
      matches,
      referees: [],
      isComplete: true,
      hasError: false,
      ranking: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ranking = calculatePoolRanking(pool);

    expect(ranking[0].fencer.id).toBe(fencerB.id); // ratio 1.000 (2V/2M)
    expect(ranking[0].ratio).toBeCloseTo(1.0);
    expect(ranking[1].fencer.id).toBe(fencerA.id); // ratio 0.667 (2V/3M)
    expect(ranking[1].ratio).toBeCloseTo(2 / 3);
  });

  it('should rank by indice (TD-TR) when V/M ratio is tied — règle officielle FIE/FFE', () => {
    // Round-robin à 3 : A vs B, A vs C, B vs C
    // A : bat B 5-1, perd vs C 4-5  → 1V/2M ratio=0.5, TD=9, TR=6, indice=+3
    // B : perd vs A 1-5, bat C 4-3  → 1V/2M ratio=0.5, TD=5, TR=8, indice=-3
    // C : bat A 5-4, perd vs B 3-4  → 1V/2M ratio=0.5, TD=8, TR=8, indice=0
    // → classement : A (indice=+3) > C (indice=0) > B (indice=-3)
    // (A précède C malgré la défaite face à C : l'indice prime sur la confrontation directe)
    const fA = createMockFencer('fA', 1, 'FencerA');
    const fB = createMockFencer('fB', 2, 'FencerB');
    const fC = createMockFencer('fC', 3, 'FencerC');

    const matches: Match[] = [
      createMockMatch('m1', fA, fB, 5, 1), // A beats B
      createMockMatch('m2', fC, fA, 5, 4), // C beats A
      createMockMatch('m3', fB, fC, 4, 3), // B beats C
    ];

    const pool: Pool = {
      id: 'p1',
      number: 1,
      phaseId: 'ph1',
      fencers: [fA, fB, fC],
      matches,
      referees: [],
      isComplete: true,
      hasError: false,
      ranking: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ranking = calculatePoolRanking(pool);

    expect(ranking[0].fencer.id).toBe(fA.id);
    expect(ranking[0].index).toBe(3);
    expect(ranking[1].fencer.id).toBe(fC.id);
    expect(ranking[1].index).toBe(0);
    expect(ranking[2].fencer.id).toBe(fB.id);
    expect(ranking[2].index).toBe(-3);
  });

  it('should rank active fencer first and append excluded/forfeit/abandoned at the end', () => {
    const fencer1 = createMockFencer('f1', 1, 'Active');
    const fencer2 = createMockFencer('f2', 2, 'Excluded');
    const fencer3 = createMockFencer('f3', 3, 'Forfeit');
    const fencer4 = createMockFencer('f4', 4, 'Abandoned');

    fencer2.status = FencerStatus.EXCLUDED;
    fencer3.status = FencerStatus.FORFAIT;
    fencer4.status = FencerStatus.ABANDONED;

    const pool: Pool = {
      id: 'p1',
      number: 1,
      phaseId: 'ph1',
      fencers: [fencer1, fencer2, fencer3, fencer4],
      matches: [],
      referees: [],
      isComplete: false,
      hasError: false,
      ranking: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ranking = calculatePoolRanking(pool);

    expect(ranking).toHaveLength(4);
    expect(ranking[0].fencer.id).toBe(fencer1.id); // tireur actif → rang 1
    expect(ranking.find(r => r.fencer.id === fencer2.id)).toBeDefined(); // exclu présent
    expect(ranking.find(r => r.fencer.id === fencer3.id)).toBeDefined(); // forfait présent
    expect(ranking.find(r => r.fencer.id === fencer4.id)).toBeDefined(); // abandon présent
  });
});

// ============================================================================
// Tests pour formatRatio
// ============================================================================

describe('formatRatio', () => {
  it('should format perfect ratio', () => {
    expect(formatRatio(1)).toBe('1.000');
  });

  it('should format zero ratio', () => {
    expect(formatRatio(0)).toBe('0.000');
  });

  it('should format ratio with 3 decimal places', () => {
    expect(formatRatio(0.5)).toBe('0.500');
    expect(formatRatio(0.333)).toBe('0.333');
    expect(formatRatio(0.6667)).toBe('0.667');
  });
});

// ============================================================================
// Tests pour formatIndex
// ============================================================================

describe('formatIndex', () => {
  it('should format positive index', () => {
    expect(formatIndex(5)).toBe('+5');
    expect(formatIndex(10)).toBe('+10');
  });

  it('should format negative index', () => {
    expect(formatIndex(-5)).toBe('-5');
    expect(formatIndex(-10)).toBe('-10');
  });

  it('should format zero index', () => {
    expect(formatIndex(0)).toBe('+0');
  });
});
