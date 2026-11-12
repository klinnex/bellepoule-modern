/**
 * BellePoule Modern - Validation d'une fin de match Cyrano (état E) → ACK ou NAK (#1720)
 * Règle de la spécification (§4) :
 *  1) statuts normaux et (scores différents, ou égalité avec priorité) ;
 *  2) ou abandon / exclusion d'au moins un tireur.
 * En équipes, la fin d'un relais qui n'est pas le dernier est toujours correcte.
 * Licensed under GPL-3.0
 */

import type { CyranoMessage } from './codec';

export type CyranoEndRejection =
  'not_ending' | 'missing_fencers' | 'missing_scores' | 'tie_without_priority';

export type CyranoEndVerdict = { ok: true } | { ok: false; reason: CyranoEndRejection };

export interface CyranoEndOptions {
  /** Équipes : vrai si le relais reçu n'est pas le dernier (fin toujours acceptée). */
  intermediateRound?: boolean;
}

export function validateCyranoEnd(
  info: CyranoMessage,
  options: CyranoEndOptions = {}
): CyranoEndVerdict {
  if (info.command !== 'INFO' || info.state !== 'E') return { ok: false, reason: 'not_ending' };
  const { right, left } = info;
  if (!right?.id || !left?.id) return { ok: false, reason: 'missing_fencers' };
  if (options.intermediateRound) return { ok: true };
  const out = (s: string | undefined) => s === 'A' || s === 'E';
  if (out(right.status) || out(left.status)) return { ok: true };
  if (right.score === undefined || left.score === undefined) {
    return { ok: false, reason: 'missing_scores' };
  }
  if (right.score !== left.score) return { ok: true };
  if (info.priority === 'R' || info.priority === 'L') return { ok: true };
  return { ok: false, reason: 'tie_without_priority' };
}

/** Résultat d'une fin de match acceptée, exprimé par identifiant de tireur (insensible à l'inversion droite/gauche). */
export interface CyranoMatchResult {
  scores: Record<string, number>;
  winnerId: string | null;
  /** Identifiants des tireurs en abandon (A) ou exclusion (E) */
  abandoned: string[];
  excluded: string[];
}

export function cyranoResult(info: CyranoMessage): CyranoMatchResult | null {
  const { right, left } = info;
  if (!right?.id || !left?.id) return null;
  const scores: Record<string, number> = {
    [right.id]: right.score ?? 0,
    [left.id]: left.score ?? 0,
  };
  const abandoned = [right, left].filter(f => f.status === 'A').map(f => f.id as string);
  const excluded = [right, left].filter(f => f.status === 'E').map(f => f.id as string);
  let winnerId: string | null = null;
  const outR = right.status === 'A' || right.status === 'E';
  const outL = left.status === 'A' || left.status === 'E';
  if (outR !== outL) winnerId = outR ? left.id : right.id;
  else if (!outR) {
    if (right.status === 'V' || left.status === 'D') winnerId = right.id;
    else if (left.status === 'V' || right.status === 'D') winnerId = left.id;
    else if (scores[right.id] !== scores[left.id]) {
      winnerId = scores[right.id] > scores[left.id] ? right.id : left.id;
    } else if (info.priority === 'R') winnerId = right.id;
    else if (info.priority === 'L') winnerId = left.id;
  }
  return { scores, winnerId, abandoned, excluded };
}
