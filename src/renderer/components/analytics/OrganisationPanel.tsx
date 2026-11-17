/**
 * BellePoule Modern - Onglet « Organisation » du tableau analytique (#1817)
 * Avancement, fin estimée et écart au planning, débit, attentes, pistes actives,
 * pertes de connexion / défauts de synchro des saisies distantes.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Icon } from '../common/Icon';
import { useTranslation } from '../../hooks/useTranslation';
import { Donut } from './AnalyticsCharts';
import type { OrganisationKpis } from '../../../features/analytics/services/competitionKpis';
import {
  getFinalDeviation,
  getPlannedEnd,
  hasPlannedEnd,
  setFinalDeviation,
  setPlannedEnd,
  type FinalDeviation,
  type SchedulePhase,
} from '../../../features/analytics/services/scheduleBaseline';

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

const legacyKey = (competitionId: string) => `bp-org-baseline-${competitionId}`;

/** Sans planning : la première fin estimée sert de référence (mémorisée sur le poste) */
function rememberFirstEstimate(competitionId: string, value: number) {
  try {
    if (!localStorage.getItem(legacyKey(competitionId)))
      localStorage.setItem(legacyKey(competitionId), String(value));
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

const fmtDeviation = (
  t: (k: string, p?: Record<string, string | number>) => string,
  min: number | null
): string =>
  min == null
    ? '—'
    : min === 0
      ? t('organisation.on_time')
      : t(min > 0 ? 'organisation.late_by' : 'organisation.ahead_by', { n: Math.abs(min) });

const minutesBetween = (at: number | null, ref: number | null) =>
  at != null && ref != null ? Math.round((at - ref) / 60_000) : null;

/** Une moitié du bandeau : fin estimée (ou réelle) + écart au planning */
const EtaBlock: React.FC<{
  testId: string;
  etaLabel: string;
  eta: React.ReactNode;
  etaHint?: React.ReactNode;
  deviationLabel: string;
  deviationMin: number | null;
  plannedLabel: string | null;
  onReset?: () => void;
  resetLabel: string;
  t: (k: string, p?: Record<string, string | number>) => string;
}> = ({
  testId,
  etaLabel,
  eta,
  etaHint,
  deviationLabel,
  deviationMin,
  plannedLabel,
  onReset,
  resetLabel,
  t,
}) => (
  <div className="org-eta__half" data-testid={testId}>
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{etaLabel}</div>
      <div className="org-eta__time">{eta}</div>
      {etaHint && <div className="text-xs text-gray-400">{etaHint}</div>}
    </div>
    <div>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {deviationLabel}
      </div>
      <div
        className={`org-eta__deviation ${deviationMin == null ? '' : deviationMin > 0 ? 'is-late' : 'is-ahead'}`}
      >
        {fmtDeviation(t, deviationMin)}
      </div>
      {plannedLabel && (
        <div className="text-xs text-gray-400 flex items-center gap-1">
          {plannedLabel}
          {onReset && (
            <button
              type="button"
              className="btn-link"
              title={resetLabel}
              aria-label={resetLabel}
              onClick={onReset}
            >
              <Icon icon={RotateCcw} />
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

export const OrganisationPanel: React.FC<{
  competitionId: string;
  kpis: OrganisationKpis;
}> = ({ competitionId, kpis }) => {
  const { t } = useTranslation();
  const [, setRev] = useState(0);

  // Poules : référence = fin planifiée des poules (assistant), repli 1re fin estimée
  const plannedPools = getPlannedEnd(competitionId, 'pools');
  const poolsFromPlanning = hasPlannedEnd(competitionId, 'pools');
  const poolsBaseline = plannedPools ?? kpis.poolsEtaAt;
  useEffect(() => {
    if (plannedPools == null && kpis.poolsEtaAt != null)
      rememberFirstEstimate(competitionId, kpis.poolsEtaAt);
  }, [plannedPools, kpis.poolsEtaAt, competitionId]);
  const poolsDeviation = minutesBetween(kpis.poolsEtaAt ?? kpis.poolsEndAt, poolsBaseline);

  // Compétition : fin planifiée du tableau ; avant le tableau, fin des poules + tableau projeté
  const tableauFromPlanning = hasPlannedEnd(competitionId, 'tableau');
  const plannedCompetition = tableauFromPlanning
    ? getPlannedEnd(competitionId, 'tableau')
    : poolsBaseline != null && kpis.tableauProjectionMs != null
      ? poolsBaseline + kpis.tableauProjectionMs
      : null;

  // Compétition terminée (tableau compris) : retard / avance final figé (#1817)
  const finished = kpis.hasTableau && kpis.total > 0 && kpis.done >= kpis.total;
  const storedFinal = finished ? getFinalDeviation(competitionId) : null;
  const final = useMemo<FinalDeviation | null>(() => {
    if (storedFinal) return storedFinal;
    if (!finished || plannedCompetition == null) return null;
    const endAt = kpis.lastEndAt ?? kpis.now;
    return {
      endAt,
      plannedAt: plannedCompetition,
      deviationMin: Math.round((endAt - plannedCompetition) / 60_000),
    };
  }, [storedFinal, finished, plannedCompetition, kpis.lastEndAt, kpis.now]);
  useEffect(() => {
    if (finished && final && !storedFinal) setFinalDeviation(competitionId, final);
    // Matchs ajoutés ou annulés après la fin : l'écart redevient vivant
    if (!finished && kpis.total > 0 && getFinalDeviation(competitionId))
      setFinalDeviation(competitionId, null);
  }, [finished, final, storedFinal, kpis.total, competitionId]);

  const competitionDeviation = final
    ? final.deviationMin
    : minutesBetween(kpis.competitionEtaAt, plannedCompetition);
  const shownCompetitionPlanned = final ? final.plannedAt : plannedCompetition;
  const pct = kpis.total ? (kpis.done / kpis.total) * 100 : 0;
  const reset = (phase: SchedulePhase, at: number | null) =>
    at != null
      ? () => {
          setPlannedEnd(competitionId, phase, at);
          setRev(r => r + 1);
        }
      : undefined;

  return (
    <div className="space-y-4" data-testid="organisation-panel">
      {/* Bandeau : poules à gauche, compétition à droite (#1817) */}
      <div className="org-eta">
        <EtaBlock
          t={t}
          testId="org-eta-pools"
          etaLabel={t('organisation.eta_pools')}
          eta={
            kpis.poolsEtaAt != null
              ? fmtClock(kpis.poolsEtaAt)
              : kpis.poolsEndAt != null
                ? t('organisation.ended_at', { time: fmtClock(kpis.poolsEndAt) })
                : kpis.poolsTotal > 0
                  ? t('organisation.all_done')
                  : '—'
          }
          etaHint={
            kpis.poolsEtaAt != null ? (
              <>
                {/* Base du calcul affichée (#1817) */}
                <div>
                  {t('organisation.eta_cadence', {
                    match: Math.round(kpis.cadence.perMatchMs / 60_000),
                    gap: Math.round(kpis.cadence.changeoverMs / 60_000),
                    strips: kpis.cadence.strips,
                  })}
                </div>
                {kpis.etaBasis === 'default' && <div>{t('organisation.eta_default')}</div>}
              </>
            ) : undefined
          }
          deviationLabel={t('organisation.deviation_pools')}
          deviationMin={poolsDeviation}
          plannedLabel={
            poolsBaseline != null
              ? t(poolsFromPlanning ? 'organisation.planned' : 'organisation.planned_estimate', {
                  time: fmtClock(poolsBaseline),
                })
              : null
          }
          onReset={reset('pools', kpis.poolsEtaAt)}
          resetLabel={t('organisation.reset_baseline')}
        />
        <EtaBlock
          t={t}
          testId="org-eta-competition"
          etaLabel={t('organisation.eta_competition')}
          eta={
            final
              ? t('organisation.ended_at', { time: fmtClock(final.endAt) })
              : kpis.competitionEtaAt != null
                ? fmtClock(kpis.competitionEtaAt)
                : finished
                  ? t('organisation.all_done')
                  : '—'
          }
          etaHint={
            !kpis.hasTableau && kpis.tableauProjectionMs != null
              ? t('organisation.eta_projected')
              : undefined
          }
          deviationLabel={t('organisation.final_deviation')}
          deviationMin={competitionDeviation}
          plannedLabel={
            shownCompetitionPlanned != null
              ? t(
                  tableauFromPlanning || final
                    ? 'organisation.planned'
                    : 'organisation.planned_projected',
                  { time: fmtClock(shownCompetitionPlanned) }
                )
              : null
          }
          onReset={!final && kpis.hasTableau ? reset('tableau', kpis.competitionEtaAt) : undefined}
          resetLabel={t('organisation.reset_baseline')}
        />
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
