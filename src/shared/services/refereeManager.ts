/**
 * BellePoule Modern - Referee Management Service
 * Advanced referee assignment and rotation system
 * Licensed under GPL-3.0
 */

import { Referee, Match, Pool } from '../types';

export interface RefereeAssignment {
  referee: Referee;
  match: Match;
  assignmentTime: Date;
  conflictWarning?: string;
}

export interface RefereeRotationConfig {
  maxConsecutiveMatches: number;
  minRestTimeMinutes: number;
  avoidSameClub: boolean;
  balanceAssignment: boolean;
  maxRefereesPerPool?: number;
  maxRefereesPerMatch?: number;
}

export class RefereeManager {
  private referees: Referee[];
  private assignments: Map<string, RefereeAssignment[]> = new Map();
  private config: RefereeRotationConfig;
  private currentMatches: Match[] = [];
  // Matchs consécutifs en cours (sans pause entre deux) par arbitre
  private consecutiveCount: Map<string, number> = new Map();

  constructor(referees: Referee[], config: Partial<RefereeRotationConfig> = {}) {
    this.referees = referees.filter(r => r.status !== 'unavailable');
    this.config = {
      maxConsecutiveMatches: 3,
      minRestTimeMinutes: 15,
      avoidSameClub: true,
      balanceAssignment: true,
      ...config,
    };
  }

  /**
   * Assigne automatiquement les arbitres aux matchs
   * Évite les conflits d'intérêts et optimise la rotation
   */
  assignRefereesToMatches(matches: Match[], pools: Pool[]): Map<string, Referee> {
    const assignments = new Map<string, Referee>();
    this.currentMatches = matches;
    const matchQueue = [...matches].sort(
      (a, b) => this.getMatchPriority(a) - this.getMatchPriority(b)
    );

    for (const match of matchQueue) {
      const bestReferee = this.findBestRefereeForMatch(match, pools, assignments);
      if (bestReferee) {
        assignments.set(match.id, bestReferee);
        this.recordAssignment(bestReferee, match);
      }
    }

    return assignments;
  }

  /**
   * Trouve le meilleur arbitre pour un match donné
   */
  private findBestRefereeForMatch(
    match: Match,
    pools: Pool[],
    currentAssignments: Map<string, Referee>
  ): Referee | null {
    let availableReferees = this.referees.filter(referee =>
      this.isRefereeAvailable(referee, match, currentAssignments)
    );

    // Respecte maxRefereesPerPool : si la poule a déjà atteint la limite,
    // seuls les arbitres déjà assignés à cette poule peuvent être utilisés.
    const maxPerPool = this.config.maxRefereesPerPool;
    if (maxPerPool && match.poolId) {
      const pool = pools.find(p => p.id === match.poolId);
      if (pool) {
        const poolMatchIds = pool.matches.map(m => m.id);
        const assignedInPool = new Set(
          poolMatchIds
            .map(id => currentAssignments.get(id))
            .filter((r): r is Referee => r !== undefined)
            .map(r => r.id)
        );
        if (assignedInPool.size >= maxPerPool) {
          availableReferees = availableReferees.filter(r => assignedInPool.has(r.id));
        }
      }
    }

    if (availableReferees.length === 0) return null;

    // Score each referee
    const scoredReferees = availableReferees.map(referee => ({
      referee,
      score: this.calculateRefereeScore(referee, match, pools),
    }));

    // Sort by score (highest is best)
    scoredReferees.sort((a, b) => b.score - a.score);

    return scoredReferees[0]?.referee || null;
  }

  /**
   * Calcule un score pour un arbitre (plus haut = meilleur)
   */
  private calculateRefereeScore(referee: Referee, match: Match, pools: Pool[]): number {
    let score = 100;

    // Check for club conflict
    if (this.config.avoidSameClub && this.hasClubConflict(referee, match, pools)) {
      score -= 1000; // Heavy penalty
    }

    // Prefer referees with fewer assignments (balance)
    if (this.config.balanceAssignment) {
      const assignmentCount = referee.assignedMatches || 0;
      score -= assignmentCount * 5;
    }

    // Check rest time
    if (referee.lastAssignmentTime) {
      const minutesSinceLast = (Date.now() - referee.lastAssignmentTime.getTime()) / (1000 * 60);
      if (minutesSinceLast < this.config.minRestTimeMinutes) {
        score -= 50;
      }
    }

    // Prefer referees with appropriate category for match importance
    if (match.round && match.round <= 4) {
      // Quarter-finals and beyond
      if (referee.category === 'International') score += 20;
      if (referee.category === 'National') score += 10;
    }

    return score;
  }

