/**
 * BellePoule Modern - Fin de match Cyrano (état E) → ACK ou NAK (#1720)
 * Adaptateur du protocole vers les règles uniques de `shared/utils/matchEndValidation.ts`
 * (#1829) : statuts V / D / A / E, priorité R / L, zones droite / gauche → tireurs A / B.
 * Propre au protocole : état E exigé, Id des deux tireurs exigés, et en équipes la fin d'un
 * relais qui n'est pas le dernier toujours correcte.
 * Licensed under GPL-3.0
 */

import type { ArenaMatch } from '../../shared/types/remote';
import {
  decideMatchWinner,
  validateMatchEnd,
  type FencerEndStatus,
  type MatchEndRejection,
} from '../../shared/utils/matchEndValidation';
import type { CyranoFencer, CyranoMessage } from './codec';
import type { CyranoSides } from './deviceState';

export type CyranoEndRejection = 'not_ending' | 'missing_fencers' | MatchEndRejection;

export type CyranoEndVerdict = { ok: true } | { ok: false; reason: CyranoEndRejection };

export interface CyranoEndOptions {
  /** Équipes : vrai si le relais reçu n'est pas le dernier (fin toujours acceptée). */
  intermediateRound?: boolean;
}

/** Statut Cyrano d'un tireur → statut de fin de match */
function endStatus(f: CyranoFencer): FencerEndStatus {
  switch (f.status) {
    case 'A':
      return 'abandon';
    case 'E':
      return 'exclusion';
    case 'V':
      return 'victory';
    case 'D':
      return 'defeat';
    default:
      return 'normal';
  }
}

export function validateCyranoEnd(
  info: CyranoMessage,
  options: CyranoEndOptions = {}
): CyranoEndVerdict {
  if (info.command !== 'INFO' || info.state !== 'E') return { ok: false, reason: 'not_ending' };
  const { right, left } = info;
  if (!right?.id || !left?.id) return { ok: false, reason: 'missing_fencers' };
  if (options.intermediateRound) return { ok: true };
  // Droite = A, gauche = B : la validité ne dépend pas du côté
  return validateMatchEnd({
    scoreA: right.score,
    scoreB: left.score,
    statusA: endStatus(right),
    statusB: endStatus(left),
    priority: info.priority === 'R' ? 'A' : info.priority === 'L' ? 'B' : null,
  });
}

/**
 * Issue d'une fin de match acceptée, rapportée aux tireurs A / B de l'arène : vainqueur imposé
 * par l'appareil (abandon, exclusion, V / D ou priorité à égalité). Victoire au score : `{}`,
 * le vainqueur est alors déduit des scores par `matchFinish`.
 */
export function cyranoEndOutcome(
  msg: CyranoMessage,
  sides: CyranoSides
): NonNullable<ArenaMatch['deviceEnd']> {
  const prioritySide = msg.priority === 'R' || msg.priority === 'L' ? msg.priority : null;
  const { winner, reason } = decideMatchWinner({
    scoreA: sides.A.score,
    scoreB: sides.B.score,
    statusA: endStatus(sides.A),
    statusB: endStatus(sides.B),
    priority: prioritySide ? ((prioritySide === 'R') === sides.aOnRight ? 'A' : 'B') : null,
  });
  if (!winner || !reason || reason === 'score' || reason === 'override') return {};
  return { winner, reason };
}
