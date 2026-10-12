/**
 * BellePoule Modern - Tournament Flow Management
 * Intelligent scheduling system for tournament optimization
 * Licensed under GPL-3.0
 */

import { Competition, Pool, Match, MatchStatus } from '../types';

export interface Arena {
  id: string;
  name: string;
  available: boolean;
  usageCount?: number;
}

export interface ArenaSettings {
  maxConcurrentMatches: number;
  minRestTime: number; // minutes
  maxWaitTime: number; // minutes
  balanceStripUsage: boolean;
  optimizeFencerRest: boolean;
}

export interface ScheduledMatch {
  match: Match;
  arenaId: string;
  scheduledTime: Date;
  estimatedDuration: number; // minutes
  priority: number;
}

/** Créneau planifié sur une piste */
export type ScheduleSlot = Pick<ScheduledMatch, 'arenaId' | 'scheduledTime' | 'estimatedDuration'>;

/** Match de tableau (élimination directe) vu par le planning */
export interface TableauFlowMatch {
  id: string;
  round: number;
  position: number;
  fencerA: { id: string } | null;
  fencerB: { id: string } | null;
  winner: { id: string } | null;
  isBye: boolean;
}

export interface TableauScheduledSlot extends ScheduleSlot {
  matchId: string;
  ready: boolean; // deux adversaires connus
}

export interface TableauFlowResult {
  schedule: TableauScheduledSlot[];
  readyCount: number;
  waitingCount: number;
  estimatedFinishTime: Date;
  totalDuration: number; // ms
  maxConcurrent: number; // pistes réellement utiles
  arenaUtilization: Record<string, number>;
  recommendations: string[];
}

export interface FlowOptimizationResult {
  schedule: ScheduledMatch[];
  metrics: {
    averageWaitTime: number; // attente moyenne d'un tireur entre deux matchs (min)
    maxFencerWait: number; // plus longue attente d'un tireur entre deux matchs (min)
    fencersOverMaxWait: number; // tireurs dépassant config.maxWaitTime
    totalDuration: number;
    arenaUtilization: Record<string, number>;
    fencerRestViolations: number;
  };
}

export class TournamentFlowManager {
  private config: ArenaSettings;
  private historicalData: Map<string, number> = new Map(); // fencerId -> average match duration

  constructor(config: ArenaSettings) {
    this.config = config;
  }

  /**
   * Planning de la phase de poules.
   * Chaque poule tire sur une piste, dans l'ordre officiel de ses matchs (ordre
   * réglementaire selon la taille de la poule, jamais modifié — #1018). Quand il
   * y a moins de pistes que de poules, une poule démarre sur la première piste libérée.
   */
  async optimizeTournamentFlow(
    competition: Competition,
    pools: Pool[],
    arenas: Arena[],
    currentTime: Date = new Date()
  ): Promise<FlowOptimizationResult> {
    const availableArenas = arenas.filter(arena => arena.available);
    const schedule = this.createPoolSchedule(pools, availableArenas, currentTime);

    return {
      schedule,
      metrics: this.calculateScheduleMetrics(schedule, availableArenas, pools),
    };
  }

  /**
   * Une piste par poule, matchs enchaînés dans l'ordre officiel (#1018)
   */
  private createPoolSchedule(pools: Pool[], arenas: Arena[], startTime: Date): ScheduledMatch[] {
    if (arenas.length === 0) return [];
    const arenaFree = new Map<string, number>(arenas.map(a => [a.id, startTime.getTime()]));

    // Les poules les plus longues démarrent en premier
    const queues = pools
      .map(pool => pool.matches.filter(m => m.status !== MatchStatus.FINISHED))
      .filter(q => q.length > 0)
      .sort((a, b) => b.length - a.length);

    const schedule: ScheduledMatch[] = [];
    for (const queue of queues) {
      const arenaId = this.earliestFreeArena(arenaFree);
      let t = arenaFree.get(arenaId)!;
      for (const match of queue) {
        const duration = this.estimateMatchDuration(match);
        schedule.push({
          match,
          arenaId,
          scheduledTime: new Date(t),
          estimatedDuration: duration,
          priority: 0,
        });
        t += duration * 60000;
      }
      arenaFree.set(arenaId, t);
    }

    return schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }

  /** Piste libérée la plus tôt (ordre des pistes à égalité) */
  private earliestFreeArena(arenaFree: Map<string, number>): string {
    let best = '';
    let bestT = Infinity;
    for (const [id, t] of arenaFree) {
      if (t < bestT) {
        best = id;
        bestT = t;
      }
    }
    return best;
  }

