/**
 * BellePoule Modern - Moteur de classement pour formule personnalisée
 * Utilisé exclusivement pour l'arme CUSTOM — les armes standard (E/F/S/L)
 * continuent d'utiliser calculatePoolRanking / calculatePoolRankingQuest.
 */

import {
  AdvancementRule,
  CustomDEConfig,
  CustomFormulaConfig,
  CustomPoolRoundConfig,
  FormulaPhaseSimulation,
  FormulaSimulation,
  Match,
  MatchStatus,
  Pool,
  PoolRanking,
  RankingCriterion,
} from '../types';

import { FencerStatus } from '../types';
import { calculateFencerPoolStats } from './poolCalculations';

// ============================================================================
// Comparateur dynamique
// ============================================================================

function buildSingleCriterionComparator(
  criterion: RankingCriterion,
  directMatchMap: Map<string, Match>
): (a: PoolRanking, b: PoolRanking) => number {
  const sign = criterion.direction === 'desc' ? -1 : 1;

  switch (criterion.id) {
    case 'vm_ratio':
      return (a, b) => (a.ratio - b.ratio) * sign * -1; // desc par défaut = meilleur ratio d'abord
    case 'index':
      return (a, b) => (a.index - b.index) * sign * -1;
    case 'touches_scored':
      return (a, b) => (a.touchesScored - b.touchesScored) * sign * -1;
    case 'touches_received':
      // asc = moins on en reçoit mieux c'est
      return (a, b) => (a.touchesReceived - b.touchesReceived) * sign;
    case 'direct_bout': {
      return (a, b) => {
        const m = directMatchMap.get(`${a.fencer.id}:${b.fencer.id}`);
        if (!m) return 0;
        const aIsFirst = m.fencerA?.id === a.fencer.id;
        const aWon = aIsFirst ? m.scoreA?.isVictory : m.scoreB?.isVictory;
        return aWon ? -1 : 1;
      };
    }
    case 'initial_ranking':
      return (a, b) =>
        ((a.fencer.ranking ?? 9999) - (b.fencer.ranking ?? 9999)) * (sign < 0 ? -1 : 1);
    case 'custom_points':
      return (a, b) => ((a.questPoints ?? 0) - (b.questPoints ?? 0)) * sign * -1;
    default:
      return () => 0;
  }
}