  /**
   * Vérifie si l'arbitre a un conflit d'intérêt avec un match
   */
  private hasClubConflict(referee: Referee, match: Match, pools: Pool[]): boolean {
    if (!referee.club || !this.config.avoidSameClub) return false;

    const fencerA = match.fencerA;
    const fencerB = match.fencerB;

    // Check if referee's club matches either fencer's club
    if (fencerA?.club === referee.club || fencerB?.club === referee.club) {
      return true;
    }

    // Check pool assignment conflicts
    const pool = pools.find(p => p.id === match.poolId);
    if (pool) {
      const hasClubFencer = pool.fencers.some(f => f.club === referee.club);
      if (hasClubFencer) return true;
    }

    return false;
  }

  /**
   * Vérifie si un arbitre est disponible
   */
  private isRefereeAvailable(
    referee: Referee,
    match: Match,
    currentAssignments: Map<string, Referee>
  ): boolean {
    if (referee.status === 'unavailable') return false;

    // Check if already assigned to a match at the same time
    const isBusy = Array.from(currentAssignments.entries()).some(
      ([matchId, assignedReferee]) =>
        assignedReferee.id === referee.id && this.isTimeConflict(match, this.findMatchById(matchId))
    );

    if (isBusy) return false;

    // Check max matches per day
    if (referee.maxMatchesPerDay && referee.assignedMatches) {
      if (referee.assignedMatches >= referee.maxMatchesPerDay) return false;
    }

    // Enforce maxConsecutiveMatches
    const consecutive = this.consecutiveCount.get(referee.id) ?? 0;
    if (consecutive >= this.config.maxConsecutiveMatches) return false;

    return true;
  }

  /**
   * Vérifie s'il y a un conflit de temps entre deux matchs
   */
  private isTimeConflict(match1: Match, match2: Match | undefined): boolean {
    if (!match2 || !match1.startTime || !match2.startTime) return false;

    const start1 = new Date(match1.startTime).getTime();
    const end1 = start1 + (match1.duration || 180) * 1000; // Default 3 minutes
    const start2 = new Date(match2.startTime).getTime();
    const end2 = start2 + (match2.duration || 180) * 1000;

    return start1 < end2 && end1 > start2;
  }

  /**
   * Enregistre une assignation d'arbitre
   */
  private recordAssignment(referee: Referee, match: Match): void {
    const assignment: RefereeAssignment = {
      referee,
      match,
      assignmentTime: new Date(),
      conflictWarning: this.hasClubConflict(referee, match, [])
        ? 'Conflit potentiel avec le club'
        : undefined,
    };

    const existing = this.assignments.get(referee.id) || [];
    existing.push(assignment);
    this.assignments.set(referee.id, existing);

    // Mise à jour compteur consécutif : reset si temps de repos suffisant
    const prev = existing[existing.length - 2];
    if (prev) {
      const minutesSinceLast =
        (assignment.assignmentTime.getTime() - prev.assignmentTime.getTime()) / 60000;
      if (minutesSinceLast >= this.config.minRestTimeMinutes) {
        this.consecutiveCount.set(referee.id, 1);
      } else {
        this.consecutiveCount.set(referee.id, (this.consecutiveCount.get(referee.id) ?? 0) + 1);
      }
    } else {
      this.consecutiveCount.set(referee.id, 1);
    }

    // Update referee stats
    referee.assignedMatches = (referee.assignedMatches || 0) + 1;
    referee.lastAssignmentTime = new Date();
    referee.status = 'assigned';
  }

