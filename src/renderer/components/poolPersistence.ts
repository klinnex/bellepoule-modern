/**
 * BellePoule Modern - Persistance des poules générées en base
 * Licensed under GPL-3.0
 */

import { logger, LogCategory } from '@shared/services/logger';
import { Pool } from '../../shared/types';

/** Persiste les poules dans les tables DB (pools, pool_fencers, matches) */
export async function persistPools(competitionId: string, generatedPools: Pool[]): Promise<void> {
  const db = window.electronAPI?.db;
  if (!db) return;
  try {
    const phases = await db.getPhasesByCompetition(competitionId);
    let poolPhase = phases.find(p => p.type === 'pool');
    if (!poolPhase) {
      poolPhase = await db.createPhase(competitionId, 'pool', 1, 'Poules');
    }
    await db.clearPoolsForPhase(poolPhase.id);
    for (const pool of generatedPools) {
      await db.createPool(poolPhase.id, pool.number, pool.id);
      pool.fencers.forEach((fencer, pos) => {
        db.addFencerToPool(pool.id, fencer.id, pos);
      });
      for (const match of pool.matches) {
        await db.createMatch(
          {
            id: match.id,
            number: match.number,
            fencerAId: match.fencerA?.id,
            fencerBId: match.fencerB?.id,
            maxScore: match.maxScore,
          },
          pool.id
        );
      }
    }
  } catch (e) {
    logger.error(LogCategory.DATABASE, 'persistPoolsToDB failed', e as Error);
  }
}
