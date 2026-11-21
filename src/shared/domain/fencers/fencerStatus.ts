/**
 * BellePoule Modern - Statuts de tireur : prédicats uniques (#1979, lot 4)
 * Un tireur « retiré » (abandon, forfait, exclusion) ne tire plus ; un tireur retiré ou
 * éliminé n'entre pas au tableau. Écran, moteur (MCP) et tablettes lisent ces fonctions.
 * Licensed under GPL-3.0
 */
import { FencerStatus } from '../../types';

/** Abandon, forfait, exclusion */
export const WITHDRAWN_STATUSES: ReadonlySet<string> = new Set<string>([
  FencerStatus.ABANDONED,
  FencerStatus.FORFAIT,
  FencerStatus.EXCLUDED,
]);

/** Retirés + éliminés en poules : hors tableau */
export const TABLEAU_INELIGIBLE_STATUSES: ReadonlySet<string> = new Set<string>([
  ...WITHDRAWN_STATUSES,
  FencerStatus.ELIMINATED,
]);

export const isWithdrawnStatus = (status: string | null | undefined): boolean =>
  !!status && WITHDRAWN_STATUSES.has(status);

/** Tireur retiré (abandon, forfait, exclusion) */
export const isWithdrawn = (fencer: { status?: string | null } | null | undefined): boolean =>
  isWithdrawnStatus(fencer?.status);

/** Tireur qui peut entrer au tableau (ni retiré, ni éliminé) */
export const isTableauEligible = (fencer: { status?: string | null } | null | undefined): boolean =>
  !fencer?.status || !TABLEAU_INELIGIBLE_STATUSES.has(fencer.status);

/**
 * Pointage modifiable (présent / absent) : un tireur en abandon, forfait, exclusion ou
 * éliminé se restaure, il ne se pointe pas (#1980, règle unique écran / moteur).
 */
export const canToggleCheckIn = (fencer: { status?: string | null } | null | undefined): boolean =>
  fencer?.status === FencerStatus.CHECKED_IN || fencer?.status === FencerStatus.NOT_CHECKED_IN;

/** Exclu sur carton noir (classement : rang retiré, #1012) */
export const isBlackCardExcluded = (
  fencer: { status?: string | null; exclusionReason?: string | null } | null | undefined
): boolean => fencer?.status === FencerStatus.EXCLUDED && fencer.exclusionReason === 'black_card';
