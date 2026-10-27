/**
 * BellePoule Modern - Forfait DNS / DNF (#1256)
 * DNS (Did Not Start) : forfait déclaré à l'appel pour un tireur n'ayant commencé aucun match de poule.
 * Tout autre forfait (match de poule, ou après un match commencé) reste un forfait classique (DNF).
 * Licensed under GPL-3.0
 */

import { Fencer, FencerStatus, MatchStatus, Pool, Score } from '../types';

const isSpecial = (s: Score | null) => !!(s?.isForfait || s?.isAbstention || s?.isExclusion);

/**
 * Le tireur a-t-il commencé (ou joué) au moins un match de poule ?
 * Un match clos par un forfait / abandon / exclusion (score marqué) ne compte pas.
 */
export function hasStartedPoolMatch(pools: Pool[], fencerId: string): boolean {
  return pools.some(pool =>
    pool.matches.some(
      m =>
        (m.fencerA?.id === fencerId || m.fencerB?.id === fencerId) &&
        (m.status === MatchStatus.IN_PROGRESS ||
          (m.status === MatchStatus.FINISHED && !isSpecial(m.scoreA) && !isSpecial(m.scoreB)))
    )
  );
}

/** Motif à enregistrer pour un forfait déclaré depuis l'appel */
export function checkInForfeitReason(pools: Pool[], fencerId: string): 'dns' | null {
  return hasStartedPoolMatch(pools, fencerId) ? null : 'dns';
}

export function isDns(fencer: Pick<Fencer, 'status' | 'exclusionReason'>): boolean {
  return fencer.status === FencerStatus.FORFAIT && fencer.exclusionReason === 'dns';
}

/** Sigle court du forfait : DNS ou F */
export function forfeitCode(fencer: Pick<Fencer, 'status' | 'exclusionReason'>): string {
  return isDns(fencer) ? 'DNS' : 'F';
}

/**
 * Mise à jour du tireur pour un statut posé depuis l'appel : DNS si forfait sans match de poule
 * commencé (à calculer avant l'annulation des matchs), motif effacé sinon. Exclusion : motif
 * (carton noir) laissé tel quel.
 */
export function checkInStatusUpdate(
  pools: Pool[],
  fencerId: string,
  status: FencerStatus
): Pick<Fencer, 'status' | 'exclusionReason'> {
  if (status === FencerStatus.EXCLUDED) return { status };
  const exclusionReason =
    status === FencerStatus.FORFAIT ? checkInForfeitReason(pools, fencerId) : null;
  return { status, exclusionReason };
}
