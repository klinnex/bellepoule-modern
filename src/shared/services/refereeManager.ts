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
   * Enregistre une affectation décidée hors du service (appariement optimal, #1959)
   */
  recordExternalAssignment(refereeId: string, match: Match): void {
    const referee = this.referees.find(r => r.id === refereeId);
    if (referee) this.recordAssignment(referee, match);
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
}

export default RefereeManager;
