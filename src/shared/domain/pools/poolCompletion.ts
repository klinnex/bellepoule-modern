/**
 * BellePoule Modern - Poule terminée : règle unique (#1979, lot 4)
 * Un match de poule est réglé s'il est terminé, ou si l'un des tireurs est retiré
 * (abandon, forfait, exclusion) : ce match ne sera pas tiré. Avant le lot 4, l'écran
 * appliquait cette règle et le moteur (MCP) exigeait « terminé » : ils divergeaient.
 * Licensed under GPL-3.0
 */
import { MatchStatus } from '../../types';
import { isWithdrawn } from '../fencers/fencerStatus';

interface PoolMatchLike {
  status?: string | null;
  fencerA?: { status?: string | null } | null;
  fencerB?: { status?: string | null } | null;
}

export const isPoolMatchSettled = (match: PoolMatchLike): boolean =>
  match.status === MatchStatus.FINISHED || isWithdrawn(match.fencerA) || isWithdrawn(match.fencerB);

export const isPoolComplete = (pool: { matches: PoolMatchLike[] }): boolean =>
  pool.matches.every(isPoolMatchSettled);

export const areAllPoolsComplete = (pools: { matches: PoolMatchLike[] }[]): boolean =>
  pools.every(isPoolComplete);
