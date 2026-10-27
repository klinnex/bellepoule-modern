/**
 * BellePoule Modern - Forfait DNS / DNF (#1256)
 * DNS (Did Not Start) : forfait ou sortie médicale déclaré à l'appel pour un tireur n'ayant commencé
 * aucun match de poule. Tout autre forfait / sortie médicale en poules reste un DNF.
 * Le statut ABANDONED est affiché « Médical » (MED).
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

const isOut = (status: FencerStatus) =>
  status === FencerStatus.FORFAIT || status === FencerStatus.ABANDONED;

export function isDns(fencer: Pick<Fencer, 'status' | 'exclusionReason'>): boolean {
  return isOut(fencer.status) && fencer.exclusionReason === 'dns';
}

/** Sigle court du motif de sortie : MED (médical), F (forfait), X (exclusion), '' sinon */
export function statusCode(status: FencerStatus): string {
  switch (status) {
    case FencerStatus.ABANDONED:
      return 'MED';
    case FencerStatus.FORFAIT:
      return 'F';
    case FencerStatus.EXCLUDED:
      return 'X';
    default:
      return '';
  }
}

const POOL_EXIT_LABELS: Partial<Record<FencerStatus, string>> = {
  [FencerStatus.ABANDONED]: 'médical',
  [FencerStatus.FORFAIT]: 'forfait',
  [FencerStatus.EXCLUDED]: 'exclusion',
};

/** « Éliminé en » d'un tireur sorti en poules : « Poules (forfait) », « Poules (médical) »… */
export function poolEliminatedAt(fencer: Pick<Fencer, 'status'>): string {
  const label = POOL_EXIT_LABELS[fencer.status];
  return label ? `Poules (${label})` : 'Poules';
}

/**
 * Libellé du rang au classement final : forfait / médical pendant les poules (ou DNS) → DNF / DNS,
 * sans numéro. Sortie pendant le tableau : numéro conservé.
 */
export function finalRankLabel(
  rank: number,
  fencer: Pick<Fencer, 'status' | 'exclusionReason'>,
  eliminatedAt?: string
): string {
  if (!eliminatedAt?.startsWith('Poules')) return String(rank);
  if (isDns(fencer)) return 'DNS';
  if (isOut(fencer.status)) return 'DNF';
  return String(rank);
}

/**
 * Mise à jour du tireur pour un statut posé depuis l'appel : DNS si forfait / médical sans match de
 * poule commencé (à calculer avant l'annulation des matchs), motif effacé sinon. Exclusion : motif
 * (carton noir) laissé tel quel.
 */
export function checkInStatusUpdate(
  pools: Pool[],
  fencerId: string,
  status: FencerStatus
): Pick<Fencer, 'status' | 'exclusionReason'> {
  if (status === FencerStatus.EXCLUDED) return { status };
  const exclusionReason = isOut(status) ? checkInForfeitReason(pools, fencerId) : null;
  return { status, exclusionReason };
}
