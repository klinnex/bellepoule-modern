/**
 * BellePoule Modern - Synchronisation des poules poussées par le renderer (#1240)
 * Extrait de RemoteScoreServer : tireurs de poule, matchs de poule en mémoire et
 * notification des tablettes d'arène qui affichent une poule modifiée.
 * Licensed under GPL-3.0
 */
import { MatchStatus } from '../../shared/types';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface PoolSyncContext {
  readonly arenas: S['arenas'];
  readonly db: S['db'];
  readonly io: S['io'];
  readonly poolFencersCache: S['poolFencersCache'];
  sessionMatches: S['sessionMatches'];
  readonly sessionMatchScores: S['sessionMatchScores'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly resolveReferee: S['resolveReferee'];
}

export function updatePoolFencers(
  ctx: PoolSyncContext,
  updates: Array<{ poolId: string; fencers: unknown[] }>
): void {
  for (const { poolId, fencers } of updates) {
    if (fencers && fencers.length > 0) {
      ctx.poolFencersCache.set(poolId, fencers);
    }
  }
  // Notifier les tablettes connectées sur une arène affichant une poule modifiée
  for (const { poolId } of updates) {
    for (const [aId, arena] of ctx.arenas) {
      if (arena.currentMatch?.poolId !== poolId) continue;
      const updatedFencers = ctx.poolFencersCache.get(poolId) ?? [];
      const inMemory = ctx.sessionMatches
        .filter(m => (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId)
        .sort((a, b) => (a.number || 0) - (b.number || 0));
      const matches: Array<{ status: string }> =
        inMemory.length > 0
          ? inMemory.map(m => {
              const u = ctx.sessionMatchScores.get(m.id);
              return u ? { ...m, ...u } : m;
            })
          : ctx.db.getMatchesByPool(poolId);
      const isComplete = matches.every(m => m.status === MatchStatus.FINISHED);
      ctx.io
        .to(`pool:${aId}`)
        .emit(`pool:${aId}:update`, { poolId, fencers: updatedFencers, matches, isComplete });
      break;
    }
  }
}

export function syncPoolMatches(
  ctx: PoolSyncContext,
  poolsData: Array<{ poolId: string; matches: unknown[] }>
): void {
  const updatedPoolIds = new Set<string>();

  for (const { poolId, matches } of poolsData) {
    ctx.sessionMatches = [
      ...ctx.sessionMatches.filter(
        m =>
          m.isTableau || (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) !== poolId
      ),
      ...matches,
    ];
    updatedPoolIds.add(poolId);
  }

  for (const poolId of updatedPoolIds) {
    const fencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
    const inMemory = ctx.sessionMatches
      .filter(
        m =>
          !m.isTableau && (m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`) === poolId
      )
      .sort((a, b) => (a.number || 0) - (b.number || 0));
    const poolMatches: Array<{ status: string }> =
      inMemory.length > 0
        ? inMemory.map(m => {
            const u = ctx.sessionMatchScores.get(m.id);
            return u ? { ...m, ...u } : m;
          })
        : ctx.db.getMatchesByPool(poolId);
    const isComplete =
      poolMatches.length > 0 && poolMatches.every(m => m.status === MatchStatus.FINISHED);
    for (const [aId, arena] of ctx.arenas) {
      if ((arena.currentMatch?.poolId ?? arena.activePoolId) !== poolId) continue;
      if (arena.currentMatch) {
        const currentMatch = arena.currentMatch;
        const updatedMatch = ctx.sessionMatches.find(m => m.id === currentMatch.id);
        if (updatedMatch?.refereeId && updatedMatch.refereeId !== currentMatch.referee?.id) {
          const resolvedRef = ctx.resolveReferee(updatedMatch.refereeId);
          arena.currentMatch = {
            ...currentMatch,
            ...(resolvedRef ? { referee: resolvedRef } : {}),
          };
          ctx.broadcastArenaUpdate(aId, {
            arenaId: aId,
            match: arena.currentMatch,
            scoreA: arena.currentMatch.scoreA,
            scoreB: arena.currentMatch.scoreB,
            status: arena.status,
          });
        }
      }
      ctx.io
        .to(`pool:${aId}`)
        .emit(`pool:${aId}:update`, { poolId, fencers, matches: poolMatches, isComplete });
    }
  }
}
