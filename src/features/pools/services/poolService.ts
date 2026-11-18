/**
 * BellePoule Modern - Pool Service
 * Business logic for pool management
 * Licensed under GPL-3.0
 */

import { Pool, PoolRanking } from '../../../shared/types';
import { PoolGenerationConfig, ScoreUpdateDTO } from '../types/pool.types';
import {
  distributeFencersToPoolsSerpentine,
  calculatePoolRanking,
} from '../../../shared/utils/poolCalculations';
import { planPoolBouts } from '../../../shared/utils/poolBoutOrder';
import { PoolCalculator } from './poolCalculator';

export class PoolService {
  /**
   * Get all pools for a competition via available phase/pool relations
   */
  async getByCompetition(competitionId: string): Promise<Pool[]> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) return [];

    const phases = await window.electronAPI.db.getPhasesByCompetition(competitionId);
    const pools: Pool[] = [];

    for (const phase of phases) {
      const phasePools = await window.electronAPI.db.getPoolsByPhase(phase.id);
      pools.push(...phasePools);
    }

    return pools;
  }

  /**
   * Generate pools for a competition based on configuration
   */
  async generatePools(competitionId: string, config: PoolGenerationConfig): Promise<Pool[]> {
    if (typeof window === 'undefined' || !window.electronAPI?.db) return [];

    const fencers = await window.electronAPI.db.getFencersByCompetition(competitionId);
    if (!fencers.length) return [];

    const { poolCount } = PoolCalculator.calculatePoolDistribution(
      fencers.length,
      config.minPoolSize,
      config.maxPoolSize
    );

    const separation = config.strategy === 'club_balanced' ? (['byClub'] as const) : [];
    const fencerGroups = distributeFencersToPoolsSerpentine(fencers, poolCount, [...separation]);

    // Create or reuse the pool phase
    const existingPhases = await window.electronAPI.db.getPhasesByCompetition(competitionId);
    const poolPhase =
      existingPhases.find(p => p.type === 'pool') ??
      (await window.electronAPI.db.createPhase(competitionId, 'pool', 0, 'Poules'));

    const pools: Pool[] = [];

    for (let i = 0; i < fencerGroups.length; i++) {
      // Coéquipiers : numéros réservés et tables FIE o.70 (#1964)
      const plan = planPoolBouts(fencerGroups[i], ['byClub']);
      const group = plan.positions;
      const pool = await window.electronAPI.db.createPool(poolPhase.id, i + 1);

      for (let j = 0; j < group.length; j++) {
        await window.electronAPI.db.addFencerToPool(pool.id, group[j].id, j);
      }

      const matches = await Promise.all(
        plan.bouts.map(([a, b], idx) =>
          window.electronAPI.db.createMatch({
            number: idx + 1,
            fencerAId: group[a - 1].id,
            fencerBId: group[b - 1].id,
            maxScore: 5,
            poolId: pool.id,
          })
        )
      );

      pools.push({ ...pool, fencers: group, matches });
    }

    return pools;
  }

  /**
   * Update match score
   */
  async updateScore(poolId: string, matchId: string, data: ScoreUpdateDTO): Promise<void> {
    if (typeof window !== 'undefined' && window.electronAPI?.db?.updateMatch) {
      await window.electronAPI.db.updateMatch(matchId, {
        scoreA:
          data.scoreA !== undefined
            ? {
                value: data.scoreA,
                isVictory: data.winner === 'A',
                isAbstention: data.specialStatus === 'abandon' && data.winner !== 'A',
                isForfait: data.specialStatus === 'forfait' && data.winner !== 'A',
                isExclusion: data.specialStatus === 'exclusion' && data.winner !== 'A',
              }
            : undefined,
        scoreB:
          data.scoreB !== undefined
            ? {
                value: data.scoreB,
                isVictory: data.winner === 'B',
                isAbstention: data.specialStatus === 'abandon' && data.winner !== 'B',
                isForfait: data.specialStatus === 'forfait' && data.winner !== 'B',
                isExclusion: data.specialStatus === 'exclusion' && data.winner !== 'B',
              }
            : undefined,
        status: data.status,
      });
    }
  }

  /**
   * Compute overall ranking across all pools of a competition
   */
  async computeOverallRanking(competitionId: string): Promise<PoolRanking[]> {
    const pools = await this.getByCompetition(competitionId);
    if (!pools.length) return [];

    const allRankings = pools.flatMap(pool => calculatePoolRanking(pool));

    // Sort by victories ratio desc, then index desc
    allRankings.sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.index - a.index;
    });

    // Assign overall ranks
    allRankings.forEach((r, i) => {
      r.rank = i + 1;
    });

    return allRankings;
  }
}
