/**
 * BellePoule Modern - Analytics Service
 * Business logic for analytics and statistics
 * Licensed under GPL-3.0
 */

import { Fencer, FencerCompetitionStats } from '../../../shared/types';
import { calculateFencerPoolStats } from '../../../shared/utils/poolCalculations';

export interface CompetitionStats {
  totalFencers: number;
  totalMatches: number;
  completedMatches: number;
  averageMatchDuration: number;
  topFencers: Array<{
    fencer: Fencer;
    victories: number;
    touchesScored: number;
    touchesReceived: number;
  }>;
}

export class AnalyticsService {
  /**
   * Get comprehensive competition statistics from DB
   */
  async getCompetitionStats(competitionId: string): Promise<CompetitionStats> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) {
      return { totalFencers: 0, totalMatches: 0, completedMatches: 0, averageMatchDuration: 0, topFencers: [] };
    }

    const fencers = await window.electronAPI.db.getFencersByCompetition(competitionId);
    const phases = await window.electronAPI.db.getPhasesByCompetition(competitionId);

    let allMatches: Awaited<ReturnType<typeof window.electronAPI.db.getMatchesByPool>>[] = [];
    for (const phase of phases) {
      const pools = await window.electronAPI.db.getPoolsByPhase(phase.id);
      for (const pool of pools) {
        const matches = await window.electronAPI.db.getMatchesByPool(pool.id);
        allMatches = allMatches.concat(matches as any);
      }
    }

    const flatMatches = (allMatches as any[]).flat();
    const completedMatches = flatMatches.filter((m: any) => m.status === 'finished');

    const totalDuration = completedMatches.reduce((sum: number, m: any) => sum + (m.duration ?? 0), 0);
    const averageMatchDuration =
      completedMatches.length > 0 ? totalDuration / completedMatches.length : 0;

    // Build fencer stats using match data
    const topFencers = fencers
      .map(fencer => {
        const stats = calculateFencerPoolStats(fencer, flatMatches as any);
        return { fencer, victories: stats.victories, touchesScored: stats.touchesScored, touchesReceived: stats.touchesReceived };
      })
      .filter(f => f.victories > 0 || f.touchesScored > 0)
      .sort((a, b) => b.victories - a.victories || b.touchesScored - a.touchesScored)
      .slice(0, 10);

    return {
      totalFencers: fencers.length,
      totalMatches: flatMatches.length,
      completedMatches: completedMatches.length,
      averageMatchDuration,
      topFencers,
    };
  }

  /**
   * Get pool statistics from DB
   */
  async getPoolStats(poolId: string): Promise<{
    totalMatches: number;
    completedMatches: number;
    averageDuration: number;
  }> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) {
      return { totalMatches: 0, completedMatches: 0, averageDuration: 0 };
    }

    const matches = await window.electronAPI.db.getMatchesByPool(poolId);
    const completed = matches.filter(m => m.status === 'finished');
    const totalDuration = completed.reduce((sum, m) => sum + ((m as any).duration ?? 0), 0);

    return {
      totalMatches: matches.length,
      completedMatches: completed.length,
      averageDuration: completed.length > 0 ? totalDuration / completed.length : 0,
    };
  }

  /**
   * Statistiques détaillées par combattant (touches, cartons, sorties, durée)
   */
  async getCompetitionFencerStats(competitionId: string): Promise<FencerCompetitionStats[]> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) return [];
    return window.electronAPI.db.getCompetitionFencerStats(competitionId) as Promise<FencerCompetitionStats[]>;
  }

  // Alias utilisé par useAnalyticsStore
  async getFencerStats(competitionId: string): Promise<FencerCompetitionStats[]> {
    return this.getCompetitionFencerStats(competitionId);
  }

  async getFencerCompetitionStats(fencerId: string): Promise<FencerCompetitionStats | null> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) return null;
    return window.electronAPI.db.getFencerCompetitionStats(fencerId) as Promise<FencerCompetitionStats>;
  }

  // Stub minimal pour getCompetitionMetrics (appelé par le store)
  async getCompetitionMetrics(competitionId: string): Promise<{ totalFencers: number; completedMatches: number }> {
    const stats = await this.getCompetitionStats(competitionId);
    return { totalFencers: stats.totalFencers, completedMatches: stats.completedMatches };
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(competitionId: string, format: 'json' | 'csv' | 'pdf'): Promise<Blob> {
    const stats = await this.getCompetitionStats(competitionId);

    if (format === 'csv') {
      const headers = ['Nom', 'Prénom', 'Club', 'Victoires', 'Touches marquées', 'Touches reçues'];
      const rows = stats.topFencers.map(f => [
        f.fencer.lastName, f.fencer.firstName ?? '', f.fencer.club ?? '',
        f.victories, f.touchesScored, f.touchesReceived,
      ]);
      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      return new Blob([csv], { type: 'text/csv;charset=utf-8' });
    }

    const content = format === 'json' ? JSON.stringify(stats, null, 2) : '';
    return new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' });
  }
}
