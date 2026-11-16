/**
 * BellePoule Modern - Carte « Statistiques de l'arme » (onglet Performances)
 * Armes olympiques : écart moyen au score, cartons par match, abandons / exclusions /
 * forfaits, matchs au temps limite (#1817). Autres armes : indicateurs historiques.
 * Licensed under GPL-3.0
 */

import React, { useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { Competition, Fencer, FencerCompetitionStats, Match, Weapon } from '../../../shared/types';
import {
  weaponKpis,
  type KpiTableauMatch,
} from '../../../features/analytics/services/competitionKpis';

const OLYMPIC: string[] = [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE];

export interface LegacyWeaponStats {
  totalMatches: number;
  averageVictoryMargin: number;
  mostTouchingMatch: number;
}

const Stat: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div>
    <div className="text-sm text-gray-600" title={hint}>
      {label}
    </div>
    <div className="font-bold">{children}</div>
  </div>
);

export const WeaponStatsCard: React.FC<{
  competition: Competition;
  poolMatches: Match[];
  tableauMatches: KpiTableauMatch[];
  fencers: Fencer[];
  fencerStats: FencerCompetitionStats[];
  legacy: LegacyWeaponStats;
}> = ({ competition, poolMatches, tableauMatches, fencers, fencerStats, legacy }) => {
  const { t } = useTranslation();
  const olympic = OLYMPIC.includes(competition.weapon);
  const weapon = competition.weapon;
  const tableMaxScore = competition.settings?.defaultTableMaxScore;
  const kpis = useMemo(
    () =>
      weaponKpis({
        poolMatches,
        tableauMatches,
        fencers,
        totalCards: fencerStats.reduce(
          (n, s) => n + s.whiteCards + s.yellowCards + s.redCards + (s.blackCards ?? 0),
          0
        ),
        tableMaxScore,
      }),
    [poolMatches, tableauMatches, fencers, fencerStats, tableMaxScore]
  );
  return (
    <div className="mt-6 bg-gray-50 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">{t('analytics.weapon_stats')}</h3>
      {olympic ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="weapon-stats-olympic">
          <Stat label={t('analytics.avg_margin')}>{`+${kpis.averageMargin.toFixed(1)}`}</Stat>
          <Stat label={t('analytics.cards_per_match')}>{kpis.cardsPerMatch.toFixed(2)}</Stat>
          <Stat label={t('analytics.withdrawals')}>
            {t('analytics.withdrawals_value', {
              a: kpis.abandons,
              x: kpis.exclusions,
              f: kpis.forfaits,
            })}
          </Stat>
          <Stat label={t('analytics.time_limit')} hint={t('analytics.time_limit_hint')}>
            {kpis.timeLimit}{' '}
            <span className="text-sm text-gray-500">({kpis.timeLimitPercent.toFixed(0)}%)</span>
          </Stat>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label={t('analytics.total_matches')}>{legacy.totalMatches}</Stat>
          <Stat
            label={t('analytics.avg_margin')}
          >{`+${legacy.averageVictoryMargin.toFixed(1)}`}</Stat>
          <Stat label={t('analytics.most_touching')}>{legacy.mostTouchingMatch}</Stat>
          <Stat label={t('analytics.competition')}>{weapon}</Stat>
        </div>
      )}
    </div>
  );
};