  /**
   * Planning de la phase de tableau (#1018) : duels prêts (deux adversaires connus)
   * et duels en attente (démarrent à la fin des matchs qui les alimentent, plus
   * le temps de repos). Chaque duel prend la première piste libre.
   */
  optimizeTableauFlow(
    brackets: TableauFlowMatch[][],
    arenas: Arena[],
    currentTime: Date = new Date()
  ): TableauFlowResult {
    const availableArenas = arenas.filter(a => a.available);
    const now = currentTime.getTime();
    const rest = this.config.minRestTime * 60000;
    const duration = this.estimateMatchDuration({} as Match);

    type Node = { bracket: number; match: TableauFlowMatch; ready: boolean };
    const key = (b: number, round: number, position: number) => `${b}:${round}:${position}`;
    const endTime = new Map<string, number>(); // match terminé ou planifié → fin (ms)
    const pending: Node[] = [];

    brackets.forEach((matches, b) => {
      for (const m of matches) {
        if (m.winner || m.isBye) endTime.set(key(b, m.round, m.position), now);
        else pending.push({ bracket: b, match: m, ready: !!m.fencerA && !!m.fencerB });
      }
    });

    // Matchs qui alimentent un duel (demi-finales pour la finale et la petite finale)
    const feeders = (b: number, m: TableauFlowMatch): string[] =>
      m.round <= 3
        ? [key(b, 4, 0), key(b, 4, 1)]
        : [key(b, m.round * 2, m.position * 2), key(b, m.round * 2, m.position * 2 + 1)];

    // Heure à laquelle un côté du duel est prêt ; null si son match n'est pas encore planifié
    const sideReadyAt = (b: number, m: TableauFlowMatch, side: 0 | 1): number | null => {
      if (side === 0 ? m.fencerA : m.fencerB) return now;
      const feeder = feeders(b, m)[side];
      if (!brackets[b].some(x => key(b, x.round, x.position) === feeder)) return now;
      const end = endTime.get(feeder);
      return end === undefined ? null : end + rest;
    };

    const slots: TableauScheduledSlot[] = [];
    if (availableArenas.length > 0) {
      const arenaFree = new Map<string, number>(availableArenas.map(a => [a.id, now]));
      const remaining = [...pending];
      while (remaining.length > 0) {
        // Duel planifiable le plus tôt (ses matchs d'alimentation sont planifiés)
        let pick = -1;
        let pickReady = Infinity;
        remaining.forEach((n, i) => {
          const a = sideReadyAt(n.bracket, n.match, 0);
          const c = sideReadyAt(n.bracket, n.match, 1);
          if (a === null || c === null) return;
          const readyAt = Math.max(a, c);
          if (readyAt < pickReady) {
            pick = i;
            pickReady = readyAt;
          }
        });
        if (pick < 0) break;
        const [node] = remaining.splice(pick, 1);
        const arenaId = this.earliestFreeArena(arenaFree);
        const start = Math.max(arenaFree.get(arenaId)!, pickReady);
        const end = start + duration * 60000;
        arenaFree.set(arenaId, end);
        endTime.set(key(node.bracket, node.match.round, node.match.position), end);
        slots.push({
          matchId: node.match.id,
          arenaId,
          scheduledTime: new Date(start),
          estimatedDuration: duration,
          ready: node.ready,
        });
      }
    }

    const { start, end } = this.getScheduleBounds(slots);
    return {
      schedule: slots.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime()),
      readyCount: pending.filter(n => n.ready).length,
      waitingCount: pending.filter(n => !n.ready).length,
      estimatedFinishTime: new Date(slots.length > 0 ? end : now),
      totalDuration: end - start,
      maxConcurrent: this.computeMaxConcurrent(slots),
      arenaUtilization: this.computeArenaUtilization(slots, availableArenas),
      recommendations: this.getArenaRecommendations(slots, availableArenas),
    };
  }

  /** Nombre maximal de duels simultanés (= pistes réellement utiles) */
  private computeMaxConcurrent(slots: ScheduleSlot[]): number {
    const events = slots.flatMap(s => [
      { t: s.scheduledTime.getTime(), d: 1 },
      { t: s.scheduledTime.getTime() + s.estimatedDuration * 60000, d: -1 },
    ]);
    events.sort((a, b) => a.t - b.t || a.d - b.d);
    let cur = 0;
    let max = 0;
    for (const e of events) {
      cur += e.d;
      max = Math.max(max, cur);
    }
    return max;
  }

  /**
   * Estimate match duration based on historical data and default values
   */
  private estimateMatchDuration(match: Match): number {
    // Default duration - weapon type would come from competition data
    let duration = 15;

    // Adjust based on fencer historical performance
    if (match.fencerA?.id && this.historicalData.has(match.fencerA.id)) {
      duration = (duration + this.historicalData.get(match.fencerA.id)!) / 2;
    }

    if (match.fencerB?.id && this.historicalData.has(match.fencerB.id)) {
      duration = (duration + this.historicalData.get(match.fencerB.id)!) / 2;
    }

    return Math.max(duration, 5); // Minimum 5 minutes
  }

  /**
   * Attentes (min) entre deux matchs de chaque tireur de la poule la plus grande,
   * d'après l'ordre officiel de ses matchs tirés à la suite sur une piste (#1018)
   */
  private computeLargestPoolWaits(pools: Pool[]): Map<string, number[]> {
    const fencerIds = (pool: Pool) =>
      new Set(pool.matches.flatMap(m => [m.fencerA?.id, m.fencerB?.id]).filter(Boolean));
    const largest = pools.reduce<Pool | null>(
      (best, pool) =>
        !best ||
        Math.max(pool.fencers?.length ?? 0, fencerIds(pool).size) >
          Math.max(best.fencers?.length ?? 0, fencerIds(best).size)
          ? pool
          : best,
      null
    );
    const waits = new Map<string, number[]>();
    if (!largest) return waits;

    const lastIndex = new Map<string, number>();
    largest.matches.forEach((match, i) => {
      const duration = this.estimateMatchDuration(match);
      for (const f of [match.fencerA, match.fencerB]) {
        if (!f?.id) continue;
        const prev = lastIndex.get(f.id);
        if (prev !== undefined) {
          const gaps = waits.get(f.id) ?? [];
          gaps.push((i - prev - 1) * duration);
          waits.set(f.id, gaps);
        }
        lastIndex.set(f.id, i);
      }
    });
    return waits;
  }

  /**
   * Calculate schedule metrics
   */
  private calculateScheduleMetrics(
    schedule: ScheduledMatch[],
    arenas: Arena[],
    pools: Pool[]
  ): FlowOptimizationResult['metrics'] {
    const waits = this.computeLargestPoolWaits(pools);
    const allGaps = [...waits.values()].flat();
    const averageWaitTime = allGaps.length
      ? allGaps.reduce((a, b) => a + b, 0) / allGaps.length
      : 0;
    const maxFencerWait = allGaps.length ? Math.max(...allGaps) : 0;
    const fencersOverMaxWait = [...waits.values()].filter(g =>
      g.some(w => w > this.config.maxWaitTime)
    ).length;

    const { start, end } = this.getScheduleBounds(schedule);

    return {
      averageWaitTime,
      maxFencerWait,
      fencersOverMaxWait,
      totalDuration: end - start,
      arenaUtilization: this.computeArenaUtilization(schedule, arenas),
      fencerRestViolations: 0, // This would be calculated based on rest tracking
    };
  }

  /**
   * Début (premier match) et fin (dernier match terminé) du planning, en ms
   */
  private getScheduleBounds(schedule: ScheduleSlot[]): { start: number; end: number } {
    if (schedule.length === 0) return { start: 0, end: 0 };
    return {
      start: Math.min(...schedule.map(s => s.scheduledTime.getTime())),
      end: Math.max(...schedule.map(s => s.scheduledTime.getTime() + s.estimatedDuration * 60000)),
    };
  }

  /**
   * Taux d'occupation (%) de chaque piste sur toute la durée du planning.
   * Une piste sans aucun match vaut 0 % (#1018).
   */
  private computeArenaUtilization(
    schedule: ScheduleSlot[],
    arenas: Arena[]
  ): Record<string, number> {
    const { start, end } = this.getScheduleBounds(schedule);
    const horizon = (end - start) / 60000;
    const utilization: Record<string, number> = {};
    for (const arena of arenas) {
      const busy = schedule
        .filter(s => s.arenaId === arena.id)
        .reduce((sum, m) => sum + m.estimatedDuration, 0);
      utilization[arena.id] = horizon > 0 ? (busy / horizon) * 100 : 0;
    }
    return utilization;
  }

  /**
   * Attentes (min) de chaque tireur entre la fin d'un match et le début du suivant
   */
  private computeFencerWaits(schedule: ScheduledMatch[]): Map<string, number[]> {
    const byFencer = new Map<string, ScheduledMatch[]>();
    for (const s of schedule) {
      for (const f of [s.match.fencerA, s.match.fencerB]) {
        if (!f?.id) continue;
        const list = byFencer.get(f.id) ?? [];
        list.push(s);
        byFencer.set(f.id, list);
      }
    }
    const waits = new Map<string, number[]>();
    for (const [fencerId, list] of byFencer) {
      list.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < list.length; i++) {
        const prevEnd = list[i - 1].scheduledTime.getTime() + list[i - 1].estimatedDuration * 60000;
        gaps.push(Math.max(0, (list[i].scheduledTime.getTime() - prevEnd) / 60000));
      }
      waits.set(fencerId, gaps);
    }
    return waits;
  }

  /**
   * Update historical data with completed match
   */
  updateHistoricalData(match: Match): void {
    if (match.status !== MatchStatus.FINISHED) return;

    const duration = this.calculateActualDuration(match);

    if (match.fencerA?.id) {
      this.updateFencerAverage(match.fencerA.id, duration);
    }

    if (match.fencerB?.id) {
      this.updateFencerAverage(match.fencerB.id, duration);
    }
  }

  /**
   * Calculate actual match duration from timestamps
   */
  private calculateActualDuration(match: Match): number {
    if (!match.createdAt || !match.updatedAt) return 15; // Default

    const start = new Date(match.createdAt).getTime();
    const end = new Date(match.updatedAt).getTime();

    return Math.max(5, (end - start) / (1000 * 60)); // At least 5 minutes
  }

  /**
   * Update fencer's average match duration
   */
  private updateFencerAverage(fencerId: string, duration: number): void {
    const current = this.historicalData.get(fencerId) || 15;
    const updated = (current + duration) / 2; // Simple moving average
    this.historicalData.set(fencerId, updated);
  }

  /**
   * Get real-time flow recommendations
   */
  getFlowRecommendations(
    currentSchedule: ScheduledMatch[],
    arenas: Arena[],
    metrics?: FlowOptimizationResult['metrics']
  ): string[] {
    const recommendations: string[] = [];
    const availableArenas = arenas.filter(a => a.available);

    // Attente des tireurs entre deux matchs : poule la plus grande, ordre officiel (#1018)
    let overWait = metrics?.fencersOverMaxWait;
    let maxWait = metrics?.maxFencerWait;
    if (!metrics) {
      const waits = [...this.computeFencerWaits(currentSchedule).values()];
      overWait = waits.filter(g => g.some(w => w > this.config.maxWaitTime)).length;
      maxWait = waits.flat().length ? Math.max(...waits.flat()) : 0;
    }
    if (overWait) {
      recommendations.push(
        `⏰ ${overWait} tireur(s) attendent plus de ${this.config.maxWaitTime} min entre deux matchs (jusqu'à ${Math.round(maxWait ?? 0)} min).`
      );
    }

    recommendations.push(...this.getArenaRecommendations(currentSchedule, availableArenas));
    return recommendations;
  }

  /** Pistes réellement sous-utilisées sur la durée du planning (#1018) */
  private getArenaRecommendations(schedule: ScheduleSlot[], availableArenas: Arena[]): string[] {
    const recommendations: string[] = [];
    if (schedule.length > 0) {
      const utilization = this.computeArenaUtilization(schedule, availableArenas);
      // Pistes en trop = au-delà du nombre maximal de matchs simultanés
      const unused = Math.max(0, availableArenas.length - this.computeMaxConcurrent(schedule));
      const idle = availableArenas.filter(a => (utilization[a.id] ?? 0) < 20).length;
      if (unused > 0) {
        recommendations.push(
          `😴 ${unused} piste(s) inutilisée(s) : ${availableArenas.length - unused} piste(s) suffisent.`
        );
      } else if (idle > 0) {
        recommendations.push(
          `😴 ${idle} piste(s) occupée(s) moins de 20 % du temps. Optimisez la répartition.`
        );
      }
    }

    return recommendations;
  }

  /**
   * Generate predictive insights
   */
  generatePredictiveInsights(
    competition: Competition,
    pools: Pool[],
    schedule: ScheduledMatch[]
  ): {
    estimatedFinishTime: Date;
    bottlenecks: string[];
    recommendations: string[];
  } {
    const remainingMatches = pools.reduce(
      (sum, pool) => sum + pool.matches.filter(m => m.status !== MatchStatus.FINISHED).length,
      0
    );

    // Fin estimée = fin du dernier match planifié (#1018 : valait l'heure actuelle)
    const { end } = this.getScheduleBounds(schedule);
    const estimatedFinishTime = new Date(schedule.length > 0 ? end : Date.now());

    // Identify potential bottlenecks
    const bottlenecks: string[] = [];
    const usedArenas = new Set(schedule.map(s => s.arenaId)).size;
    if (remainingMatches > 20 && usedArenas < 4) {
      bottlenecks.push('Trop peu de pistes pour le nombre de matchs restants');
    }

    return {
      estimatedFinishTime,
      bottlenecks,
      recommendations: [
        "Augmenter le nombre de pistes simultanées pour réduire les temps d'attente",
        "Optimiser les pauses entre les matchs pour améliorer l'expérience des tireurs",
      ],
    };
  }
}

// Default configuration
export const DEFAULT_TOURNAMENT_CONFIG: ArenaSettings = {
  maxConcurrentMatches: 4,
  minRestTime: 10, // 10 minutes between matches
  maxWaitTime: 25, // attente max acceptable entre deux matchs d'un tireur (min)
  balanceStripUsage: true,
  optimizeFencerRest: true,
};
