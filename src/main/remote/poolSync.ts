/**
 * BellePoule Modern - Synchronisation des poules poussées par le renderer (#1240)
 * Extrait de RemoteScoreServer : tireurs de poule, matchs de poule en mémoire et
 * notification des tablettes d'arène qui affichent une poule modifiée.
 * Licensed under GPL-3.0
 */
import type { SessionMatch } from './types';
import { buildPoolScores } from './poolScore';
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
      ...(matches as SessionMatch[]),
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

/** Diffuse l'état d'une poule (tireurs, matchs avec scores en mémoire) aux tablettes qui l'affichent. */
function notifyPoolUpdate(ctx: PoolSyncContext, poolId: string): void {
  const fencers = ctx.poolFencersCache.get(poolId) ?? ctx.db.getPoolFencers(poolId);
  const poolMatches = ctx.sessionMatches
    .filter(m => !m.isTableau && (m.poolId ?? m.pool?.id) === poolId)
    .sort((a, b) => (a.number || 0) - (b.number || 0))
    .map(m => {
      const u = ctx.sessionMatchScores.get(m.id);
      return u ? { ...m, ...u } : m;
    });
  const isComplete =
    poolMatches.length > 0 &&
    poolMatches.every(m => m.status === MatchStatus.FINISHED || m.status === 'finished');
  for (const [aId, arena] of ctx.arenas) {
    if ((arena.currentMatch?.poolId ?? arena.activePoolId) === poolId) {
      ctx.io
        .to(`pool:${aId}`)
        .emit(`pool:${aId}:update`, { poolId, fencers, matches: poolMatches, isComplete });
    }
  }
}

export function resetPoolMatch(ctx: PoolSyncContext, matchId: string): void {
  ctx.sessionMatchScores.delete(matchId);
  ctx.io.emit('match:reset', { matchId });

  const match = ctx.sessionMatches.find(m => m.id === matchId);
  const poolId = match?.poolId ?? match?.pool?.id;
  if (poolId) notifyPoolUpdate(ctx, poolId);
}

/**
 * Marque un match de poule comme terminé depuis l'UI principale (ex: auto-fill).
 * Met à jour sessionMatchScores + sessionMatches, libère l'arène si nécessaire,
 * puis diffuse la mise à jour à la tablette.
 */
export function finishPoolMatch(
  ctx: PoolSyncContext,
  matchId: string,
  ...score: Parameters<typeof buildPoolScores>
): void {
  ctx.sessionMatchScores.set(matchId, {
    ...buildPoolScores(...score),
    status: MatchStatus.FINISHED,
  });

  const matchIdx = ctx.sessionMatches.findIndex(m => m.id === matchId);
  if (matchIdx >= 0) {
    ctx.sessionMatches[matchIdx].status = MatchStatus.FINISHED;
  }

  // Si le match est actif sur une arène, la marquer terminée
  for (const [arenaId, arena] of ctx.arenas) {
    if (arena.currentMatch?.id === matchId && arena.status !== 'finished') {
      arena.status = 'finished';
      arena.currentMatch.status = 'finished';
      ctx.broadcastArenaUpdate(arenaId, {
        arenaId,
        status: 'finished',
        match: arena.currentMatch,
        scoreA: arena.currentMatch.scoreA,
        scoreB: arena.currentMatch.scoreB,
        fencerA: arena.currentMatch.fencerA,
        fencerB: arena.currentMatch.fencerB,
      });
      break;
    }
  }

  ctx.io.emit('match:finished', { matchId });

  const match = matchIdx >= 0 ? ctx.sessionMatches[matchIdx] : null;
  const poolId = match?.poolId ?? match?.pool?.id;
  if (poolId) notifyPoolUpdate(ctx, poolId);
}
