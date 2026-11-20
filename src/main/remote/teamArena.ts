/**
 * BellePoule Modern - Format arène Sabre Laser équipe : saisie temps réel (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { Weapon } from '../../shared/types';
import { getTeamTargetRule } from '../../shared/domain/teams/teamCalculations';
import {
  getLaserArenaBoutCap,
  isLaserArenaBoutComplete,
} from '../../shared/domain/teams/laserArenaCalculations';
import {
  FIE_RELAY_DURATION_SEC,
  isRelayComplete,
  relayCapFor,
  relayCumul,
  relayWinnerSide,
} from '../../shared/domain/teams/teamRelayLive';
import { getAvailableReasons } from '../../shared/utils/cardSystem';
import type { TeamArenaCard, TeamArenaState } from './types';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface TeamArenaContext {
  readonly db: S['db'];
  readonly io: S['io'];
  readonly teamArenaState: S['teamArenaState'];
  /** Appareil de piste relié à l'arène équipe (#1829) */
  readonly cyranoTeamHook: S['cyranoTeamHook'];
}

/** Diffuse l'état d'une arène équipe (tablettes, écrans) et prévient l'appareil de piste. */
export function broadcastTeamArena(ctx: TeamArenaContext, arenaId: string): void {
  ctx.io
    .to(`team-arena:${arenaId}`)
    .emit('team_arena_state', getPublicTeamArenaState(ctx, arenaId));
  ctx.cyranoTeamHook?.(arenaId);
}

/**
 * Termine l'assaut (relais) en cours : score persisté, passage au suivant s'il en reste.
 * Relais FIE : vainqueur du relais = équipe en tête au cumul ; arène : score de l'assaut.
 */
export function advanceTeamBout(ctx: TeamArenaContext, arenaId: string): boolean {
  const state = ctx.teamArenaState.get(arenaId);
  if (!state) return false;
  const bout = state.bouts[state.currentBoutIndex];
  if (!bout || bout.status === 'finished') return false;
  const scoreA = state.liveScoreA;
  const scoreB = state.liveScoreB;
  const { cumulA, cumulB } = relayCumul(state.bouts, bout, scoreA, scoreB);
  const side =
    state.format === 'fie-relay'
      ? relayWinnerSide(cumulA, cumulB)
      : relayWinnerSide(scoreA, scoreB);
  const winnerId = side === 'A' ? bout.fencerAId : side === 'B' ? bout.fencerBId : null;
  ctx.db.updateTeamBout(bout.id, scoreA, scoreB, 'finished', winnerId);
  bout.scoreA = scoreA;
  bout.scoreB = scoreB;
  bout.status = 'finished';
  bout.winnerId = winnerId;
  state.currentBoutIndex = state.bouts.findIndex(b => b.status !== 'finished');
  state.liveScoreA = 0;
  state.liveScoreB = 0;
  state.elapsedAccumulatedSec = 0;
  state.timerStartedAt = null;
  broadcastTeamArena(ctx, arenaId);
  return true;
}

// ── Format arène Sabre Laser équipe : saisie temps réel ──────────────────────
// API publique appelée depuis les IPC handlers (renderer → main → ici), suivant
// le même modèle que les arènes individuelles mais sur un état séparé.

