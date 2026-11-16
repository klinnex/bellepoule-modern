/**
 * BellePoule Modern - Mode Club (#1872) : saisie distante des combats libres.
 * Les combats du club sont envoyés aux arènes du serveur d'entraînement (tablettes
 * arbitre /arene{N}/arbitre) ; le score final revient dans la séance du club.
 * Licensed under GPL-3.0
 */
import type { Fencer } from '../../shared/types';
import type { ArenaMatch } from '../../shared/types/remote';
import type { ClubBout, ClubMember } from '../../shared/types/club';
import type { RemoteScoreServer } from '../remoteScoreServer';
import { createTrainingMatch } from './trainingSession';

export const CLUB_MATCH_PREFIX = 'club:';

export type PushResult = 'ok' | 'no_server' | 'no_arena' | 'busy';

/** Identifiant du combat club porté par un match d'arène, sinon null */
export function clubBoutIdOf(matchId: string | undefined | null): string | null {
  return matchId?.startsWith(CLUB_MATCH_PREFIX) ? matchId.slice(CLUB_MATCH_PREFIX.length) : null;
}

const asFencer = (m: ClubMember | null, fallback: string): Fencer =>
  ({
    id: m?.id ?? fallback,
    firstName: m?.firstName ?? '',
    lastName: m?.lastName ?? fallback,
    club: '',
    ref: 0,
    ...(m?.photo ? { photo: m.photo } : {}),
  }) as Fencer;

export function clubBoutToArenaMatch(
  bout: ClubBout,
  a: ClubMember | null,
  b: ClubMember | null
): ArenaMatch {
  return {
    id: `${CLUB_MATCH_PREFIX}${bout.id}`,
    poolId: '__training__',
    fencerA: asFencer(a, 'A'),
    fencerB: asFencer(b, 'B'),
    scoreA: 0,
    scoreB: 0,
    status: 'not_started',
    startTime: null,
    endTime: null,
  };
}

/** Place le combat sur l'arène de sa piste, sauf si un match y est en cours */
export function pushClubBout(
  server: RemoteScoreServer | undefined,
  bout: ClubBout,
  a: ClubMember | null,
  b: ClubMember | null
): PushResult {
  if (!server || !server.hasSession()) return 'no_server';
  if (!bout.strip) return 'no_arena';
  const arenaId = `arena${bout.strip}`;
  const arena = server.getArena(arenaId);
  if (!arena) return 'no_arena';
  const current = arena.currentMatch;
  if (arena.status === 'in_progress' && clubBoutIdOf(current?.id) !== bout.id) return 'busy';
  if (clubBoutIdOf(current?.id) === bout.id) return 'ok';
  server.assignMatchToArena(arenaId, clubBoutToArenaMatch(bout, a, b));
  return 'ok';
}

/** Combat annulé côté club : l'arène reprend un match d'entraînement libre */
export function releaseClubBout(server: RemoteScoreServer | undefined, boutId: string): void {
  if (!server) return;
  for (const arena of server.getAllArenas()) {
    if (clubBoutIdOf(arena.currentMatch?.id) === boutId && arena.status !== 'in_progress') {
      server.assignMatchToArena(arena.id, createTrainingMatch());
    }
  }
}
