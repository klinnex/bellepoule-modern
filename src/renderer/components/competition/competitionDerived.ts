/**
 * BellePoule Modern - Valeurs dérivées de la vue compétition (extrait de CompetitionView, #1599)
 * Les règles de classement sont dans src/shared/domain/ranking/tableauRanking.ts (#1979).
 * Licensed under GPL-3.0
 */
import type { Pool } from '../../../shared/types';
import { getPoolWinnerIds } from '../../../shared/utils/poolCalculations';

type TranslateFn = (key: string, params?: { [key: string]: string | number }) => string;

/**
 * Action « tableau » de la barre du haut sur l'étape Classement (#2008).
 * null : tour intermédiaire, pas d'élimination directe, tour passé consulté
 * ou séparation par genre (boutons par groupe restés sous le classement).
 */
export function rankingTableauNavAction(params: {
  t: TranslateFn;
  hasDirectElimination: boolean;
  hasNextRound: boolean;
  viewingPastRound: boolean;
  splitByGender: boolean;
  frozen: boolean;
  poolWinnersOnly: boolean;
  pools: Pool[];
  onGoToTableau: () => void;
}): { label: string; action: () => void } | null {
  const { t, pools } = params;
  if (
    !params.hasDirectElimination ||
    params.hasNextRound ||
    params.viewingPastRound ||
    params.splitByGender
  ) {
    return null;
  }
  const label = params.frozen
    ? t('poolRanking.see_tableau')
    : params.poolWinnersOnly
      ? t('poolRanking.go_tableau_winners', {
          n: pools.length > 0 ? getPoolWinnerIds(pools).size : '?',
        })
      : t('poolRanking.go_tableau');
  return { label, action: params.onGoToTableau };
}