/** Assigne une rencontre d'équipe à une arène pour saisie temps réel. */
export function setTeamArenaMatch(
  ctx: TeamArenaContext,
  arenaId: string,
  matchId: string,
  isLaserPoints: boolean
): boolean {
  const detail = ctx.db.getTeamMatchDetail(matchId);
  if (!detail) return false;
  const competition = ctx.db.getCompetition(detail.competitionId);
  const settings = competition?.settings;
  const weapon = (competition?.weapon ?? Weapon.EPEE) as Weapon;
  const rule = getTeamTargetRule(
    weapon,
    settings?.minTeamSize ?? 3,
    settings?.laserTeamMode ?? 'touches',
    settings?.teamRelayStepSize ?? 5
  );
  ctx.teamArenaState.set(arenaId, {
    format: settings?.teamFormat === 'laser-arena' ? 'laser-arena' : 'fie-relay',
    weapon,
    relayRule: { stepSize: rule.stepSize, target: rule.target },
    fencerCards: ctx.db.getTeamBoutCards(matchId).map(({ boutId, card }) => ({
      id: card.id,
      boutId,
      fencerId: card.fencerId,
      type: card.type,
      reason: card.reason,
    })),
    matchId: detail.id,
    competitionId: detail.competitionId,
    coords: {
      poolNumber: detail.poolNumber ?? 1,
      round: detail.round ?? null,
      position: detail.position ?? null,
      number: detail.number ?? 1,
    },
    teamAId: detail.teamAId,
    teamAName: detail.teamAName,
    teamBId: detail.teamBId,
    teamBName: detail.teamBName,
    isLaserPoints,
    bouts: detail.bouts,
    currentBoutIndex: detail.bouts.findIndex(b => b.status !== 'finished'),
    liveScoreA: 0,
    liveScoreB: 0,
    elapsedAccumulatedSec: 0,
    timerStartedAt: null,
    cards: ctx.db.getTeamMatchCards(matchId) as TeamArenaCard[],
  });
  broadcastTeamArena(ctx, arenaId);
  return true;
}

/** Retire l'assignation d'une arène (fin de saisie temps réel pour cette arène). */
export function clearTeamArenaMatch(ctx: TeamArenaContext, arenaId: string): void {
  ctx.teamArenaState.delete(arenaId);
  ctx.io.to(`team-arena:${arenaId}`).emit('team_arena_state', null);
  ctx.cyranoTeamHook?.(arenaId);
}

export function teamArenaElapsedSec(state: TeamArenaState): number {
  const running = state.timerStartedAt ? (Date.now() - state.timerStartedAt) / 1000 : 0;
  return state.elapsedAccumulatedSec + running;
}

export function getPublicTeamArenaState(ctx: TeamArenaContext, arenaId: string): unknown {
  const state = ctx.teamArenaState.get(arenaId);
  if (!state) return null;
  const currentBout = state.bouts[state.currentBoutIndex] ?? null;
  const elapsedSec = teamArenaElapsedSec(state);
  const relay = state.format === 'fie-relay';
  const { cumulA, cumulB } = relayCumul(
    state.bouts,
    currentBout,
    state.liveScoreA,
    state.liveScoreB
  );
  const relayCap = currentBout ? relayCapFor(currentBout.boutOrder, state.relayRule) : 0;
  const cap = relay
    ? { maxTouches: relayCap, maxDurationSec: FIE_RELAY_DURATION_SEC }
    : getLaserArenaBoutCap();
  const boutComplete = !currentBout
    ? false
    : relay
      ? isRelayComplete(cumulA, cumulB, relayCap, elapsedSec)
      : isLaserArenaBoutComplete(state.liveScoreA, state.liveScoreB, elapsedSec, cap);
  return {
    format: state.format,
    cumulA,
    cumulB,
    target: state.relayRule.target,
    fencerCards: state.fencerCards,
    cardReasons: relay ? getAvailableReasons(state.weapon) : [],
    matchId: state.matchId,
    teamAId: state.teamAId,
    teamAName: state.teamAName,
    teamBId: state.teamBId,
    teamBName: state.teamBName,
    isLaserPoints: state.isLaserPoints,
    bouts: state.bouts,
    currentBoutIndex: state.currentBoutIndex,
    currentBout,
    liveScoreA: state.liveScoreA,
    liveScoreB: state.liveScoreB,
    elapsedSec,
    timerRunning: state.timerStartedAt !== null,
    cap,
    boutComplete,
    matchComplete: !currentBout,
    cards: state.cards,
    deviceCards: state.deviceCards ?? {},
    cyrano: state.cyrano ?? null,
    blackCardEnabled:
      ctx.db.getCompetition(state.competitionId)?.settings?.blackCardEnabled === true,
  };
}

/** Champs et méthodes du serveur exposés à ce contexte via liveContext (#1896) */
export const TEAM_ARENA_CONTEXT_KEYS = {
  state: ['cyranoTeamHook', 'db', 'io', 'teamArenaState'],
  methods: [],
} as const;
