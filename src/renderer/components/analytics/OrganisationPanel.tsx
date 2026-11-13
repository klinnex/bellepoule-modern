/**
 * BellePoule Modern - Onglet « Organisation » du tableau analytique (#1817)
 * Avancement, fin estimée et écart au planning, débit, attentes, pistes actives,
 * pertes de connexion / défauts de synchro des saisies distantes.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Icon } from '../common/Icon';
import { useTranslation } from '../../hooks/useTranslation';
import { Donut } from './AnalyticsCharts';
import type { OrganisationKpis } from '../../../features/analytics/services/competitionKpis';

function fmtDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

const fmtClock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const baselineKey = (competitionId: string) => `bp-org-baseline-${competitionId}`;

function readBaseline(competitionId: string): number | null {
  try {
    const v = Number(localStorage.getItem(baselineKey(competitionId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeBaseline(competitionId: string, value: number | null) {
  try {
    if (value == null) localStorage.removeItem(baselineKey(competitionId));
    else localStorage.setItem(baselineKey(competitionId), String(value));
  } catch {
    /* stockage indisponible */
  }
}

const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({
  label,
  value,
  sub,
}) => (
  <div className="bg-white rounded-lg border border-gray-100 p-4">
    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
    <div className="text-2xl font-bold text-gray-800 mt-1">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

export const OrganisationPanel: React.FC<{
  competitionId: string;
  kpis: OrganisationKpis;
}> = ({ competitionId, kpis }) => {
  const { t } = useTranslation();
  const [stored, setBaseline] = useState<number | null>(() => readBaseline(competitionId));
  // Heure de fin initiale = première estimation calculée (planning de référence)
  const baseline = stored ?? kpis.etaAt;
  useEffect(() => {
    if (stored == null && baseline != null) writeBaseline(competitionId, baseline);
  }, [stored, baseline, competitionId]);

  const deviationMin =
    baseline != null && kpis.etaAt != null ? Math.round((kpis.etaAt - baseline) / 60_000) : null;
  const pct = kpis.total ? (kpis.done / kpis.total) * 100 : 0;

  return (
    <div className="space-y-4" data-testid="organisation-panel">
      {/* Fin estimée + écart au planning */}
      <div className="org-eta">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('organisation.eta')}
          </div>
          <div className="org-eta__time">
            {kpis.etaAt != null
              ? fmtClock(kpis.etaAt)
              : kpis.total > 0
                ? t('organisation.all_done')
                : '—'}
          </div>
          {kpis.etaBasis === 'default' && (
            <div className="text-xs text-gray-400">{t('organisation.eta_default')}</div>
          )}
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {t('organisation.deviation')}
          </div>
          <div
            className={`org-eta__deviation ${deviationMin == null ? '' : deviationMin > 0 ? 'is-late' : 'is-ahead'}`}
          >
            {deviationMin == null
              ? '—'
              : deviationMin === 0
                ? t('organisation.on_time')
                : t(deviationMin > 0 ? 'organisation.late_by' : 'organisation.ahead_by', {
                    n: Math.abs(deviationMin),
                  })}
          </div>
          {baseline != null && (
            <div className="text-xs text-gray-400 flex items-center gap-1">
              {t('organisation.planned', { time: fmtClock(baseline) })}
              <button
                type="button"
                className="btn-link"
                title={t('organisation.reset_baseline')}
                aria-label={t('organisation.reset_baseline')}
                onClick={() => {
                  writeBaseline(competitionId, kpis.etaAt);
                  setBaseline(kpis.etaAt);
                }}
              >
                <Icon icon={RotateCcw} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Avancement global */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t('organisation.progress')}
          </div>
          <div className="flex justify-between text-sm mb-1">
            <span>{t('organisation.all_matches')}</span>
            <span className="font-mono">
              {kpis.done}/{kpis.total} ({pct.toFixed(0)}%)
            </span>
          </div>
          <progress
            className="org-bar mb-3"
            max={100}
            value={pct}
            aria-label={t('organisation.all_matches')}
          />
          <div className="flex justify-between text-sm">
            <span>{t('organisation.pools_done')}</span>
            <span className="font-mono">
              {kpis.poolsDone}/{kpis.poolsTotal}
            </span>
          </div>
        </div>

        {/* Anneau en attente / en cours / terminés */}
        <Donut
          title={t('organisation.match_states')}
          centerLabel={String(kpis.total)}
          slices={[
            { label: t('organisation.pending'), value: kpis.pending, color: '#d1d5db' },
            { label: t('organisation.in_progress'), value: kpis.inProgress, color: '#f59e0b' },
            { label: t('organisation.finished'), value: kpis.done, color: '#10b981' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          label={t('organisation.throughput')}
          value={`${kpis.lastHourThroughput}${t('organisation.per_hour')}`}
          sub={t('organisation.throughput_avg', { n: kpis.averageThroughput.toFixed(1) })}
        />
        <Tile
          label={t('organisation.avg_wait')}
          value={fmtDuration(kpis.averageWaitSeconds)}
          sub={t('organisation.avg_wait_hint')}
        />
        <Tile
          label={t('organisation.avg_match')}
          value={fmtDuration(kpis.averageFightSeconds)}
          sub={t('organisation.avg_strip', { d: fmtDuration(kpis.averageWallSeconds) })}
        />
        <Tile
          label={t('organisation.active_strips')}
          value={`${kpis.activeStrips.length}/${kpis.stripCount || '—'}`}
          sub={
            kpis.activeStrips.length
              ? kpis.activeStrips.map(n => t('organisation.strip_n', { n })).join(', ')
              : t('organisation.no_active_strip')
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Avancement des poules, retards en évidence */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('organisation.pools')}
          </div>
          {kpis.pools.length === 0 ? (
            <div className="text-center text-gray-300 text-sm py-4">
              {t('analyticsCharts.no_data')}
            </div>
          ) : (
            <div className="space-y-2">
              {kpis.pools.map(p => (
                <div key={p.poolId} className={`org-pool${p.late ? ' org-pool--late' : ''}`}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium flex items-center gap-1">
                      {t('analytics.pool_n', { n: p.poolNumber })}
                      {p.late && (
                        <span className="org-pool__late">
                          <Icon icon={TriangleAlert} /> {t('organisation.late')}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-gray-600">
                      {p.done}/{p.total}
                      {p.inProgress > 0
                        ? ` · ${t('organisation.n_live', { n: p.inProgress })}`
                        : ''}
                    </span>
                  </div>
                  <progress
                    className={`org-bar${p.late ? ' org-bar--late' : ''}`}
                    max={100}
                    value={p.percent}
                    aria-label={t('analytics.pool_n', { n: p.poolNumber })}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saisies distantes */}
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('organisation.remote')}
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span>{t('organisation.disconnects')}</span>
              <span className="font-mono font-bold">{kpis.remote.disconnects}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('organisation.offline_syncs')}</span>
              <span className="font-mono">{kpis.remote.offlineSyncs}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('organisation.sync_errors')}</span>
              <span
                className={`font-mono ${kpis.remote.syncErrors ? 'text-red-600 font-bold' : ''}`}
              >
                {kpis.remote.syncErrors}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('organisation.dt_calls')}</span>
              <span className="font-mono">{kpis.remote.dtCalls}</span>
            </div>
          </div>
          {kpis.recentIssues.length > 0 && (
            <ul className="org-issues">
              {kpis.recentIssues.map(e => (
                <li key={e.id}>
                  <span className="font-mono">{fmtClock(Date.parse(e.createdAt))}</span>{' '}
                  {e.type === 'disconnect'
                    ? t('organisation.issue_disconnect', {
                        arena: e.arenaId?.replace(/\D+/g, '') || '?',
                      })
                    : t('organisation.issue_sync_error')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
