/**
 * BellePoule Modern - Pistes libérées d'une journée multi-épreuves (#1878) : travail en attente
 * d'une épreuve (poule sans piste ou en file derrière une autre, match de tableau en file) et
 * déplacement de ce travail vers une piste libre. Pur côté file : l'état reste dans le serveur.
 * Licensed under GPL-3.0
 */
import type { ArenaMatch } from '../../shared/types/remote';
import { MatchStatus } from '../../shared/types';
import type { SessionMatch } from './types';
import type { ArenaQueueContext } from './arenaQueue';

/** Travail d'une épreuve qui attend une piste. */
export type WaitingWork =
  | {
      kind: 'pool';
      poolId: string;
      poolNumber: number | null;
      /** Piste où la poule attend en file ; null = aucune piste */
      fromArena: number | null;
    }
  | {
      kind: 'match';
      matchId: string;
      fromArena: number | null;
      fencers: string;
      match: ArenaMatch;
    };

const poolKey = (m: SessionMatch): string =>
  m.poolId || m.pool?.id || `pool-${m.poolNumber || m.number}`;

const arenaNumber = (arenaId: string): number | null => {
  const n = Number(/^arena(\d+)$/.exec(arenaId)?.[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const isPending = (ctx: ArenaQueueContext, m: SessionMatch): boolean => {
  const status = ctx.sessionMatchScores.get(m.id)?.status ?? m.status;
  return status !== MatchStatus.FINISHED && status !== 'finished' && status !== 'in_progress';
};

/** Matchs de poule restant à jouer, dans l'ordre de la feuille. */
function pendingPoolMatches(ctx: ArenaQueueContext, poolId: string): SessionMatch[] {
  return ctx.sessionMatches
    .filter((m: SessionMatch) => !m.isTableau && poolKey(m) === poolId && isPending(ctx, m))
    .sort((a: SessionMatch, b: SessionMatch) => (a.number || 0) - (b.number || 0));
}

const busy = (ctx: ArenaQueueContext, arenaId: string): boolean => {
  const a = ctx.arenas.get(arenaId);
  return !!a?.currentMatch && a.status !== 'finished' && a.currentMatch.status !== 'finished';
};

/**
 * Travail en attente : poules sans piste, poules et matchs de tableau en file derrière une piste
 * occupée. Une poule déjà commencée sur sa piste n'en fait pas partie (elle garde sa piste).
 */
export function listWaitingWork(ctx: ArenaQueueContext): WaitingWork[] {
  if (!ctx.session) return [];
  const out: WaitingWork[] = [];
  const seenPools = new Set<string>();
  const homed = new Set<string>();
  for (const arena of ctx.arenas.values()) {
    const home = ctx.arenaHomePoolId(arena) ?? arena.activePoolId;
    if (home) homed.add(home);
  }
  for (const [arenaId, queue] of ctx.arenaMatchQueue) {
    if (!busy(ctx, arenaId)) continue;
    for (const m of queue) {
      if (m.poolId) {
        if (seenPools.has(m.poolId) || homed.has(m.poolId)) continue;
        seenPools.add(m.poolId);
        const sm = ctx.sessionMatches.find((s: SessionMatch) => poolKey(s) === m.poolId);
        out.push({
          kind: 'pool',
          poolId: m.poolId,
          poolNumber: sm?.poolNumber ?? null,
          fromArena: arenaNumber(arenaId),
        });
      } else {
        out.push({
          kind: 'match',
          matchId: m.id,
          fromArena: arenaNumber(arenaId),
          fencers: `${m.fencerA?.lastName ?? '?'} – ${m.fencerB?.lastName ?? '?'}`,
          match: m,
        });
      }
    }
  }
  // Poules sans piste (plus de poules que de pistes au démarrage de la séance)
  const pools = new Map<string, SessionMatch>();
  for (const m of ctx.sessionMatches as SessionMatch[]) {
    if (m.isTableau) continue;
    const id = poolKey(m);
    if (!pools.has(id)) pools.set(id, m);
  }
  for (const [poolId, sm] of pools) {
    if (seenPools.has(poolId) || homed.has(poolId)) continue;
    const queued = [...ctx.arenaMatchQueue.values()].some(q => q.some(m => m.poolId === poolId));
    if (queued || pendingPoolMatches(ctx, poolId).length === 0) continue;
    out.push({ kind: 'pool', poolId, poolNumber: sm.poolNumber ?? null, fromArena: null });
  }
  return out;
}

/**
 * Déplace une poule vers une piste : ses matchs restants y sont attachés (surcharge par match,
 * respectée par la répartition des poules), la piste d'origine l'oublie. Piste occupée : la
 * poule passe en tête de file. Retourne false si la poule n'a plus rien à jouer.
 */
export function movePoolToArena(ctx: ArenaQueueContext, poolId: string, arenaId: string): boolean {
  const arena = ctx.arenas.get(arenaId);
  const matches = pendingPoolMatches(ctx, poolId);
  if (!arena || matches.length === 0) return false;
  for (const m of matches) ctx.poolMatchArenaOverrides.set(m.id, arenaId);
  for (const [id, queue] of ctx.arenaMatchQueue) {
    const kept = queue.filter(m => m.poolId !== poolId);
    if (kept.length !== queue.length) ctx.arenaMatchQueue.set(id, kept);
  }
  const first = matches.find(m => m.fencerA && m.fencerB);
  if (!first) {
    if (!arena.currentMatch) arena.activePoolId = poolId;
    return true;
  }
  const arenaMatch: ArenaMatch = {
    id: first.id,
    poolId,
    fencerA: first.fencerA!,
    fencerB: first.fencerB!,
    scoreA: 0,
    scoreB: 0,
    status: 'not_started',
    startTime: null,
    endTime: null,
  };
  if (busy(ctx, arenaId)) {
    ctx.arenaMatchQueue.set(arenaId, [arenaMatch, ...(ctx.arenaMatchQueue.get(arenaId) || [])]);
    return true;
  }
  arena.activePoolId = poolId;
  ctx.assignMatchToArena(arenaId, arenaMatch);
  ctx.persistArenaState(arenaId);
  return true;
}

/** Piste imposée à une poule déplacée (tous ses matchs restants surchargés vers la même piste). */
export function forcedPoolArena(ctx: ArenaQueueContext, poolId: string): string | null {
  const matches = pendingPoolMatches(ctx, poolId);
  if (matches.length === 0) return null;
  const first = ctx.poolMatchArenaOverrides.get(matches[0].id);
  if (!first) return null;
  return matches.every(m => ctx.poolMatchArenaOverrides.get(m.id) === first) ? first : null;
}
