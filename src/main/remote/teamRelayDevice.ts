/**
 * BellePoule Modern - Relais FIE par équipes piloté par un appareil de piste (#1829)
 * Opérations de l'arène équipe (`/equipe{N}`, relais FIE en direct #1086) utilisées par le
 * PisteHub. L'appareil donne le score cumulé de l'équipe ; l'arène tient le score du relais
 * en cours (`liveScoreA/B`) : relais = cumul reçu − relais précédents terminés.
 * Licensed under GPL-3.0
 */

import { FIE_RELAY_DURATION_SEC, relayCumul } from '../../features/teams/utils/teamRelayLive';
import { logger, LogCategory } from '../../shared/services/logger';
import { advanceTeamBout, broadcastTeamArena, type TeamArenaContext } from './teamArena';
import type { TeamArenaBout, TeamArenaState } from './types';

/** Relais en cours d'une arène équipe, vu par l'appareil. */
export interface TeamRelayView {
  state: TeamArenaState;
  /** Relais en cours ; null quand la rencontre est terminée */
  bout: TeamArenaBout | null;
  /** Relais précédent terminé (rappel PREV, END répété) */
  previous: TeamArenaBout | null;
  cumulA: number;
  cumulB: number;
  /** Dernier relais de la rencontre */
  isLast: boolean;
}

/** Relais FIE en direct sur l'arène équipe ; null hors relais FIE (format arène laser). */
export function teamRelayView(ctx: TeamArenaContext, arenaId: string): TeamRelayView | null {
  const state = ctx.teamArenaState.get(arenaId);
  if (!state || state.format !== 'fie-relay') return null;
  const bout = state.bouts[state.currentBoutIndex] ?? null;
  const { cumulA, cumulB } = relayCumul(state.bouts, bout, state.liveScoreA, state.liveScoreB);
  const finished = state.bouts.filter(
    b => b.status === 'finished' && (!bout || b.boutOrder < bout.boutOrder)
  );
  const maxOrder = Math.max(0, ...state.bouts.map(b => b.boutOrder));
  return {
    state,
    bout,
    previous: finished[finished.length - 1] ?? null,
    cumulA,
    cumulB,
    isLast: !!bout && bout.boutOrder === maxOrder,
  };
}

export interface RelayDeviceUpdate {
  /** Score cumulé de l'équipe A / B */
  cumulA: number;
  cumulB: number;
  /** Cartons montrés par l'appareil (relais en cours) */
  cardsA?: string[];
  cardsB?: string[];
  /** Chrono de l'appareil (secondes restantes) et état */
  stopwatch?: number;
  running?: boolean;
}

/**
 * État de l'appareil → relais en cours : score du relais, cartons, chrono. Refus (tracé) si le
 * cumul reçu est inférieur à celui des relais déjà terminés.
 */
export function applyRelayDeviceState(
  ctx: TeamArenaContext,
  arenaId: string,
  update: RelayDeviceUpdate
): { accepted: boolean; changed: boolean } {
  const view = teamRelayView(ctx, arenaId);
  if (!view?.bout) return { accepted: false, changed: false };
  const { state, bout } = view;
  const liveA = update.cumulA - (view.cumulA - state.liveScoreA);
  const liveB = update.cumulB - (view.cumulB - state.liveScoreB);
  if (liveA < 0 || liveB < 0) {
    logger.warn(
      LogCategory.NETWORK,
      `Équipes ${arenaId} : cumul de l'appareil ${update.cumulA}-${update.cumulB} inférieur aux ` +
        `relais terminés (${view.cumulA - state.liveScoreA}-${view.cumulB - state.liveScoreB}), ignoré`
    );
    return { accepted: false, changed: false };
  }
  let changed = liveA !== state.liveScoreA || liveB !== state.liveScoreB;
  state.liveScoreA = liveA;
  state.liveScoreB = liveB;
  if (update.cardsA && update.cardsB) {
    const cards = (state.deviceCards ??= {});
    const before = JSON.stringify(cards[bout.id] ?? null);
    cards[bout.id] = { cardsA: [...update.cardsA], cardsB: [...update.cardsB] };
    changed ||= before !== JSON.stringify(cards[bout.id]);
  }
  if (update.stopwatch !== undefined && update.stopwatch <= FIE_RELAY_DURATION_SEC) {
    // Chrono du relais : temps écoulé = durée réglementaire − temps restant de l'appareil
    const elapsed = FIE_RELAY_DURATION_SEC - update.stopwatch;
    const running = !!update.running;
    changed ||=
      running !== (state.timerStartedAt !== null) || elapsed !== state.elapsedAccumulatedSec;
    state.elapsedAccumulatedSec = elapsed;
    state.timerStartedAt = running ? Date.now() : null;
  }
  if (changed) broadcastTeamArena(ctx, arenaId);
  return { accepted: true, changed };
}

