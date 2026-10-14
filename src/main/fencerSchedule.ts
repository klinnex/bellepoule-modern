/**
 * Planning personnel d'un tireur pour la page publique /tireur/:id (#1078) :
 * prochain match (piste, adversaire), matchs joués avec scores.
 * Fonction pure : le serveur lui passe les matchs de session et les arènes.
 * Licensed under GPL-3.0
 */

interface MinimalFencer {
  id: string;
  lastName?: string;
  firstName?: string;
  club?: string;
}

export interface ScheduleMatchInput {
  id: string;
  number?: number;
  poolId?: string;
  pool?: { id?: string };
  fencerA?: MinimalFencer | null;
  fencerB?: MinimalFencer | null;
  scoreA?: number | { value?: number | null } | null;
  scoreB?: number | { value?: number | null } | null;
  status?: string;
}

export interface ScheduleArenaInput {
  number: number;
  activePoolId?: string;
  currentMatchId?: string;
  currentPoolId?: string;
}

export interface FencerScheduleEntry {
  matchId: string;
  order: number;
  opponent: string;
  opponentClub: string;
  myScore: number | null;
  opponentScore: number | null;
  status: 'finished' | 'current' | 'pending';
  victory: boolean | null;
  arena: number | null;
}

export interface FencerSchedule {
  fencer: { id: string; name: string; club: string };
  next: FencerScheduleEntry | null;
  /** Matchs restants avant le sien sur la même piste (null si inconnu). */
  matchesBeforeNext: number | null;
  matches: FencerScheduleEntry[];
  victories: number;
  defeats: number;
}

const displayName = (f?: MinimalFencer | null) =>
  f ? [String(f.lastName ?? '').toUpperCase(), f.firstName].filter(Boolean).join(' ') : '—';

const scoreValue = (s: ScheduleMatchInput['scoreA']): number | null =>
  s === null || s === undefined ? null : typeof s === 'object' ? (s.value ?? null) : s;

const poolOf = (m: ScheduleMatchInput) => m.poolId ?? m.pool?.id;

export function buildFencerSchedule(
  fencerId: string,
  matches: ScheduleMatchInput[],
  arenas: ScheduleArenaInput[]
): FencerSchedule | null {
  const mine = matches.filter(m => m.fencerA?.id === fencerId || m.fencerB?.id === fencerId);
  if (mine.length === 0) return null;
  const sample = mine[0].fencerA?.id === fencerId ? mine[0].fencerA : mine[0].fencerB;

  const arenaForPool = (poolId?: string) =>
    poolId
      ? (arenas.find(a => a.activePoolId === poolId || a.currentPoolId === poolId)?.number ?? null)
      : null;
  const isCurrent = (m: ScheduleMatchInput) => arenas.some(a => a.currentMatchId === m.id);

  const entries: FencerScheduleEntry[] = mine
    .map((m, i) => {
      const isA = m.fencerA?.id === fencerId;
      const opp = isA ? m.fencerB : m.fencerA;
      const finished = m.status === 'finished';
      const my = finished ? scoreValue(isA ? m.scoreA : m.scoreB) : null;
      const theirs = finished ? scoreValue(isA ? m.scoreB : m.scoreA) : null;
      return {
        matchId: m.id,
        order: m.number ?? i + 1,
        opponent: displayName(opp),
        opponentClub: opp?.club ?? '',
        myScore: my,
        opponentScore: theirs,
        status: finished ? 'finished' : isCurrent(m) ? 'current' : 'pending',
        victory: finished && my !== null && theirs !== null ? my > theirs : null,
        arena: arenaForPool(poolOf(m)),
      } as FencerScheduleEntry;
    })
    .sort((a, b) => a.order - b.order);

  const next =
    entries.find(e => e.status === 'current') ?? entries.find(e => e.status === 'pending') ?? null;

  // Matchs encore à jouer avant le sien dans la même poule (ordre des matchs)
  let matchesBeforeNext: number | null = null;
  if (next) {
    const nextInput = mine.find(m => m.id === next.matchId);
    const pool = nextInput ? poolOf(nextInput) : undefined;
    if (pool) {
      matchesBeforeNext = matches.filter(
        m =>
          poolOf(m) === pool &&
          m.status !== 'finished' &&
          (m.number ?? 0) < next.order &&
          m.id !== next.matchId
      ).length;
    }
  }

  return {
    fencer: { id: fencerId, name: displayName(sample), club: sample?.club ?? '' },
    next,
    matchesBeforeNext,
    matches: entries,
    victories: entries.filter(e => e.victory === true).length,
    defeats: entries.filter(e => e.victory === false).length,
  };
}
