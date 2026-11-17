/**
 * BellePoule Modern - Match individuel à afficher sur un appareil de piste (#1720, #1829)
 * Extrait du PisteHub : tireurs droite (A) / gauche (B), nation, scores, cartons déjà donnés,
 * chrono d'un match rappelé, phase / poule / n° de match, arme, arbitre.
 * Licensed under GPL-3.0
 */

import type { RemoteScoreServer } from '../remoteScoreServer';
import type { ArenaMatch } from '../../shared/types/remote';
import { resolveCyranoCoords, type MatchCoordsSource } from '../cyrano/matchCoords';
import { pickCyranoNat, type CyranoNatSource } from '../cyrano/names';
import { cardCounts } from './pisteState';
import type { PisteDisplay, PisteDisplaySide, PisteLink } from './types';

export interface MatchDisplayInput {
  match: ArenaMatch;
  scoreA: number;
  scoreB: number;
  link?: PisteLink;
  remote: RemoteScoreServer | null;
  /** Dernier chrono connu de l'appareil pour la piste (secondes) */
  watch?: { matchId: string; stopwatch: number };
  options: { natSource: CyranoNatSource; international: boolean };
  coordsSource?: MatchCoordsSource;
}

export function buildMatchDisplay(input: MatchDisplayInput): PisteDisplay {
  const { match, scoreA, scoreB, link, remote, watch: w, options } = input;
  const fA = match.fencerA;
  const fB = match.fencerB;
  // Cartons déjà donnés sur ce match (match rappelé, appareil redémarré) : sans eux, le
  // premier état de l'appareil les effacerait
  const arenaId = `arena${link?.arena}`;
  const arena = link?.arena ? remote?.getArena(arenaId) : null;
  const isCurrent = arena?.currentMatch?.id === match.id;
  const cards = isCurrent ? remote?.arenaCards.get(arenaId) : undefined;
  // Chrono : seulement pour un match repris pas encore relancé (PREV), jamais en plein combat
  const stopwatch =
    isCurrent && arena?.status !== 'in_progress' && w?.matchId === match.id
      ? w.stopwatch
      : undefined;
  // Match rappelé pas encore relancé : statut du tireur sorti (abandon ou exclusion signalé par
  // l'appareil, carton noir de la tablette), spéc. Cyrano § 3 champs R5 / L5
  const recalled = isCurrent && arena?.status !== 'in_progress';
  const outOf = (side: 'A' | 'B', list?: string[]): Pick<PisteDisplaySide, 'status'> => {
    if (!recalled) return {};
    if (match.recalledOut?.fencer === side) return { status: match.recalledOut.reason };
    return list?.includes('black') ? { status: 'exclusion' } : {};
  };
  const right: PisteDisplaySide = {
    id: fA.id,
    lastName: fA.lastName,
    firstName: fA.firstName,
    nat: pickCyranoNat(fA, options.natSource, options.international),
    score: scoreA,
    ...cardCounts(cards?.cardsA),
    ...outOf('A', cards?.cardsA),
  };
  const left: PisteDisplaySide = {
    id: fB.id,
    lastName: fB.lastName,
    firstName: fB.firstName,
    nat: pickCyranoNat(fB, options.natSource, options.international),
    score: scoreB,
    ...cardCounts(cards?.cardsB),
    ...outOf('B', cards?.cardsB),
  };

  const { phase, poulTab, matchNum } = resolveCyranoCoords(
    match,
    remote?.getSession()?.competitionId,
    input.coordsSource
  );
  return {
    type: 'individual',
    phase,
    poulTab,
    match: matchNum,
    stopwatch,
    // Arme de la séance ; Laser / CUSTOM → champ vide (affichage seul)
    weapon: remote?.getSessionWeapon() ?? '',
    right,
    left,
    referee: match.referee ? { id: match.referee.id, name: match.referee.name } : undefined,
  };
}