/** Fin du relais en cours (END acquitté) : relais enregistré, passage au suivant. */
export function finishRelay(ctx: TeamArenaContext, arenaId: string): boolean {
  return advanceTeamBout(ctx, arenaId);
}

/**
 * PREV : rappel du relais précédent pour correction, seulement si le relais en cours n'a pas
 * commencé (score nul, chrono à zéro et arrêté) ou si la rencontre est terminée. Le relais
 * rappelé repasse « en cours » avec son score ; un nouvel END le réenregistre.
 */
export function reopenPreviousRelay(ctx: TeamArenaContext, arenaId: string): boolean {
  const view = teamRelayView(ctx, arenaId);
  if (!view?.previous) return false;
  const { state, previous } = view;
  if (
    view.bout &&
    (state.liveScoreA !== 0 ||
      state.liveScoreB !== 0 ||
      state.elapsedAccumulatedSec !== 0 ||
      state.timerStartedAt !== null)
  )
    return false;
  ctx.db.updateTeamBout(previous.id, previous.scoreA, previous.scoreB, 'in_progress', null);
  previous.status = 'in_progress';
  previous.winnerId = null;
  state.currentBoutIndex = state.bouts.indexOf(previous);
  state.liveScoreA = previous.scoreA;
  state.liveScoreB = previous.scoreB;
  state.elapsedAccumulatedSec = 0;
  state.timerStartedAt = null;
  broadcastTeamArena(ctx, arenaId);
  return true;
}

export type SubstitutionRefusal =
  'no_relay' | 'unknown_fencer' | 'no_reserve' | 'reserve_used' | 'no_later_relay';

/**
 * Remplaçant (o.99.5 / o.99.6) : le remplaçant de l'équipe du côté `side` prend la place du
 * tireur `outFencerId` dans les relais suivants non tirés. Refusé si l'équipe n'a pas de
 * remplaçant, si un remplaçant figure déjà dans la rencontre, ou s'il ne reste aucun relais
 * de ce tireur.
 */
export function substituteRelayFencer(
  ctx: TeamArenaContext,
  arenaId: string,
  side: 'A' | 'B',
  outFencerId: string
): { ok: true; reserveId: string; relays: number[] } | { ok: false; reason: SubstitutionRefusal } {
  const view = teamRelayView(ctx, arenaId);
  if (!view?.bout) return { ok: false, reason: 'no_relay' };
  const { state, bout } = view;
  const fencerKey = side === 'A' ? 'fencerAId' : 'fencerBId';
  const nameKey = side === 'A' ? 'fencerAName' : 'fencerBName';
  if (bout[fencerKey] !== outFencerId) return { ok: false, reason: 'unknown_fencer' };
  const teamId = side === 'A' ? state.teamAId : state.teamBId;
  const team = ctx.db.getTeamsByCompetition(state.competitionId).find(t => t.id === teamId);
  const reserves = team?.fencers.filter(f => f.isReserve) ?? [];
  if (reserves.length === 0) return { ok: false, reason: 'no_reserve' };
  const used = new Set(state.bouts.map(b => b[fencerKey]));
  if (reserves.some(r => used.has(r.fencerId))) return { ok: false, reason: 'reserve_used' };
  const later = state.bouts.filter(
    b => b.boutOrder > bout.boutOrder && b.status !== 'finished' && b[fencerKey] === outFencerId
  );
  if (later.length === 0) return { ok: false, reason: 'no_later_relay' };
  const reserve = reserves[0];
  const name = `${reserve.fencerLastName} ${reserve.fencerFirstName ?? ''}`.trim();
  for (const b of later) {
    ctx.db.setTeamBoutFencer(b.id, side, reserve.fencerId);
    b[fencerKey] = reserve.fencerId;
    b[nameKey] = name;
  }
  broadcastTeamArena(ctx, arenaId);
  return { ok: true, reserveId: reserve.fencerId, relays: later.map(b => b.boutOrder) };
}
