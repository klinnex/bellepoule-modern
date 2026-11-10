/**
 * BellePoule Modern - Persistance des matchs de poule / tableau en base (extrait de CompetitionView, #1599)
 * Licensed under GPL-3.0
 */
import { useEffect, useRef } from 'react';
import type { Pool } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import type { TableauMatch } from '../components/tableau/tableauTypes';

interface UseMatchDbSyncParams {
  competitionId: string;
  pools: Pool[];
  tableauMatches: TableauMatch[];
  isLoaded: boolean;
  /** Score maximum d'un match de tableau (défaut 15 si non défini) */
  tableMaxScore: number | undefined;
}

/** Répercute en base les scores/statuts de poule modifiés et les matchs de tableau. */
export function useMatchDbSync({
  competitionId,
  pools,
  tableauMatches,
  isLoaded,
  tableMaxScore,
}: UseMatchDbSyncParams) {
  // Sync scores/statuts des matches de poule vers la DB quand ils changent
  const prevPoolsRef = useRef(pools);
  useEffect(() => {
    if (!window.electronAPI?.db?.updateMatch || !isLoaded) return;
    const prev = prevPoolsRef.current;
    prevPoolsRef.current = pools;
    pools.forEach((pool, pIdx) => {
      pool.matches.forEach((match, mIdx) => {
        const prevMatch = prev[pIdx]?.matches[mIdx];
        if (!prevMatch) return;
        if (
          match.status !== prevMatch.status ||
          match.scoreA !== prevMatch.scoreA ||
          match.scoreB !== prevMatch.scoreB
        ) {
          try {
            window
              .electronAPI!.db!.updateMatch(match.id, {
                scoreA: match.scoreA ?? undefined,
                scoreB: match.scoreB ?? undefined,
                status: match.status,
              })
              .catch((e: unknown) =>
                logger.warn(
                  LogCategory.DATABASE,
                  'updateMatch pool failed',
                  e instanceof Error ? e : undefined
                )
              );
          } catch (e: unknown) {
            logger.warn(
              LogCategory.DATABASE,
              'updateMatch pool failed',
              e instanceof Error ? e : undefined
            );
          }
        }
      });
    });
  }, [pools, isLoaded]);

  // Sync matchs tableau vers DB (batch, inclut la 3e place)
  useEffect(() => {
    if (!competitionId || tableauMatches.length === 0) return;
    const maxScore = tableMaxScore ?? 15;
    window.electronAPI.db
      .upsertMultipleTableauMatches(
        competitionId,
        tableauMatches.map(m => ({
          matchId: m.id,
          round: m.round,
          position: m.position,
          fencerAId: m.fencerA?.id ?? null,
          fencerBId: m.fencerB?.id ?? null,
          scoreA:
            m.scoreA != null
              ? { value: m.scoreA, isVictory: m.winner?.id === m.fencerA?.id }
              : null,
          scoreB:
            m.scoreB != null
              ? { value: m.scoreB, isVictory: m.winner?.id === m.fencerB?.id }
              : null,
          status: m.winner ? 'finished' : m.isBye ? 'finished' : 'not_started',
          maxScore,
          isBye: m.isBye,
        }))
      )
      .catch((e: unknown) =>
        logger.warn(
          LogCategory.DATABASE,
          'upsertMultipleTableauMatches failed',
          e instanceof Error ? e : undefined
        )
      );
  }, [tableauMatches, competitionId]);
}
