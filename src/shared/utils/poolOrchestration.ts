/**
 * BellePoule Modern - Orchestration des poules, fonctions pures (#1880, lot 3)
 * Source unique de l'écran (usePoolManagement) et de la couche domaine (MCP) :
 * tirage des poules, scores d'un match, classements.
 * Licensed under GPL-3.0
 */
import {
  FencerStatus,
  MatchStatus,
  type Fencer,
  type Match,
  type Pool,
  type PoolRanking,
  type Score,
} from '../types';
import {
  calculateOptimalPoolCount,
  calculateOverallRanking,
  calculateOverallRankingQuest,
  calculatePoolRanking,
  calculatePoolRankingQuest,
  distributeFencersToPoolsSerpentine,
  generatePoolMatchOrder,
} from './poolCalculations';
import { mergeRoundRankings } from './poolRounds';

export const MIN_FENCERS_FOR_POOLS = 4;

export interface BuildPoolsOptions {
  poolMaxScore: number;
  /** Tour de poules (> 1 : nouveau tirage d'un tour suivant) */
  round?: number;
  /** Nombre de poules imposé ; défaut : optimal entre minPerPool et maxPerPool */
  poolCount?: number;
  minPerPool?: number;
  maxPerPool?: number;
  newId: () => string;
  now?: () => Date;
}

/**
 * Tirage des poules : serpentin sur le classement, puis échanges dans le chapeau pour
 * séparer clubs et régions. Ordre des matchs selon la taille de la poule.
 */
export function buildPools(fencers: Fencer[], options: BuildPoolsOptions): Pool[] {
  if (fencers.length < MIN_FENCERS_FOR_POOLS) {
    throw new Error(
      `Il faut au moins ${MIN_FENCERS_FOR_POOLS} tireurs pointés pour créer les poules.`
    );
  }
  const round = options.round ?? 1;
  const now = options.now ?? (() => new Date());
  const poolCount =
    options.poolCount ??
    calculateOptimalPoolCount(fencers.length, options.minPerPool ?? 5, options.maxPerPool ?? 7);
  // Classement en rang 1 : club/région résolus par échanges dans le chapeau
  const distribution = distributeFencersToPoolsSerpentine(
    fencers,
    poolCount,
    [],
    ['byClub', 'byRegion']
  );
  return distribution.map((poolFencers, index) => {
    const poolId = options.newId();
    const matches: Match[] = generatePoolMatchOrder(poolFencers.length).map(
      ([a, b], matchIndex) => ({
        id: options.newId(),
        poolId,
        number: matchIndex + 1,
        fencerA: poolFencers[a - 1],
        fencerB: poolFencers[b - 1],
        scoreA: null,
        scoreB: null,
        maxScore: options.poolMaxScore,
        status: MatchStatus.NOT_STARTED,
        createdAt: now(),
        updatedAt: now(),
      })
    );
    return {
      id: poolId,
      number: index + 1,
      phaseId: round > 1 ? `phase-pools-r${round}` : 'phase-pools',
      fencers: poolFencers,
      matches,
      referees: [],
      isComplete: false,
      hasError: false,
      ranking: [],
      createdAt: now(),
      updatedAt: now(),
    };
  });
}

export type PoolSpecialStatus = 'abandon' | 'forfait' | 'exclusion';

/**
 * Scores d'un match de poule : vainqueur imposé, sinon plus haut score, sinon tireur
 * prioritaire en cas d'égalité (#1442). Le statut spécial s'applique au perdant.
 */
