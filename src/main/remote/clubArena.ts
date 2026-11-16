/**
 * BellePoule Modern - Mode Club (#1872) : saisie distante des combats libres.
 * Les combats du club sont envoyés aux arènes du serveur d'entraînement (tablettes
 * arbitre /arene{N}/arbitre) ; le score final revient dans la séance du club.
 * Licensed under GPL-3.0
 */
import type { Fencer } from '../../shared/types';
import type { Arena, ArenaMatch } from '../../shared/types/remote';
import type { ClubBout, ClubIdentifyResult, ClubMember } from '../../shared/types/club';
import type { DatabaseManager } from '../../database';
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

// ─── Identification par cartes sur la tablette arbitre (#1872) ─────────────────

/** Séance du club reliée au serveur d'entraînement (scan des cartes depuis les tablettes) */
let linkedSessionId: string | null = null;

export function setLinkedClubSession(sessionId: string | null): void {
  linkedSessionId = typeof sessionId === 'string' && sessionId ? sessionId : null;
}

export function linkedClubSession(): string | null {
  return linkedSessionId;
}

/** Accès minimal au serveur et au club (testable sans Electron) */
export interface ClubIdentifyDeps {
  club: Pick<
    DatabaseManager['club'],
    | 'getSession'
    | 'findMemberByCardCode'
    | 'setAttendance'
    | 'createBout'
    | 'startBout'
    | 'listBouts'
    | 'cancelBout'
  >;
  getArena(arenaId: string): Arena | null | undefined;
  assignMatchToArena(arenaId: string, match: ArenaMatch): void;
}

const fullName = (m: ClubMember | null, fallback: string) =>
  m ? `${m.lastName} ${m.firstName}`.trim() : fallback;

/** Séance reliée et ouverte, sinon null */
export function linkedOpenSession(deps: Pick<ClubIdentifyDeps, 'club'>) {
  if (!linkedSessionId) return null;
  const s = deps.club.getSession(linkedSessionId);
  return s && s.status === 'open' ? s : null;
}

/**
 * Cartes scannées sur la tablette de la piste `arenaNumber` : codes A et B (null = passé).
 * Deux membres reconnus : pointés présents, combat enregistré dans la séance et placé
 * sur la piste. Un ou aucun : match d'entraînement libre (non enregistré) avec les noms connus.
 */
export function identifyClubBout(
  deps: ClubIdentifyDeps,
  arenaNumber: number,
  codeA: string | null,
  codeB: string | null
): ClubIdentifyResult {
  const session = linkedOpenSession(deps);
  if (!session) return { ok: false, error: 'no_session' };
  if (!Number.isInteger(arenaNumber) || arenaNumber < 1) return { ok: false, error: 'no_arena' };
  const arenaId = `arena${arenaNumber}`;
  const arena = deps.getArena(arenaId);
  if (!arena) return { ok: false, error: 'no_arena' };
  if (arena.status === 'in_progress') return { ok: false, error: 'busy' };

  const lookup = (code: string | null): ClubMember | null | 'unknown' => {
    if (!code) return null;
    return deps.club.findMemberByCardCode(code, session.clubId) ?? 'unknown';
  };
  const a = lookup(codeA);
  if (a === 'unknown') return { ok: false, error: 'unknown_card', side: 'A' };
  const b = lookup(codeB);
  if (b === 'unknown') return { ok: false, error: 'unknown_card', side: 'B' };
  if (a && b && a.id === b.id) return { ok: false, error: 'same_member' };

  // Combat club non commencé déjà prévu sur la piste : remplacé par le nouveau
  for (const old of deps.club.listBouts({ sessionId: session.id, includeUnfinished: true })) {
    const live = old.status === 'pending' || old.status === 'in_progress';
    if (live && (old.strip === arenaNumber || clubBoutIdOf(arena.currentMatch?.id) === old.id)) {
      deps.club.cancelBout(old.id);
    }
  }

  if (a && b) {
    for (const m of [a, b]) {
      if (!session.attendeeIds.includes(m.id)) deps.club.setAttendance(session.id, m.id, true);
    }
    const bout = deps.club.createBout({
      sessionId: session.id,
      memberAId: a.id,
      memberBId: b.id,
      strip: arenaNumber,
      entryMode: 'referee',
    });
    const started = deps.club.startBout(bout.id) ?? bout;
    deps.assignMatchToArena(arenaId, clubBoutToArenaMatch(started, a, b));
    return { ok: true, recorded: true, nameA: fullName(a, ''), nameB: fullName(b, '') };
  }

  // Identification partielle : combat libre, non comptabilisé dans les statistiques
  const match = createTrainingMatch();
  if (a) match.fencerA = asFencer(a, 'A');
  if (b) match.fencerB = asFencer(b, 'B');
  deps.assignMatchToArena(arenaId, match);
  return {
    ok: true,
    recorded: false,
    nameA: fullName(a, match.fencerA.lastName),
    nameB: fullName(b, match.fencerB.lastName),
  };
}