  /**
   * Score de fatigue [0–100] pour l'affichage UI (100 = épuisé)
   */
  getFatigueScore(refereeId: string): number {
    const consecutive = this.consecutiveCount.get(refereeId) ?? 0;
    const assignments = this.assignments.get(refereeId) || [];
    const last = assignments[assignments.length - 1];
    const minutesSinceLast = last ? (Date.now() - last.assignmentTime.getTime()) / 60000 : Infinity;

    const consecutiveScore = Math.min(100, (consecutive / this.config.maxConsecutiveMatches) * 70);
    const restScore =
      minutesSinceLast < this.config.minRestTimeMinutes
        ? ((this.config.minRestTimeMinutes - minutesSinceLast) / this.config.minRestTimeMinutes) *
          30
        : 0;

    return Math.round(consecutiveScore + restScore);
  }

  /**
   * Rapport enrichi avec score de fatigue
   */
  generateRotationReportDetailed(): {
    refereeId: string;
    refereeName: string;
    matchesAssigned: number;
    consecutiveMatches: number;
    fatigueScore: number;
    restViolations: number;
    conflicts: number;
    needsRest: boolean;
  }[] {
    return this.referees.map(referee => {
      const assignments = this.assignments.get(referee.id) || [];
      const conflicts = assignments.filter(a => a.conflictWarning).length;
      const consecutive = this.consecutiveCount.get(referee.id) ?? 0;
      const fatigueScore = this.getFatigueScore(referee.id);

      let restViolations = 0;
      for (let i = 1; i < assignments.length; i++) {
        const diff =
          (assignments[i].assignmentTime.getTime() - assignments[i - 1].assignmentTime.getTime()) /
          60000;
        if (diff < this.config.minRestTimeMinutes) restViolations++;
      }

      return {
        refereeId: referee.id,
        refereeName: `${referee.firstName} ${referee.lastName}`,
        matchesAssigned: assignments.length,
        consecutiveMatches: consecutive,
        fatigueScore,
        restViolations,
        conflicts,
        needsRest: consecutive >= this.config.maxConsecutiveMatches || fatigueScore >= 80,
      };
    });
  }

  /**
   * Récupère les statistiques d'un arbitre
   */
  getRefereeStats(refereeId: string): {
    totalMatches: number;
    todayMatches: number;
    lastAssignment?: Date;
    averageMatchDuration: number;
  } {
    const assignments = this.assignments.get(refereeId) || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayMatches = assignments.filter(a => a.assignmentTime >= today).length;

    const totalDuration = assignments.reduce((sum, a) => sum + (a.match.duration || 180), 0);

    return {
      totalMatches: assignments.length,
      todayMatches,
      lastAssignment: assignments[assignments.length - 1]?.assignmentTime,
      averageMatchDuration: assignments.length > 0 ? totalDuration / assignments.length : 0,
    };
  }

  /**
   * Génère un rapport de rotation des arbitres
   */
  generateRotationReport(): {
    refereeName: string;
    matchesAssigned: number;
    restViolations: number;
    conflicts: number;
  }[] {
    return this.referees.map(referee => {
      const assignments = this.assignments.get(referee.id) || [];
      const conflicts = assignments.filter(a => a.conflictWarning).length;

      // Count rest violations
      let restViolations = 0;
      for (let i = 1; i < assignments.length; i++) {
        const prevTime = assignments[i - 1].assignmentTime.getTime();
        const currTime = assignments[i].assignmentTime.getTime();
        const diffMinutes = (currTime - prevTime) / (1000 * 60);
        if (diffMinutes < this.config.minRestTimeMinutes) {
          restViolations++;
        }
      }

      return {
        refereeName: `${referee.firstName} ${referee.lastName}`,
        matchesAssigned: assignments.length,
        restViolations,
        conflicts,
      };
    });
  }

  private findMatchById(matchId: string): Match | undefined {
    return this.currentMatches.find(m => m.id === matchId);
  }

  private getMatchPriority(match: Match): number {
    if (match.round) {
      // Later rounds have higher priority (lower round number)
      return match.round;
    }
    return 999;
  }
}

export default RefereeManager;
