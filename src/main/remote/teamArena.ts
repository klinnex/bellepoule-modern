/**
 * BellePoule Modern - Format arène Sabre Laser équipe : saisie temps réel (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import { Weapon } from '../../shared/types';
import { getTeamTargetRule } from '../../features/teams/utils/teamCalculations';
import {
  getLaserArenaBoutCap,
  isLaserArenaBoutComplete,
} from '../../features/teams/utils/laserArenaCalculations';
import {
  FIE_RELAY_DURATION_SEC,
  isRelayComplete,
  relayCapFor,
  relayCumul,
} from '../../features/teams/utils/teamRelayLive';
import { getAvailableReasons } from '../../shared/utils/cardSystem';
import type { TeamArenaCard, TeamArenaState } from './types';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface TeamArenaContext {
  readonly db: S['db'];
  readonly io: S['io'];
  readonly teamArenaState: S['teamArenaState'];
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
  ctx.io
    .to(`team-arena:${arenaId}`)
    .emit('team_arena_state', getPublicTeamArenaState(ctx, arenaId));
  return true;
}

/** Retire l'assignation d'une arène (fin de saisie temps réel pour cette arène). */
export function clearTeamArenaMatch(ctx: TeamArenaContext, arenaId: string): void {
  ctx.teamArenaState.delete(arenaId);
  ctx.io.to(`team-arena:${arenaId}`).emit('team_arena_state', null);
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
    blackCardEnabled:
      ctx.db.getCompetition(state.competitionId)?.settings?.blackCardEnabled === true,
  };
}