export function buildMatchScores(
  scoreA: number,
  scoreB: number,
  winnerOverride?: 'A' | 'B',
  specialStatus?: PoolSpecialStatus,
  priority?: 'A' | 'B'
): { scoreA: Score; scoreB: Score } {
  const priorityWins = !winnerOverride && scoreA === scoreB && !!priority;
  const isVictoryA =
    winnerOverride === 'A' ||
    (priorityWins ? priority === 'A' : !winnerOverride && scoreA > scoreB);
  const isVictoryB =
    winnerOverride === 'B' ||
    (priorityWins ? priority === 'B' : !winnerOverride && scoreB > scoreA);
  const specialOnA = !!specialStatus && !isVictoryA;
  const specialOnB = !!specialStatus && !specialOnA && !isVictoryB;
  const score = (value: number, isVictory: boolean, special: boolean, prio: boolean): Score => ({
    value,
    isVictory,
    isAbstention: special && specialStatus === 'abandon',
    isExclusion: special && specialStatus === 'exclusion',
    isForfait: special && specialStatus === 'forfait',
    ...(prio ? { isPriority: true } : {}),
  });
  return {
    scoreA: score(scoreA, isVictoryA, specialOnA, priorityWins && priority === 'A'),
    scoreB: score(scoreB, isVictoryB, specialOnB, priorityWins && priority === 'B'),
  };
}

export const computePoolRankingFor = (pool: Pool, isLaserSabre: boolean): PoolRanking[] =>
  isLaserSabre ? calculatePoolRankingQuest(pool) : calculatePoolRanking(pool);

export const computeOverallRankingFor = (pools: Pool[], isLaserSabre: boolean): PoolRanking[] =>
  isLaserSabre ? calculateOverallRankingQuest(pools) : calculateOverallRanking(pools);

/** Classement multi-tours (#1051) : dernier tour, puis éliminés des tours précédents */
export function computeOverallRankingAllRoundsFor(
  currentPools: Pool[],
  history: Pool[][],
  isLaserSabre: boolean
): PoolRanking[] {
  const rounds = [...history, currentPools].filter(r => r.length > 0);
  if (rounds.length <= 1) return computeOverallRankingFor(rounds[0] ?? [], isLaserSabre);
  return mergeRoundRankings(rounds.map(r => computeOverallRankingFor(r, isLaserSabre)));
}

/** Poule après saisie d'un score : match terminé, classement et complétude recalculés */
export function applyScoreToPool(
  pool: Pool,
  matchIndex: number,
  scores: { scoreA: Score; scoreB: Score },
  isLaserSabre: boolean,
  now: Date = new Date()
): Pool {
  const match: Match = {
    ...pool.matches[matchIndex],
    scoreA: scores.scoreA,
    scoreB: scores.scoreB,
    status: MatchStatus.FINISHED,
    updatedAt: now,
  };
  const updated: Pool = { ...pool, matches: [...pool.matches], updatedAt: now };
  updated.matches[matchIndex] = match;
  updated.ranking = computePoolRankingFor(updated, isLaserSabre);
  updated.isComplete = updated.matches.every(m => m.status === MatchStatus.FINISHED);
  return updated;
}

/**
 * Validation d'un score de poule, identique à la saisie de l'écran :
 * entiers ≥ 0, pas au-delà du score max, égalité tranchée (vainqueur ou priorité),
 * pas d'égalité au Sabre Laser. Renvoie un code d'erreur ou null.
 */
export function validatePoolScore(input: {
  scoreA: number;
  scoreB: number;
  maxScore: number;
  winner?: 'A' | 'B';
  priority?: 'A' | 'B';
  specialStatus?: PoolSpecialStatus;
  isLaserSabre: boolean;
  /** Départage par V / priorité autorisé (allowsVictoryTieBreak) */
  tieByVictory: boolean;
}): string | null {
  const { scoreA, scoreB, maxScore } = input;
  if (![scoreA, scoreB].every(s => Number.isInteger(s) && s >= 0)) return 'score_invalid';
  if (input.priority && !input.tieByVictory) return 'priority_not_allowed';
  // Score max 0 = illimité (comme l'écran)
  if (!input.specialStatus && maxScore > 0 && (scoreA > maxScore || scoreB > maxScore))
    return 'score_above_max';
  if (scoreA === scoreB && !input.winner && !input.specialStatus) {
    if (input.isLaserSabre) return 'draw_not_allowed';
    if (!input.priority) return 'draw_needs_winner';
  }
  if (input.winner && !input.specialStatus) {
    // Vainqueur imposé contraire au score : refusé (seul un statut spécial l'autorise)
    if ((input.winner === 'A' && scoreA < scoreB) || (input.winner === 'B' && scoreB < scoreA)) {
      return 'winner_contradicts_score';
    }
  }
  return null;
}