export function buildRankingComparator(
  criteria: RankingCriterion[],
  directMatchMap: Map<string, Match>
): (a: PoolRanking, b: PoolRanking) => number {
  const activeCriteria = criteria.filter(c => c.enabled);
  const comparators = activeCriteria.map(c => buildSingleCriterionComparator(c, directMatchMap));

  return (a, b) => {
    for (const cmp of comparators) {
      const result = cmp(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

// ============================================================================
// Classement de poule avec critères custom
// ============================================================================

export function calculatePoolRankingCustom(
  pool: Pool,
  criteria: RankingCriterion[]
): PoolRanking[] {
  const rankings: PoolRanking[] = [];
  const forfeitFencers: PoolRanking[] = [];

  for (const fencer of pool.fencers) {
    if (
      fencer.status === FencerStatus.EXCLUDED ||
      fencer.status === FencerStatus.FORFAIT ||
      fencer.status === FencerStatus.ABANDONED
    ) {
      forfeitFencers.push({
        fencer,
        rank: 0,
        victories: 0,
        defeats: 0,
        matchesPlayed: 0,
        touchesScored: 0,
        touchesReceived: 0,
        index: 0,
        ratio: 0,
        questPoints: 0,
      });
      continue;
    }

    const stats = calculateFencerPoolStats(fencer, pool.matches);
    rankings.push({
      fencer,
      rank: 0,
      victories: stats.victories,
      defeats: stats.defeats,
      matchesPlayed: stats.matchesPlayed,
      touchesScored: stats.touchesScored,
      touchesReceived: stats.touchesReceived,
      index: stats.index,
      ratio: stats.victoryRatio,
      questPoints: 0,
    });
  }

  const directMatchMap = new Map<string, Match>();
  for (const m of pool.matches) {
    if (m.fencerA && m.fencerB && m.status === MatchStatus.FINISHED) {
      directMatchMap.set(`${m.fencerA.id}:${m.fencerB.id}`, m);
      directMatchMap.set(`${m.fencerB.id}:${m.fencerA.id}`, m);
    }
  }

  const comparator = buildRankingComparator(criteria, directMatchMap);
  rankings.sort(comparator);

  // Assigner les rangs
  rankings.forEach((r, i) => {
    r.rank = i + 1;
  });
  forfeitFencers.forEach((r, i) => {
    r.rank = rankings.length + i + 1;
  });

  return [...rankings, ...forfeitFencers];
}

export function calculateOverallRankingCustom(
  pools: Pool[],
  criteria: RankingCriterion[]
): PoolRanking[] {
  const allRankings: PoolRanking[] = [];

  for (const pool of pools) {
    const poolRankings = calculatePoolRankingCustom(pool, criteria);
    allRankings.push(...poolRankings);
  }

  // Construire la map de matchs directs inter-poules (vide — confrontation directe inter-poules impossible)
  const directMatchMap = new Map<string, Match>();
  const comparator = buildRankingComparator(criteria, directMatchMap);
  allRankings.sort(comparator);

  allRankings.forEach((r, i) => {
    (r as PoolRanking & { overallRank: number }).overallRank = i + 1;
  });

  return allRankings;
}

// ============================================================================
// Règle d'avancement
// ============================================================================

export function resolveAdvancement(
  ranking: PoolRanking[],
  rule: AdvancementRule
): { advanced: PoolRanking[]; eliminated: PoolRanking[] } {
  const eligible = ranking.filter(
    r =>
      r.fencer.status !== FencerStatus.EXCLUDED &&
      r.fencer.status !== FencerStatus.FORFAIT &&
      r.fencer.status !== FencerStatus.ABANDONED
  );

  let cutoff: number;

  switch (rule.mode) {
    case 'all':
      cutoff = eligible.length;
      break;
    case 'percentage':
      cutoff = Math.round(eligible.length * ((rule.percentage ?? 80) / 100));
      break;
    case 'fixed_count':
      cutoff = Math.min(rule.count ?? eligible.length, eligible.length);
      break;
    case 'fixed_bracket': {
      // Arrondir au prochain tableau inférieur ou égal
      const sizes = [2, 4, 8, 16, 32, 64, 128, 256];
      const target = rule.count ?? eligible.length;
      cutoff = sizes.filter(s => s <= target).pop() ?? 2;
      break;
    }
    case 'pool_winner':
      // Sans accès aux poules ici, utiliser count comme nombre de poules attendu
      cutoff = rule.count ?? eligible.length;
      break;
    default:
      cutoff = eligible.length;
  }

  const advanced = eligible.slice(0, cutoff);
  const eliminated = [
    ...eligible.slice(cutoff),
    ...ranking.filter(
      r =>
        r.fencer.status === FencerStatus.EXCLUDED ||
        r.fencer.status === FencerStatus.FORFAIT ||
        r.fencer.status === FencerStatus.ABANDONED
    ),
  ];

  return { advanced, eliminated };
}

// ============================================================================
// Simulation de formule (pure, sans effets de bord)
// ============================================================================

function calcPoolSizes(fencerCount: number, min: number, max: number): number[] {
  if (fencerCount <= 0) return [];
  const clampedMin = Math.max(2, min);
  const clampedMax = Math.max(clampedMin, max);

  // Chercher le nombre de poules optimal
  for (let poolCount = Math.ceil(fencerCount / clampedMax); poolCount <= fencerCount; poolCount++) {
    const base = Math.floor(fencerCount / poolCount);
    const remainder = fencerCount % poolCount;
    if (base >= clampedMin) {
      const sizes: number[] = [];
      for (let i = 0; i < poolCount; i++) {
        sizes.push(i < remainder ? base + 1 : base);
      }
      return sizes;
    }
  }
  return [fencerCount]; // fallback: une seule poule
}

function calcPoolMatchCount(poolSizes: number[]): number {
  return poolSizes.reduce((sum, size) => sum + (size * (size - 1)) / 2, 0);
}

function calcBracketSize(fencerCount: number, override?: number): number {
  if (override) return override;
  const sizes = [2, 4, 8, 16, 32, 64, 128, 256];
  return sizes.find(s => s >= fencerCount) ?? 256;
}

function calcAdvancingCount(
  eligible: number,
  rule: AdvancementRule,
  phases: FormulaPhaseSimulation[],
  phaseIndex: number
): number {
  switch (rule.mode) {
    case 'all':
      return eligible;
    case 'percentage':
      return Math.round(eligible * ((rule.percentage ?? 80) / 100));
    case 'fixed_count':
      return Math.min(rule.count ?? eligible, eligible);
    case 'fixed_bracket': {
      const sizes = [2, 4, 8, 16, 32, 64, 128, 256];
      const target = rule.count ?? eligible;
      // Trouver le prochain nœud DE pour savoir quelle taille tableau viser
      const nextDE = phases.slice(phaseIndex + 1).find(p => p.type === 'direct_elimination');
      if (nextDE?.bracketSize) return nextDE.bracketSize;
      return sizes.filter(s => s <= target).pop() ?? 2;
    }
    case 'pool_winner':
      return rule.count ?? eligible;
  }
}

function estimateMatchDuration(maxScore: number, timerSeconds: number): number {
  // Estimation : 60% du temps max par match
  const timerMinutes = timerSeconds / 60;
  if (maxScore <= 5) return Math.min(timerMinutes, 4);
  if (maxScore <= 10) return Math.min(timerMinutes, 8);
  return Math.min(timerMinutes, 12);
}

export function simulateFormula(
  fencerCount: number,
  formula: CustomFormulaConfig
): FormulaSimulation {
  const phases: FormulaPhaseSimulation[] = [];
  const warnings: string[] = [];
  let currentFencers = fencerCount;
  let totalMatches = 0;
  let totalMinutes = 0;

  for (let i = 0; i < formula.phases.length; i++) {
    const node = formula.phases[i];

    if (node.type === 'pool_round') {
      const cfg = node.config as CustomPoolRoundConfig;
      const poolSizes = calcPoolSizes(currentFencers, cfg.minPoolSize, cfg.maxPoolSize);
      const matchCount = calcPoolMatchCount(poolSizes);
      const minutesPerMatch = estimateMatchDuration(cfg.maxScore, cfg.timerSeconds);
      const phaseMinutes = matchCount * minutesPerMatch;

      if (poolSizes.some(s => s < 3)) {
        warnings.push(
          `Tour ${i + 1} : poule de ${Math.min(...poolSizes)} tireurs (min recommandé : 3)`
        );
      }

      const advancingCount = calcAdvancingCount(currentFencers, cfg.advancementRule, phases, i);

      phases.push({
        phaseIndex: i,
        type: 'pool_round',
        inputFencers: currentFencers,
        poolCount: poolSizes.length,
        poolSizes,
        matchCount,
        advancingFencers: advancingCount,
      });

      totalMatches += matchCount;
      totalMinutes += phaseMinutes;
      currentFencers = advancingCount;
    } else if (node.type === 'direct_elimination') {
      const cfg = node.config as CustomDEConfig;
      const bracketSize = calcBracketSize(currentFencers, cfg.bracketSizeOverride);
      const byes = bracketSize - currentFencers;

      if (byes > bracketSize / 2) {
        warnings.push(
          `DE : ${byes} exemptions sur ${bracketSize} — considérer un tableau plus petit`
        );
      }

      // Matchs réels = bracketSize - 1 (tournoi simple élimination) - byes
      const realMatchCount = bracketSize - 1 - byes;
      const minutesPerMatch = estimateMatchDuration(
        (node.config as CustomDEConfig).maxScore,
        (node.config as CustomDEConfig).timerSeconds
      );

      phases.push({
        phaseIndex: i,
        type: 'direct_elimination',
        inputFencers: currentFencers,
        bracketSize,
        matchCount: realMatchCount,
      });

      totalMatches += realMatchCount;
      totalMinutes += realMatchCount * minutesPerMatch;
    } else if (node.type === 'classification') {
      phases.push({
        phaseIndex: i,
        type: 'classification',
        inputFencers: currentFencers,
      });
    }
  }

  return {
    phases,
    totalMatches,
    estimatedDurationMinutes: Math.round(totalMinutes),
    warnings,
  };
}
