/**
 * BellePoule Modern - État de l'arène remonté par un appareil de piste Cyrano (#1720)
 * Score, cartons jaunes / rouges et chrono saisis sur l'appareil. Passe par les mêmes
 * chemins que la tablette (updateArenaScore pour l'audit, broadcastArenaUpdate pour la diffusion).
 * Licensed under GPL-3.0
 */

import type { RemoteScoreServer } from '../remoteScoreServer';
import { mergeDeviceCards, type DeviceCardCounts } from '../cyrano/mapping';

type S = RemoteScoreServer;

/** État de l'arène tel que le fournit l'appareil. Tout champ absent reste inchangé. */
export interface DeviceArenaState {
  scoreA?: number;
  scoreB?: number;
  cardsA?: DeviceCardCounts;
  cardsB?: DeviceCardCounts;
  /** Chrono du match, en secondes */
  time?: number;
  timerStatus?: 'running' | 'paused';
}

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface DeviceStateContext {
  readonly arenaCards: S['arenaCards'];
  readonly arenaEventTimes: S['arenaEventTimes'];
  readonly arenaExits: S['arenaExits'];
  readonly arenaOvertimeType: S['arenaOvertimeType'];
  readonly arenaSuddenDeath: S['arenaSuddenDeath'];
  readonly arenaTouches: S['arenaTouches'];
  readonly arenaWaitingOvertime: S['arenaWaitingOvertime'];
  readonly arenas: S['arenas'];
  readonly broadcastArenaUpdate: S['broadcastArenaUpdate'];
  readonly updateArenaScore: S['updateArenaScore'];
}

/** Applique l'état de l'appareil à l'arène courante ; sans match, ne fait rien. */
export function applyDeviceArenaState(
  ctx: DeviceStateContext,
  arenaId: string,
  state: DeviceArenaState
): void {
  const arena = ctx.arenas.get(arenaId);
  if (!arena?.currentMatch) return;

  const { scoreA, scoreB } = state;
  if (
    scoreA !== undefined &&
    scoreB !== undefined &&
    (scoreA !== arena.currentMatch.scoreA || scoreB !== arena.currentMatch.scoreB)
  ) {
    ctx.updateArenaScore(arenaId, scoreA, scoreB);
  }

  const previous = ctx.arenaCards.get(arenaId) ?? { cardsA: [], cardsB: [] };
  const cards = {
    cardsA: state.cardsA ? mergeDeviceCards(previous.cardsA, state.cardsA) : previous.cardsA,
    cardsB: state.cardsB ? mergeDeviceCards(previous.cardsB, state.cardsB) : previous.cardsB,
  };
  ctx.arenaCards.set(arenaId, cards);

  ctx.broadcastArenaUpdate(arenaId, {
    arenaId,
    match: arena.currentMatch,
    scoreA: arena.currentMatch.scoreA,
    scoreB: arena.currentMatch.scoreB,
    cardsA: cards.cardsA,
    cardsB: cards.cardsB,
    time: state.time,
    timerStatus: state.timerStatus,
    suddenDeath: ctx.arenaSuddenDeath.get(arenaId) ?? false,
    overtimeType: ctx.arenaOvertimeType.get(arenaId) ?? null,
    waitingOvertime: ctx.arenaWaitingOvertime.get(arenaId) ?? false,
    status: arena.status,
  });
}

/**
 * Réinitialise les événements du match (cartons, touches, sorties, chronologie) :
 * même remise à zéro que la tablette lors d'un changement de match.
 */
export function clearArenaEvents(ctx: DeviceStateContext, arenaId: string): void {
  ctx.arenaCards.set(arenaId, { cardsA: [], cardsB: [] });
  ctx.arenaTouches.set(arenaId, { touchesA: [], touchesB: [] });
  ctx.arenaExits.set(arenaId, []);
  ctx.arenaEventTimes.delete(arenaId);
  ctx.arenaSuddenDeath.set(arenaId, false);
  ctx.arenaOvertimeType.set(arenaId, null);
  ctx.arenaWaitingOvertime.set(arenaId, false);
}
