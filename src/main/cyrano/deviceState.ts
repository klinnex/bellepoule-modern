/**
 * BellePoule Modern - Lecture d'un INFO Cyrano rapporté au match de l'arène (#1720)
 * - Id tireur : le protocole limite le champ à 8 caractères ; les identifiants BellePoule
 *   (UUID, 36 caractères) arrivent tronqués. La correspondance se fait sur ce préfixe,
 *   parmi les deux tireurs du match en cours uniquement.
 * - Côtés : droite / gauche → A / B par identifiant, jamais par position (inversion).
 * - Cartons, chrono : conversion vers le format des arènes (liste de cartons, secondes).
 * Licensed under GPL-3.0
 */

import type { ArenaMatch } from '../../shared/types/remote';
import { sanitizeField, type CyranoFencer, type CyranoMessage } from './codec';

/** Longueur maximale du champ Id d'un tireur (spécification, zone tireur R1 / L1). */
export const CYRANO_FENCER_ID_MAX = 8;

/** Identifiant tel qu'il circule dans les trames (préfixe nettoyé de 8 caractères). */
export function cyranoFencerId(id: string): string {
  return sanitizeField(id, CYRANO_FENCER_ID_MAX);
}

export type ArenaSide = 'A' | 'B';

/** Tireur du match désigné par un Id reçu ; null si inconnu ou ambigu. */
export function resolveCyranoSide(
  cyranoId: string | undefined,
  match: Pick<ArenaMatch, 'fencerA' | 'fencerB'>
): ArenaSide | null {
  if (!cyranoId) return null;
  const hit = (id: string | undefined) =>
    !!id && (id === cyranoId || cyranoFencerId(id) === cyranoId);
  const a = hit(match.fencerA?.id);
  const b = hit(match.fencerB?.id);
  if (a === b) return null;
  return a ? 'A' : 'B';
}

export interface CyranoSides {
  A: CyranoFencer;
  B: CyranoFencer;
  /** Tireur A affiché à droite de l'appareil */
  aOnRight: boolean;
}

/** Zones droite / gauche → tireurs A / B ; null si l'appareil n'affiche pas ce match. */
export function mapCyranoSides(
  msg: CyranoMessage,
  match: Pick<ArenaMatch, 'fencerA' | 'fencerB'>
): CyranoSides | null {
  const { right, left } = msg;
  if (!right || !left) return null;
  const r = resolveCyranoSide(right.id, match);
  const l = resolveCyranoSide(left.id, match);
  if (!r || !l || r === l) return null;
  return r === 'A' ? { A: right, B: left, aOnRight: true } : { A: left, B: right, aOnRight: false };
}

/** Cartons d'un tireur au format des arènes (`yellow`, `red`…), dans l'ordre d'attribution. */
export function cyranoCards(f: CyranoFencer): string[] {
  const cards: string[] = [];
  if ((f.yellowCards ?? 0) > 0) cards.push('yellow');
  for (let i = 0; i < Math.min(f.redCards ?? 0, 99); i++) cards.push('red');
  return cards;
}

/** Chrono Cyrano (`m:ss` ou `m:ss.cc` sous 10 s) → secondes ; null si absent ou illisible. */
export function parseCyranoStopwatch(value: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?$/.exec(value?.trim() ?? '');
  if (!m) return null;
  const sec = Number(m[2]);
  if (sec > 59) return null;
  const cs = m[3] ? Number(m[3].padEnd(2, '0')) : 0;
  return Number(m[1]) * 60 + sec + cs / 100;
}

/** États « match en cours » de l'appareil : Fencing, Halt, Pause. */
export function isActiveCyranoState(state: CyranoMessage['state']): boolean {
  return state === 'F' || state === 'H' || state === 'P';
}
