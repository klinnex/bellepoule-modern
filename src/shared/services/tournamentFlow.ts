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
  private fencerAvailability: Map<string, Date> = new Map(); // fencerId -> earliest next match time

  constructor(config: ArenaSettings) {
    this.config = config;
  }

  /**
   * Optimize tournament flow for all remaining matches
   */
  async optimizeTournamentFlow(
    competition: Competition,
    pools: Pool[],
    arenas: Arena[],
    currentTime: Date = new Date()
  ): Promise<FlowOptimizationResult> {
    // Chaque calcul repart de zéro : le repos des tireurs d'un calcul précédent
    // décalait tout le planning dans le futur (#1018)
    this.fencerAvailability.clear();
    const unscheduledMatches = this.getUnscheduledMatches(pools);
    const availableArenas = arenas.filter(arena => arena.available);

    // Create optimization model
    const schedule = await this.createOptimalSchedule(
      unscheduledMatches,
      availableArenas,
      currentTime
    );

    // Calculate metrics
    const metrics = this.calculateScheduleMetrics(schedule, availableArenas);

    return {
      schedule,
      metrics,
    };
  }

  /**
   * Get all unscheduled matches from pools
   */
  private getUnscheduledMatches(pools: Pool[]): Match[] {
    return pools.flatMap(pool =>
      pool.matches.filter(match => match.status !== MatchStatus.FINISHED)
    );
  }

  /**
   * Create optimal schedule using heuristic algorithms
   */
  private async createOptimalSchedule(
    matches: Match[],
    arenas: Arena[],
    startTime: Date
  ): Promise<ScheduledMatch[]> {
    // Sort matches by priority (importance for tournament flow)
    const prioritizedMatches = this.prioritizeMatches(matches);

    const schedule: ScheduledMatch[] = [];
    const arenaAvailability = new Map<string, Date>(arenas.map(arena => [arena.id, startTime]));

    // Ordonnancement glouton : à chaque étape, le match démarrable le plus tôt ;
    // à égalité, celui dont les tireurs attendent depuis le plus longtemps (#1018)
    const remaining = [...prioritizedMatches];
    while (remaining.length > 0) {
      let pickIndex = -1;
      let bestSlot: ReturnType<TournamentFlowManager['findBestTimeSlot']> = null;
      let bestIdleSince = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const slot = this.findBestTimeSlot(remaining[i], arenas, arenaAvailability);
        if (!slot) continue;
        const idleSince = this.getFencersIdleSince(remaining[i]);
        const t = slot.startTime.getTime();
        const bestT = bestSlot ? bestSlot.startTime.getTime() : Infinity;
        if (t < bestT || (t === bestT && idleSince < bestIdleSince)) {
          pickIndex = i;
          bestSlot = slot;
          bestIdleSince = idleSince;
        }
      }
      if (pickIndex < 0 || !bestSlot) break;
      const [match] = remaining.splice(pickIndex, 1);

      const scheduledMatch: ScheduledMatch = {
        match,
        arenaId: bestSlot.arenaId,
        scheduledTime: bestSlot.startTime,
        estimatedDuration: this.estimateMatchDuration(match),
        priority: bestSlot.priority,
      };

      schedule.push(scheduledMatch);

      // Update arena availability
      const endTime = new Date(bestSlot.startTime.getTime() + bestSlot.duration * 60000);
      arenaAvailability.set(bestSlot.arenaId, endTime);

      // Update fencer availability (rest time tracking)
      this.updateFencerAvailability(match, endTime);
    }

    return schedule.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }

  /**
   * Prioritize matches for optimal tournament flow
   */
  private prioritizeMatches(matches: Match[]): Match[] {
    return matches.sort((a, b) => {
      // Priority factors:
      // 1. Pool completion percentage
      // 2. Fencer rankings (higher ranked fencers get priority)
      // 3. Match dependencies

      const priorityA = this.calculateMatchPriority(a);
      const priorityB = this.calculateMatchPriority(b);

      return priorityB - priorityA;
    });
  }

  /**
   * Calculate match priority score
   */
  private calculateMatchPriority(match: Match): number {
    let priority = 0;

    // Higher priority for matches in almost-complete pools
    if (match.poolId) {
      // This would need pool completion calculation
      priority += 10;
    }

    // Higher priority for higher-ranked fencers
    if (match.fencerA?.initialRanking) {
      priority += (100 - match.fencerA.initialRanking) * 0.1;
    }
    if (match.fencerB?.initialRanking) {
      priority += (100 - match.fencerB.initialRanking) * 0.1;
    }

    return priority;
  }

  /**
   * Find the best time slot for a match
   */
  private findBestTimeSlot(
    match: Match,
    arenas: Arena[],
    arenaAvailability: Map<string, Date>
  ): { arenaId: string; startTime: Date; duration: number; priority: number } | null {
    let bestSlot: { arenaId: string; startTime: Date; duration: number; priority: number } | null =
      null;
    let bestScore = -1;

    for (const arena of arenas) {
      if (!arena.available) continue;

      const availableFrom = arenaAvailability.get(arena.id) || new Date();
      const estimatedDuration = this.estimateMatchDuration(match);

      // Check fencer rest time
      const earliestStart = this.getEarliestStartAfterRest(match, availableFrom);

      const slot = {
        arenaId: arena.id,
        startTime: earliestStart,
        duration: estimatedDuration,
        priority: this.calculateArenaSlotPriority(arena, earliestStart, estimatedDuration),
      };

      const score = this.evaluateSlotQuality(match, slot);

      if (score > bestScore) {
        bestScore = score;
        bestSlot = slot;
      }
    }

    return bestSlot;
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
   * Get earliest start time respecting fencer rest periods
   */
  private getEarliestStartAfterRest(match: Match, availableFrom: Date): Date {
    let earliest = availableFrom.getTime();
    if (match.fencerA?.id) {
      const avail = this.fencerAvailability.get(match.fencerA.id);
      if (avail && avail.getTime() > earliest) earliest = avail.getTime();
    }
    if (match.fencerB?.id) {
      const avail = this.fencerAvailability.get(match.fencerB.id);
      if (avail && avail.getTime() > earliest) earliest = avail.getTime();
    }
    return new Date(earliest);
  }

  /**
   * Moment depuis lequel les tireurs du match sont disponibles (le plus ancien) ;
   * -Infinity si l'un d'eux n'a pas encore tiré
   */
  private getFencersIdleSince(match: Match): number {
    let idleSince = Infinity;
    for (const f of [match.fencerA, match.fencerB]) {
      if (!f?.id) continue;
      const avail = this.fencerAvailability.get(f.id);
      idleSince = Math.min(idleSince, avail ? avail.getTime() : -Infinity);
    }
    return idleSince;
  }

  /**
   * Calculate priority for a specific arena slot
   */
  private calculateArenaSlotPriority(arena: Arena, startTime: Date, duration: number): number {
    let priority = 0;

    // Prefer less-used arenas (balance usage)
    priority += (100 - (arena.usageCount || 0)) * 0.1;

    // Prefer earlier time slots
    const hoursFromNow = (startTime.getTime() - Date.now()) / (1000 * 60 * 60);
    priority += Math.max(0, 10 - hoursFromNow);

    return priority;
  }

  /**
   * Evaluate the quality of a time slot for a match
   */
  private evaluateSlotQuality(
    match: Match,
    slot: { arenaId: string; startTime: Date; duration: number }
  ): number {
    let score = 0;

    // Prefer shorter wait times
    const waitTime = (slot.startTime.getTime() - Date.now()) / (1000 * 60); // minutes
    score += Math.max(0, 100 - waitTime);

    // Prefer balanced arena usage
    score += 50; // This would be calculated based on arena usage history

    // Respect rest periods
    score += 30; // This would check fencer rest requirements

    return score;
  }

  /**
   * Update fencer availability tracking (rest time after a match ends)
   */
  private updateFencerAvailability(match: Match, endTime: Date): void {
    const restEnd = new Date(endTime.getTime() + this.config.minRestTime * 60_000);
    if (match.fencerA?.id) this.fencerAvailability.set(match.fencerA.id, restEnd);
    if (match.fencerB?.id) this.fencerAvailability.set(match.fencerB.id, restEnd);
  }

  /**
   * Calculate schedule metrics
   */
  private calculateScheduleMetrics(
    schedule: ScheduledMatch[],
    arenas: Arena[]
  ): FlowOptimizationResult['metrics'] {
    const waits = this.computeFencerWaits(schedule);
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
  private getScheduleBounds(schedule: ScheduledMatch[]): { start: number; end: number } {
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
    schedule: ScheduledMatch[],
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
  getFlowRecommendations(currentSchedule: ScheduledMatch[], arenas: Arena[]): string[] {
    const recommendations: string[] = [];
    const availableArenas = arenas.filter(a => a.available);

    // Attente des tireurs entre deux matchs (#1018)
    const waits = [...this.computeFencerWaits(currentSchedule).values()];
    const overWait = waits.filter(g => g.some(w => w > this.config.maxWaitTime));
    if (overWait.length > 0) {
      const maxWait = Math.round(Math.max(...waits.flat()));
      recommendations.push(
        `⏰ ${overWait.length} tireur(s) attendent plus de ${this.config.maxWaitTime} min entre deux matchs (jusqu'à ${maxWait} min).`
      );
    }

    // Pistes réellement sous-utilisées sur la durée du planning (#1018)
    if (currentSchedule.length > 0) {
      const utilization = this.computeArenaUtilization(currentSchedule, availableArenas);
      const unused = availableArenas.filter(a => (utilization[a.id] ?? 0) === 0).length;
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
