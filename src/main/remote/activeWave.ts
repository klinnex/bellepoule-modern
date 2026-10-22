/**
 * BellePoule Modern - Vague active du tournoi des rapières par compétition (#1118) :
 * mémorisée même sans serveur démarré, réappliquée à chaque (re)démarrage pour que
 * les tablettes arbitre restent filtrées sur la vague (et les sous-pistes actives).
 * Licensed under GPL-3.0
 */
import { remoteServers } from '../remoteRegistry';
import type { RemoteScoreServer } from '../remoteScoreServer';

export interface ActiveWaveState {
  ids: string[] | null;
  /** Vagues terminées : plus aucun match de poule proposé */
  poolsClosed: boolean;
}

export const activeWaves = new Map<string, ActiveWaveState>();

/**
 * Mémorise la vague (`null` : aucun filtre) et la fin des vagues, et les applique au
 * serveur s'il tourne.
 */
export function setActiveWave(
  competitionId: string,
  matchIds: unknown,
  poolsClosed: unknown = false
): void {
  const ids = Array.isArray(matchIds) ? matchIds.filter(id => typeof id === 'string') : null;
  const closed = poolsClosed === true;
  activeWaves.set(competitionId, { ids, poolsClosed: closed });
  remoteServers.get(competitionId)?.server.setActiveWaveMatchIds(ids, closed);
}

/** Réapplique la vague mémorisée à un serveur (re)démarré. */
export function applyActiveWave(competitionId: string, server: RemoteScoreServer): void {
  const state = activeWaves.get(competitionId);
  if (state) server.setActiveWaveMatchIds(state.ids, state.poolsClosed);
}
