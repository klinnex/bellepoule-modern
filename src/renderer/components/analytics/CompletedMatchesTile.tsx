/**
 * BellePoule Modern - Carte « Matchs terminés » de l'onglet Performances (#1817)
 * Portée affichée (Poules / Tableau) ; détail poules, tableau principal et, en mode
 * « toutes les places », total des matchs de classement.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import type { OrganisationKpis } from '../../../features/analytics/services/competitionKpis';

export const CompletedMatchesTile: React.FC<{
  poolDone: number;
  poolTotal: number;
  /** Tableau compté (tableau généré et période « Tout ») */
  withTableau: boolean;
  tableau: OrganisationKpis['tableauCount'];
}> = ({ poolDone, poolTotal, withTableau, tableau }) => {
  const { t } = useTranslation();
  const scope = t(withTableau ? 'analytics.scope_tableau' : 'analytics.scope_pools');
  return (
    <div className="bg-green-50 rounded-lg p-4" data-testid="completed-tile">
      <div className="text-green-600 text-sm font-medium">
        {t('analytics.completed')} ({scope})
      </div>
      <div className="text-2xl font-bold text-green-800">
        {withTableau
          ? `${poolDone + tableau.done}/${poolTotal + tableau.total}`
          : `${poolDone}/${poolTotal}`}
      </div>
      {withTableau && (
        <div className="text-xs text-green-700 mt-1" data-testid="completed-detail">
          {t('analytics.completed_detail', {
            pools: `${poolDone}/${poolTotal}`,
            main: `${tableau.mainDone}/${tableau.mainTotal}`,
          })}
          {tableau.allPlaces &&
            ` · ${t('analytics.completed_all_places', { n: `${tableau.done}/${tableau.total}` })}`}
        </div>
      )}
    </div>
  );
};

export default CompletedMatchesTile;
