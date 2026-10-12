/**
 * BellePoule Modern - Bracket Service
 * Business logic for elimination bracket management
 * Licensed under GPL-3.0
 */

import { Fencer, DirectEliminationTable } from '../../../shared/types';
import { createDirectEliminationTable } from '../../../shared/utils/tableCalculations';

export interface BracketGenerationConfig {
  fencerCount: number;
  seededFencers?: Fencer[];
  randomize?: boolean;
  maxScore?: number;
}

export class BracketService {
  /**
   * Generate elimination bracket using FIE seeding algorithm
   */
  async generateBracket(
    competitionId: string,
    config: BracketGenerationConfig
  ): Promise<DirectEliminationTable> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) {
      return this.emptyTable(competitionId, config.fencerCount);
    }

    const fencers =
      config.seededFencers ?? (await window.electronAPI.db.getFencersByCompetition(competitionId));

    if (!fencers.length) {
      return this.emptyTable(competitionId, config.fencerCount);
    }

    const maxScore = config.maxScore ?? 15;
    const table = createDirectEliminationTable(fencers, maxScore, 'Tableau principal', 1);

    return { ...table, competitionId };
  }

  /**
   * Update match result and mark winner in the bracket node
   */
  async updateMatchResult(tableId: string, matchId: string, winnerId: string): Promise<void> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) return;

    const match = await window.electronAPI.db.getMatch(matchId);
    if (!match) return;

    const isWinnerA = match.fencerA?.id === winnerId;
    await window.electronAPI.db.updateMatch(matchId, {
      scoreA: match.scoreA
        ? { ...match.scoreA, isVictory: isWinnerA }
        : { value: null, isVictory: isWinnerA },
      scoreB: match.scoreB
        ? { ...match.scoreB, isVictory: !isWinnerA }
        : { value: null, isVictory: !isWinnerA },
      status: 'finished',
    });
  }

  /**
   * Get bracket progression statistics
   */
  async getProgression(tableId: string): Promise<{
    currentRound: number;
    totalRounds: number;
    completedMatches: number;
    totalMatches: number;
  }> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) {
      return { currentRound: 1, totalRounds: 1, completedMatches: 0, totalMatches: 0 };
    }

    // Matches for this table are stored with tableId
    const allMatches = await window.electronAPI.db.getMatchesByPool(tableId).catch(() => []);
    const completedMatches = allMatches.filter(m => m.status === 'finished').length;
    const totalRounds = allMatches.length > 0 ? Math.ceil(Math.log2(allMatches.length + 1)) : 1;
    const inProgressRound = allMatches
      .filter(m => m.status !== 'finished')
      .reduce((min, m) => Math.min(min, m.round ?? Infinity), Infinity);

    return {
      currentRound: isFinite(inProgressRound) ? inProgressRound : totalRounds,
      totalRounds,
      completedMatches,
      totalMatches: allMatches.length,
    };
  }

  private emptyTable(competitionId: string, fencerCount: number): DirectEliminationTable {
    return {
      id: `table-${Date.now()}`,
      competitionId,
      name: 'Tableau principal',
      size: this.getBracketSize(fencerCount),
      maxScore: 15,
      nodes: [],
      isComplete: false,
      ranking: [],
      firstPlace: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private getBracketSize(fencerCount: number): number {
    const sizes = [2, 4, 8, 16, 32, 64, 128, 256];
    return sizes.find(s => s >= fencerCount) ?? 256;
  }
}