/** Vainqueur d'un match terminé (A, B) ou null */
export function matchWinner(m: Pick<Match, 'scoreA' | 'scoreB'>): Fencer | null {
  const match = m as Match;
  if (match.scoreA?.isVictory) return match.fencerA;
  if (match.scoreB?.isVictory) return match.fencerB;
  return null;
}

/**
 * Abandon, forfait ou exclusion d'un tireur en poule : statut propagé dans les poules,
 * matchs non disputés perdus (Sabre Laser hors exclusion : annulés, score null),
 * classements de poule recalculés. Source unique de l'écran et du domaine (#1880).
 */
export function applyFencerForfeit(
  pools: Pool[],
  fencerId: string,
  status: PoolSpecialStatus,
  isLaserSabre: boolean,
  now: Date = new Date()
): { pools: Pool[]; modifiedCount: number } {
  const newFencerStatus =
    status === 'abandon'
      ? FencerStatus.ABANDONED
      : status === 'forfait'
        ? FencerStatus.FORFAIT
        : FencerStatus.EXCLUDED;
  // Règle Sabre Laser : matchs disputés conservés, seuls les suivants sont annulés
  const laserForfeit = isLaserSabre && status !== 'exclusion';
  let modifiedCount = 0;
  const updated = pools.map(pool => {
    const hasFencer =
      pool.fencers.some(f => f.id === fencerId) ||
      pool.matches.some(m => m.fencerA?.id === fencerId || m.fencerB?.id === fencerId);
    if (!hasFencer) return pool;
    const newFencers = pool.fencers.map(f =>
      f.id === fencerId ? { ...f, status: newFencerStatus } : f
    );
    const newMatches = pool.matches.map(match => {
      const isFencerA = match.fencerA?.id === fencerId;
      const isFencerB = match.fencerB?.id === fencerId;
      if (!isFencerA && !isFencerB) return match;
      // Matchs déjà disputés conservés ; le statut propagé dans la référence du tireur
      // annule ces matchs pour les adversaires (calculateFencerPoolStats).
      // Sabre Laser (forfait/abandon) : le match en cours, saisi avec le statut, est conservé.
      const isAlreadyPlayed =
        match.status === MatchStatus.FINISHED &&
        (laserForfeit || (!match.scoreA?.isForfait && !match.scoreB?.isForfait));
      const newMatch = {
        ...match,
        fencerA:
          isFencerA && match.fencerA
            ? { ...match.fencerA, status: newFencerStatus }
            : match.fencerA,
        fencerB:
          isFencerB && match.fencerB
            ? { ...match.fencerB, status: newFencerStatus }
            : match.fencerB,
      };
      if (!isAlreadyPlayed) {
        // Sabre Laser : match annulé (score null) → ignoré par le classement
        const lost: Score = {
          value: laserForfeit ? null : 0,
          isVictory: false,
          isAbstention: status === 'abandon',
          isExclusion: status === 'exclusion',
          isForfait: status === 'forfait',
        };
        if (isFencerA) newMatch.scoreA = lost;
        else newMatch.scoreB = lost;
        newMatch.status = MatchStatus.FINISHED;
        newMatch.updatedAt = now;
        modifiedCount++;
      }
      return newMatch;
    });
    // Le statut du tireur change le classement même sans match restant à annuler
    const newPool: Pool = { ...pool, fencers: newFencers, matches: newMatches, updatedAt: now };
    newPool.ranking = computePoolRankingFor(newPool, isLaserSabre);
    return newPool;
  });
  return { pools: updated, modifiedCount };
}
