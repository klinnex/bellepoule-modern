/**
 * BellePoule Modern - KPI d'un tireur dans l'onglet Graphiques (#1817) :
 * progression au classement, écart moyen des scores, séries de victoires / défaites.
 * Licensed under GPL-3.0
 */

import React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Fencer } from '../../../shared/types';
import { Icon } from '../common/Icon';
import { useTranslation } from '../../hooks/useTranslation';
import {
  CLOSE_GAP,
  fencerMatchKpis,
  initialRankOf,
  rankingProgression,
  type KpiMatch,
} from '../../../features/analytics/services/competitionKpis';

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-lg border border-gray-100 p-4">
    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</div>
    {children}
  </div>
);

export const FencerKpiPanel: React.FC<{
  fencerId: string;
  matches: KpiMatch[];
  fencers: Fencer[];
  poolRank: number | null;
  finalRank: number | null;
}> = ({ fencerId, matches, fencers, poolRank, finalRank }) => {
  const { t } = useTranslation();
  const k = fencerMatchKpis(fencerId, matches);
  const steps = rankingProgression(initialRankOf(fencers, fencerId), poolRank, finalRank);
  const stepLabel = {
    initial: t('analyticsCharts.rank_initial'),
    pools: t('analyticsCharts.rank_pools'),
    final: t('analyticsCharts.rank_final'),
  };

  return (
    <div className="kpi-fencer-grid" data-testid="fencer-kpis">
      <Card title={t('analyticsCharts.kpi_progression')}>
        <div className="space-y-2">
          {steps.map(s => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{stepLabel[s.key]}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono font-bold">{s.rank ?? '—'}</span>
                {s.delta != null && (
                  <span
                    className={`kpi-delta ${s.delta > 0 ? 'kpi-delta--up' : s.delta < 0 ? 'kpi-delta--down' : 'kpi-delta--flat'}`}
                    title={t('analyticsCharts.rank_delta_title')}
                  >
                    <Icon icon={s.delta > 0 ? ArrowUp : s.delta < 0 ? ArrowDown : Minus} />
                    {s.delta !== 0 ? Math.abs(s.delta) : ''}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('analyticsCharts.kpi_gap')}>
        {k.played === 0 ? (
          <div className="text-center text-gray-300 text-sm py-4">
            {t('analyticsCharts.no_data')}
          </div>
        ) : (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.gap_all')}</span>
              <span className="font-mono font-bold">{k.averageGap.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.gap_wins')}</span>
              <span className="font-mono">{k.wins ? `+${k.averageWinGap.toFixed(1)}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.gap_losses')}</span>
              <span className="font-mono">
                {k.losses ? `−${k.averageLossGap.toFixed(1)}` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">
                {t('analyticsCharts.close_wins', { n: CLOSE_GAP })}
              </span>
              <span className="font-mono">{k.closeWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.dominant_wins')}</span>
              <span className="font-mono">{k.dominantWins}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.normal_wins')}</span>
              <span className="font-mono">{k.normalWins}</span>
            </div>
          </div>
        )}
      </Card>

      <Card title={t('analyticsCharts.kpi_streaks')}>
        {k.played === 0 ? (
          <div className="text-center text-gray-300 text-sm py-4">
            {t('analyticsCharts.no_data')}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.best_win_streak')}</span>
              <span className="font-mono font-bold text-green-700">{k.bestWinStreak}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{t('analyticsCharts.best_loss_streak')}</span>
              <span className="font-mono font-bold text-red-600">{k.bestLossStreak}</span>
            </div>
            {k.current && (
              <div className="flex justify-between">
                <span className="text-gray-600">{t('analyticsCharts.current_streak')}</span>
                <span className="font-mono">
                  {k.current.length}{' '}
                  {k.current.kind === 'W' ? t('analyticsCharts.v') : t('analyticsCharts.d')}
                </span>
              </div>
            )}
            <div className="kpi-sequence" aria-label={t('analyticsCharts.sequence')}>
              {k.sequence.map((r, i) => (
                <span
                  key={i}
                  className={`kpi-sequence__item ${r === 'W' ? 'kpi-sequence__item--win' : 'kpi-sequence__item--loss'}`}
                >
                  {r === 'W' ? t('analyticsCharts.v') : t('analyticsCharts.d')}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
