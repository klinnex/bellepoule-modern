/**
 * BellePoule Modern - Lecture d'un état d'appareil rapporté au match de l'arène (#1829)
 * Indépendant du protocole :
 * - côtés droite / gauche → tireurs A / B par identifiant, jamais par position (inversion) ;
 * - cartons au format des arènes (`yellow`, `red`, `p-red`, `p-black`) ;
 * - validation de fin : règles uniques de `shared/utils/matchEndValidation.ts`.
 * Licensed under GPL-3.0
 */

import type { ArenaMatch } from '../../shared/types/remote';
import {
  decideMatchWinner,
  validateMatchEnd,
  type FencerEndStatus,
  type MatchEndRejection,
} from '../../shared/domain/match/matchEndValidation';
import type { PisteFencingState, PisteSideState, PisteState } from './types';

export type ArenaSide = 'A' | 'B';

/** Identifiant tel que l'appareil le renvoie (le pilote applique la troncature du protocole). */
export type FencerIdOf = (id: string) => string;

/** Tireurs A / B d'un match (arène individuelle ou relais par équipes). */
export interface SidesMatch {
  fencerA?: { id?: string } | null;
  fencerB?: { id?: string } | null;
}

/** Tireur du match désigné par un Id reçu ; null si inconnu ou ambigu. */
export function resolveSide(
  received: string | undefined,
  match: SidesMatch,
  idOf: FencerIdOf
): ArenaSide | null {
  if (!received) return null;
  const hit = (id: string | undefined) => !!id && (id === received || idOf(id) === received);
  const a = hit(match.fencerA?.id);
  const b = hit(match.fencerB?.id);
  if (a === b) return null;
  return a ? 'A' : 'B';
}

export interface PisteSides {
  A: PisteSideState;
  B: PisteSideState;
  /** Tireur A affiché à droite de l'appareil */
  aOnRight: boolean;
}

/** Côtés droite / gauche → tireurs A / B ; null si l'appareil n'affiche pas ce match. */
export function mapPisteSides(
  state: PisteState,
  match: SidesMatch,
  idOf: FencerIdOf
): PisteSides | null {
  const { right, left } = state;
  if (!right || !left) return null;
  const r = resolveSide(right.id, match, idOf);
  const l = resolveSide(left.id, match, idOf);
  if (!r || !l || r === l) return null;
  return r === 'A' ? { A: right, B: left, aOnRight: true } : { A: left, B: right, aOnRight: false };
}

/**
 * Cartons d'un côté au format des arènes, dans l'ordre d'attribution : jaune, rouges, puis
 * cartons P (rouge P, noir P ; le jaune P, sans effet sur le score, n'est pas repris).
 */
export function sideCards(f: PisteSideState): string[] {
  const cards: string[] = [];
  if ((f.yellowCards ?? 0) > 0) cards.push('yellow');
  for (let i = 0; i < Math.min(f.redCards ?? 0, 99); i++) cards.push('red');
  for (let i = 0; i < Math.min(f.pRed ?? 0, 2); i++) cards.push('p-red');
  for (let i = 0; i < Math.min(f.pBlack ?? 0, 2); i++) cards.push('p-black');
  return cards;
}

/** Cartons d'arène → compteurs à afficher (match repris). */
export function cardCounts(list: readonly string[] | undefined): {
  yellowCards: number;
  redCards: number;
  pRed: number;
  pBlack: number;
} {
  return {
    yellowCards: list?.includes('yellow') ? 1 : 0,
    redCards: list?.filter(c => c === 'red').length ?? 0,
    pRed: list?.filter(c => c === 'p-red').length ?? 0,
    pBlack: list?.filter(c => c === 'p-black').length ?? 0,
  };
}

/** États « match en cours » : assaut, halte, pause. */
export function isActiveState(state: PisteFencingState | undefined): boolean {
  return state === 'fencing' || state === 'halt' || state === 'pause';
}

export type PisteEndRejection = 'not_ending' | 'missing_fencers' | MatchEndRejection;
export type PisteEndVerdict = { ok: true } | { ok: false; reason: PisteEndRejection };

const endStatus = (f: PisteSideState): FencerEndStatus => f.status ?? 'normal';

/**
 * Fin de match (état `ending`) : Id des deux tireurs exigés ; en équipes, la fin d'un relais
 * qui n'est pas le dernier est toujours correcte ; sinon règles uniques du module partagé.
 */
export function validatePisteEnd(
  state: PisteState,
  options: { intermediateRound?: boolean } = {}
): PisteEndVerdict {
  if (state.state !== 'ending') return { ok: false, reason: 'not_ending' };
  const { right, left } = state;
  if (!right?.id || !left?.id) return { ok: false, reason: 'missing_fencers' };
  if (options.intermediateRound) return { ok: true };
  // Droite = A, gauche = B : la validité ne dépend pas du côté
  return validateMatchEnd({
    scoreA: right.score,
    scoreB: left.score,
    statusA: endStatus(right),
    statusB: endStatus(left),
    priority: state.priority === 'right' ? 'A' : state.priority === 'left' ? 'B' : null,
  });
}

/**
 * Issue d'une fin acceptée, rapportée aux tireurs A / B : vainqueur imposé par l'appareil
 * (abandon, exclusion, victoire / défaite ou priorité à égalité). Victoire au score : `{}`.
 */
export function pisteEndOutcome(
  state: PisteState,
  sides: PisteSides
): NonNullable<ArenaMatch['deviceEnd']> {
  const p = state.priority === 'right' || state.priority === 'left' ? state.priority : null;
  const { winner, reason } = decideMatchWinner({
    scoreA: sides.A.score,
    scoreB: sides.B.score,
    statusA: endStatus(sides.A),
    statusB: endStatus(sides.B),
    priority: p ? ((p === 'right') === sides.aOnRight ? 'A' : 'B') : null,
  });
  if (!winner || !reason || reason === 'score' || reason === 'override') return {};
  return { winner, reason };
}
