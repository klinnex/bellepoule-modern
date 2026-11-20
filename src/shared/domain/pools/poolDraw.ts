/**
 * BellePoule Modern - Tirage des poules : fonction unique (#1979, lot 4)
 * Écran (PoolPrepView) et moteur (MCP, generate_pools) tirent par cette fonction. Avant le
 * lot 4, l'écran avait son propre tirage (critères ordonnés, nation, niveau) et le moteur
 * un tirage figé (club + région après le classement).
 * Licensed under GPL-3.0
 */
import { MatchStatus, type Fencer, type Match, type Pool } from '../../types';
import {
  distributeFencersGroupedByLevel,
  distributeFencersToPoolsSerpentine,
  type SeparationCriterionKey,
} from '../../utils/poolCalculations';
import { planPoolBouts, type PoolBoutOrderMode } from '../../utils/poolBoutOrder';

/** Critère de séparation, dans l'ordre de priorité ; « byRanking » = position du serpentin */
export type PoolSeparationKey = SeparationCriterionKey | 'byLevel' | 'byRanking';
export interface PoolSeparation {
  key: PoolSeparationKey;
  enabled: boolean;
}

/**
 * Défaut (BellePoule) : serpentin sur le classement, puis club et région résolus par
 * échanges dans le chapeau ; nation inactive.
 */
export const DEFAULT_POOL_SEPARATION: readonly PoolSeparation[] = [
  { key: 'byRanking', enabled: true },
  { key: 'byClub', enabled: true },
  { key: 'byRegion', enabled: true },
  { key: 'byNation', enabled: false },
];

const SEPARATION_KEYS: ReadonlySet<string> = new Set(['byClub', 'byRegion', 'byNation']);
const isSeparationKey = (k: PoolSeparationKey): k is SeparationCriterionKey =>
  SEPARATION_KEYS.has(k);

/** Critères de séparation actifs (hors classement et niveau), dans l'ordre */
export function activeSeparation(criteria: readonly PoolSeparation[]): SeparationCriterionKey[] {
  return criteria.filter(c => c.enabled).flatMap(c => (isSeparationKey(c.key) ? [c.key] : []));
}

/** Critères actifs placés avant / après le classement */
export function splitSeparation(criteria: readonly PoolSeparation[]): {
  above: SeparationCriterionKey[];
  below: SeparationCriterionKey[];
} {
  const r = criteria.findIndex(c => c.key === 'byRanking');
  if (r < 0) return { above: activeSeparation(criteria), below: [] };
  return {
    above: activeSeparation(criteria.slice(0, r)),
    below: activeSeparation(criteria.slice(r + 1)),
  };
}

export interface DrawPoolsOptions {
  poolCount: number;
  poolMaxScore: number;
  /** Critères ordonnés ; défaut DEFAULT_POOL_SEPARATION */
  separation?: readonly PoolSeparation[];
  /** Rang de niveau (rapières) : avec « byLevel » actif, niveaux regroupés par poule */
  levelRankOf?: (fencer: Fencer) => number;
  /** Répartition imposée (mode spécial) */
  customDistribution?: (fencers: Fencer[], poolCount: number) => Fencer[][];
  /** Ordre des matchs imposé (mode spécial) */
  customMatchOrder?: (poolFencers: Fencer[]) => [number, number][];
  /** Ordre des matchs : règlement FIE (défaut) ou rondes (#1964) */
  boutOrder?: PoolBoutOrderMode;
  /** Tour de poules (> 1 : identifiant de phase du tour) */
  round?: number;
  /** Identifiants, heure et tirage des positions injectés (domaine pur) */
  newId: () => string;
  now: () => Date;
  random: () => number;
}

/** Répartition des tireurs dans les poules, selon les critères */
export function distributePools(
  fencers: Fencer[],
  options: Pick<
    DrawPoolsOptions,
    'poolCount' | 'separation' | 'levelRankOf' | 'customDistribution' | 'random'
  >
): Fencer[][] {
  const separation = options.separation ?? DEFAULT_POOL_SEPARATION;
  const { poolCount, levelRankOf } = options;
  if (options.customDistribution) return options.customDistribution(fencers, poolCount);
  if (levelRankOf && separation.some(c => c.key === 'byLevel' && c.enabled)) {
    return distributeFencersGroupedByLevel(
      fencers,
      poolCount,
      levelRankOf,
      activeSeparation(separation).includes('byClub')
    );
  }
  const { above, below } = splitSeparation(separation);
  return distributeFencersToPoolsSerpentine(fencers, poolCount, above, below, options.random);
}

/** Numéros et ordre des matchs d'une poule (#1964) */
export function planPoolMatches(
  poolFencers: Fencer[],
  options: Pick<DrawPoolsOptions, 'separation' | 'customMatchOrder' | 'boutOrder'> & {
    keepPositions?: boolean;
  }
): { positions: Fencer[]; bouts: [number, number][] } {
  if (options.customMatchOrder) {
    return { positions: poolFencers, bouts: options.customMatchOrder(poolFencers) };
  }
  return planPoolBouts(
    poolFencers,
    activeSeparation(options.separation ?? DEFAULT_POOL_SEPARATION),
    {
      mode: options.boutOrder,
      keepPositions: options.keepPositions,
    }
  );
}

/** Poule complète (tireurs placés, matchs à tirer) à partir d'une répartition */
export function buildPool(
  drawn: Fencer[],
  index: number,
  options: DrawPoolsOptions & { keepPositions?: boolean }
): Pool {
  const now = options.now();
  const poolId = options.newId();
  const plan = planPoolMatches(drawn, options);
  const poolFencers = plan.positions;
  const matches: Match[] = plan.bouts.map(([a, b], matchIndex) => ({
    id: options.newId(),
    poolId,
    number: matchIndex + 1,
    fencerA: poolFencers[a - 1],
    fencerB: poolFencers[b - 1],
    scoreA: null,
    scoreB: null,
    maxScore: options.poolMaxScore,
    status: MatchStatus.NOT_STARTED,
    createdAt: now,
    updatedAt: now,
  }));
  const round = options.round ?? 1;
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
    createdAt: now,
    updatedAt: now,
  };
}

/** Tirage des poules : répartition puis numéros et ordre des matchs */
export function drawPools(fencers: Fencer[], options: DrawPoolsOptions): Pool[] {
  if (fencers.length === 0 || options.poolCount <= 0) return [];
  return distributePools(fencers, options).map((drawn, index) => buildPool(drawn, index, options));
}
