/**
 * BellePoule Modern - Simulateur de tournoi
 * Joue automatiquement une compétition complète (poules → tableau → classement)
 * avec des scores aléatoires valides. Déterministe pour une graine donnée.
 *
 * Usages : test de non-régression bout-en-bout, benchmarks, données de démo.
 * Licensed under GPL-3.0
 */

import {
  DirectEliminationTable,
  Fencer,
  FencerStatus,
  Gender,
  Match,
  MatchStatus,
  Pool,
  PoolRanking,
  Score,
  TableRanking,
} from '../types';
import {
  calculateOptimalPoolCount,
  calculateOverallRanking,
  calculatePoolRanking,
  distributeFencersToPoolsSerpentine,
  generatePoolMatchOrder,
} from './poolCalculations';
import {
  calculateTableRanking,
  createDirectEliminationTable,
  updateTableAfterMatch,
} from './tableCalculations';

export interface SimulationOptions {
  fencerCount: number;
  /** Graine du générateur pseudo-aléatoire (mêmes options → même tournoi). */
  seed?: number;
  poolMaxScore?: number;
  tableMaxScore?: number;
  /** Nombre de clubs (séparation par club lors de la répartition). */
  clubCount?: number;
  /** Bornes de taille de poule (calculateOptimalPoolCount). */
  minPoolSize?: number;
  maxPoolSize?: number;
}

export interface SimulationResult {
  fencers: Fencer[];
  pools: Pool[];
  overallRanking: PoolRanking[];
  table: DirectEliminationTable;
  tableRanking: TableRanking[];
  poolMatchCount: number;
  tableMatchCount: number;
}

/** PRNG mulberry32 : rapide, déterministe, suffisant pour la simulation. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function makeScore(value: number, isVictory: boolean): Score {
  return { value, isVictory, isAbstention: false, isExclusion: false, isForfait: false };
}

/**
 * Joue un match : le mieux classé (ranking plus petit) gagne plus souvent.
 * Vainqueur à maxScore, perdant entre 0 et maxScore - 1.
 */
function playMatch(match: Match, rng: () => number): Fencer {
  const a = match.fencerA as Fencer;
  const b = match.fencerB as Fencer;
  const ra = a.ranking ?? 999;
  const rb = b.ranking ?? 999;
  const pA = rb / (ra + rb);
  const aWins = rng() < pA;
  const loserScore = Math.floor(rng() * match.maxScore);
  match.scoreA = makeScore(aWins ? match.maxScore : loserScore, aWins);
  match.scoreB = makeScore(aWins ? loserScore : match.maxScore, !aWins);
  match.status = MatchStatus.FINISHED;
  return aWins ? a : b;
}

export function generateFencers(count: number, clubCount: number, rng: () => number): Fencer[] {
  const now = new Date(0);
  // Classement initial indépendant du numéro de dossard
  const ranks = shuffle(
    Array.from({ length: count }, (_, i) => i + 1),
    rng
  );
  return ranks.map((ranking, i) => ({
    id: `sim-f${i + 1}`,
    ref: i + 1,
    lastName: `TIREUR${String(i + 1).padStart(3, '0')}`,
    firstName: 'Sim',
    gender: Gender.MALE,
    nationality: 'FRA',
    club: `Club ${(i % clubCount) + 1}`,
    ranking,
    status: FencerStatus.CHECKED_IN,
    createdAt: now,
    updatedAt: now,
  }));
}

function buildPool(number: number, fencers: Fencer[], maxScore: number): Pool {
  const now = new Date(0);
  const matches: Match[] = generatePoolMatchOrder(fencers.length).map(([i, j], k) => ({
    id: `sim-p${number}-m${k + 1}`,
    number: k + 1,
    fencerA: fencers[i - 1],
    fencerB: fencers[j - 1],
    scoreA: null,
    scoreB: null,
    maxScore,
    status: MatchStatus.NOT_STARTED,
    poolId: `sim-p${number}`,
    createdAt: now,
    updatedAt: now,
  }));
  return {
    id: `sim-p${number}`,
    number,
    phaseId: 'sim-phase-pools',
    fencers,
    matches,
    referees: [],
    isComplete: false,
    hasError: false,
    ranking: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Joue tous les matchs prêts du tableau jusqu'à la finale. */
function playTable(
  table: DirectEliminationTable,
  rng: () => number
): { table: DirectEliminationTable; played: number } {
  let current = table;
  let played = 0;
  for (;;) {
    const ready = current.nodes.find(
      n => n.match && n.match.status !== MatchStatus.FINISHED && n.fencerA && n.fencerB && !n.winner
    );
    if (!ready || !ready.match) break;
    const winner = playMatch(ready.match, rng);
    current = updateTableAfterMatch(current, ready.match.id, winner);
    played++;
  }
  return { table: current, played };
}

export function simulateTournament(options: SimulationOptions): SimulationResult {
  const {
    fencerCount,
    seed = 1,
    poolMaxScore = 5,
    tableMaxScore = 15,
    clubCount = Math.max(1, Math.ceil(fencerCount / 6)),
    minPoolSize = 5,
    maxPoolSize = 7,
  } = options;
  if (!Number.isInteger(fencerCount) || fencerCount < 4) {
    throw new RangeError(
      `simulateTournament: fencerCount doit être un entier ≥ 4 (reçu: ${fencerCount})`
    );
  }

  const rng = createRng(seed);
  const fencers = generateFencers(fencerCount, clubCount, rng);

  // --- Poules
  const poolCount = calculateOptimalPoolCount(fencerCount, minPoolSize, maxPoolSize);
  const distribution = distributeFencersToPoolsSerpentine(fencers, poolCount, ['byClub']);
  // Le tirage des positions dans la poule utilise Math.random : on le refait
  // avec le PRNG pour rester déterministe.
  const pools = distribution.map((poolFencers, i) =>
    buildPool(
      i + 1,
      shuffle(
        [...poolFencers].sort((a, b) => a.ref - b.ref),
        rng
      ),
      poolMaxScore
    )
  );
  let poolMatchCount = 0;
  for (const pool of pools) {
    for (const match of pool.matches) {
      playMatch(match, rng);
      poolMatchCount++;
    }
    pool.isComplete = true;
    pool.ranking = calculatePoolRanking(pool);
  }
  const overallRanking = calculateOverallRanking(pools);

  // --- Tableau : tous qualifiés, placés selon le classement général
  const seeded = overallRanking.map(r => ({
    ...r.fencer,
    poolStats: {
      victories: r.victories,
      defeats: r.defeats,
      touchesScored: r.touchesScored,
      touchesReceived: r.touchesReceived,
      index: r.index,
      matchesPlayed: r.matchesPlayed,
      victoryRatio: r.ratio,
      overallRank: r.rank,
    },
  }));
  const initialTable = createDirectEliminationTable(seeded, tableMaxScore);
  const { table, played } = playTable(initialTable, rng);

  return {
    fencers,
    pools,
    overallRanking,
    table,
    tableRanking: calculateTableRanking(table),
    poolMatchCount,
    tableMatchCount: played,
  };
}
