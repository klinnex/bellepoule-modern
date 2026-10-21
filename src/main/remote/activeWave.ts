/**
 * BellePoule Modern - Vague active du tournoi des rapières par compétition (#1118) :
 * mémorisée même sans serveur démarré, réappliquée à chaque (re)démarrage pour que
 * les tablettes arbitre restent filtrées sur la vague (et les sous-pistes actives).
 * Licensed under GPL-3.0
 */
import { remoteServers } from '../remoteRegistry';
import type { RemoteScoreServer } from '../remoteScoreServer';

export const activeWaves = new Map<string, string[] | null>();

/** Mémorise la vague (`null` : aucun filtre) et l'applique au serveur s'il tourne. */
export function setActiveWave(competitionId: string, matchIds: unknown): void {
  const ids = Array.isArray(matchIds) ? matchIds.filter(id => typeof id === 'string') : null;
  activeWaves.set(competitionId, ids);
  remoteServers.get(competitionId)?.server.setActiveWaveMatchIds(ids);
}

/** Réapplique la vague mémorisée à un serveur (re)démarré. */
export function applyActiveWave(competitionId: string, server: RemoteScoreServer): void {
  if (activeWaves.has(competitionId)) {
    server.setActiveWaveMatchIds(activeWaves.get(competitionId) ?? null);
  }
}
