/**
 * BellePoule Modern - Analytics Dashboard Component
 * Real-time performance analytics for coaches
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo, useCallback, memo, Suspense } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTranslation } from '../hooks/useTranslation';
import {
  Competition,
  Fencer,
  Pool,
  Match,
  MatchStatus,
  MatchTiming,
  RemoteEvent,
  FencerCompetitionStats,
  PoolRanking,
} from '../../shared/types';
import { FencerStatsTable } from '../../features/analytics/components/FencerStatsTable';
import { AnalyticsCharts } from './analytics/AnalyticsCharts';
import { OrganisationPanel } from './analytics/OrganisationPanel';
import { ColumnsMenu, useColumnVisibility, type ColumnDef } from './analytics/ColumnsMenu';
import {
  averageMatchSeconds,
  organisationKpis,
  type KpiTableauMatch,
  type LiveArena,
} from '../../features/analytics/services/competitionKpis';
import { exportPostTournamentPDF } from '../../shared/utils/postTournamentReport';
import { FileText, Hourglass, Square } from 'lucide-react';
import { Icon } from './common/Icon';
import { Button } from './common/Button';
const MatchAuditLog = React.lazy(() =>
  import('./MatchAuditLog').then(m => ({ default: m.MatchAuditLog }))
);

interface AnalyticsData {
  totalFencers: number;
  completedMatches: number;
  totalMatches: number;
  averageMatchDuration: number;
  fencerPerformance: FencerPerformance[];
  weaponStats: WeaponStats;
  poolProgress: PoolProgress[];
}

interface FencerPerformance {
  fencer: Fencer;
  victoryRate: number;
  averageScore: number;
  touchesScoredPerMatch: number;
  touchesReceivedPerMatch: number;
  currentStreak: number;
  bestStreak: number;
  recentForm: 'excellent' | 'good' | 'average' | 'poor';
}

interface WeaponStats {
  totalMatches: number;
  averageVictoryMargin: number;
  longestMatch: number;
  shortestMatch: number;
  mostTouchingMatch: number;
}

interface PoolProgress {
  poolId: string;
  poolNumber: number;
  completionPercentage: number;
  averageTimeRemaining: number;
  projectedFinishTime: Date;
}

export interface AnalyticsDashboardProps {
  competition: Competition;
  pools: Pool[];
  matches: Match[];
  fencers: Fencer[];
  /** Matchs du tableau (KPI par tireur, organisation) — #1817 */
  tableauMatches?: KpiTableauMatch[];
  /** Classement général après poules */
  overallRanking?: PoolRanking[];
  /** Classement final après tableaux */
  finalResults?: Array<{ rank: number; fencer: { id: string } }>;
  className?: string;
  onClose?: () => void;
}

// ── Pure helper functions (defined outside component to avoid TDZ and re-creation) ──

function filterMatchesByTimeframe(matchList: Match[], timeframe: string): Match[] {
  if (timeframe === 'all') return matchList;

  const now = new Date();
  const cutoffTime = new Date(now.getTime() - (timeframe === 'last30min' ? 30 : 5) * 60 * 1000);

  return matchList.filter(match => {
    if (!match.updatedAt) return false;
    return new Date(match.updatedAt) >= cutoffTime;
  });
}

/**
 * Durée moyenne d'un match (ms) : temps de combat enregistré (repos exclus, #1817).
 * L'ancien calcul (création → dernière mise à jour du match) mesurait le temps écoulé
 * depuis la génération des poules, d'où des valeurs aberrantes.
 */
function calculateAverageMatchDuration(matches: Match[], timings: MatchTiming[]): number {
  const ids = new Set(matches.map(m => m.id));
  const own = timings.filter(t => ids.has(t.matchId));
  return averageMatchSeconds(own.length ? own : timings) * 1000;
}

function calculateCurrentStreak(fencer: Fencer, matches: Match[]): number {
  const fencerMatches = matches
    .filter(m => m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id)
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

  let streak = 0;
  for (const match of fencerMatches) {
    const isA = match.fencerA?.id === fencer.id;
    const score = isA ? match.scoreA : match.scoreB;

    if (score?.isVictory) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function calculateBestStreak(_fencer: Fencer, _matches: Match[]): number {
  return 0;
}

function calculateRecentForm(
  fencer: Fencer,
  matches: Match[]
): 'excellent' | 'good' | 'average' | 'poor' {
  const recentMatches = matches
    .filter(m => m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id)
    .slice(-5);

  if (recentMatches.length === 0) return 'average';

  const victories = recentMatches.filter(m => {
    const isA = m.fencerA?.id === fencer.id;
    const score = isA ? m.scoreA : m.scoreB;
    return score?.isVictory;
  }).length;

  const winRate = victories / recentMatches.length;

  if (winRate >= 0.8) return 'excellent';
  if (winRate >= 0.6) return 'good';
  if (winRate >= 0.4) return 'average';
  return 'poor';
}

function calculateFencerPerformance(fencerList: Fencer[], matches: Match[]): FencerPerformance[] {
  return fencerList
    .map(fencer => {
      const fencerMatches = matches.filter(
        m =>
          (m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id) &&
          m.status === MatchStatus.FINISHED
      );

      const victories = fencerMatches.filter(m => {
        const isA = m.fencerA?.id === fencer.id;
        const score = isA ? m.scoreA : m.scoreB;
        return score?.isVictory;
      }).length;

      const totalScored = fencerMatches.reduce((total, match) => {
        const isA = match.fencerA?.id === fencer.id;
        const score = isA ? match.scoreA : match.scoreB;
        return total + (score?.value || 0);
      }, 0);

      const totalReceived = fencerMatches.reduce((total, match) => {
        const isA = match.fencerA?.id === fencer.id;
        const score = isA ? match.scoreB : match.scoreA;
        return total + (score?.value || 0);
      }, 0);

      const currentStreak = calculateCurrentStreak(fencer, matches);
      const bestStreak = calculateBestStreak(fencer, matches);
      const recentForm = calculateRecentForm(fencer, matches);

      return {
        fencer,
        victoryRate: fencerMatches.length > 0 ? victories / fencerMatches.length : 0,
        averageScore: fencerMatches.length > 0 ? totalScored / fencerMatches.length : 0,
        touchesScoredPerMatch: fencerMatches.length > 0 ? totalScored / fencerMatches.length : 0,
        touchesReceivedPerMatch:
          fencerMatches.length > 0 ? totalReceived / fencerMatches.length : 0,
        currentStreak,
        bestStreak,
        recentForm,
      };
    })
    .sort((a, b) => b.victoryRate - a.victoryRate);
}

function calculateWeaponStats(matches: Match[]): WeaponStats {
  const margins = matches
    .map(m => {
      if (m.status !== MatchStatus.FINISHED) return 0;
      return Math.abs((m.scoreA?.value || 0) - (m.scoreB?.value || 0));
    })
    .filter(m => m > 0);

  const totalTouches = matches.map(m => (m.scoreA?.value || 0) + (m.scoreB?.value || 0));
  const mostTouchingMatch = totalTouches.length > 0 ? Math.max(...totalTouches) : 0;

  return {
    totalMatches: matches.length,
    averageVictoryMargin:
      margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0,
    longestMatch: 0,
    shortestMatch: 0,
    mostTouchingMatch,
  };
}

function calculatePoolProgress(pools: Pool[], matches: Match[]): PoolProgress[] {
  return pools.map(pool => {
    const poolMatches = matches.filter(m => (pool.matches ?? []).some(pm => pm.id === m.id));

    const completed = poolMatches.filter(m => m.status === MatchStatus.FINISHED).length;
    const completionPercentage =
      poolMatches.length > 0 ? (completed / poolMatches.length) * 100 : 0;

    return {
      poolId: pool.id,
      poolNumber: pool.number || 0,
      completionPercentage,
      averageTimeRemaining: 0,
      projectedFinishTime: new Date(),
    };
  });
}

function calculateAnalytics(
  _comp: Competition,
  poolList: Pool[],
  matchList: Match[],
  fencerList: Fencer[],
  timeframe: string,
  timings: MatchTiming[] = []
): AnalyticsData {
  const filteredMatches = filterMatchesByTimeframe(matchList, timeframe);
  const completedMatches = filteredMatches.filter(match => match.status === MatchStatus.FINISHED);

  return {
    totalFencers: fencerList.length,
    completedMatches: completedMatches.length,
    totalMatches: filteredMatches.length,
    averageMatchDuration: calculateAverageMatchDuration(completedMatches, timings),
    fencerPerformance: calculateFencerPerformance(fencerList, completedMatches),
    weaponStats: calculateWeaponStats(completedMatches),
    poolProgress: calculatePoolProgress(poolList, filteredMatches),
  };
}

function formatTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getFormColor(form: string): string {
  switch (form) {
    case 'excellent':
      return 'text-green-700 bg-green-50';
    case 'good':
      return 'text-blue-600 bg-blue-50';
    case 'average':
      return 'text-yellow-600 bg-yellow-50';
    case 'poor':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

const AnalyticsDashboard_: React.FC<AnalyticsDashboardProps> = ({
  competition,
  pools,
  matches,
  fencers,
  tableauMatches = [],
  overallRanking = [],
  finalResults = [],
  className = '',
  onClose,
}) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  type AnalyticsTab = 'performance' | 'stats' | 'charts' | 'organisation' | 'journal' | 'referees';
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('performance');
  const [fencerStats, setFencerStats] = useState<FencerCompetitionStats[]>([]);
  const [refereeStats, setRefereeStats] = useState<
    Array<{
      refereeId: string;
      refereeName: string;
      matchesCount: number;
      averageDuration: number;
      cardsYellow: number;
      cardsRed: number;
      cardsBlack: number;
      dtCalls: number;
      averageRestSeconds: number;
    }>
  >([]);
  const TABS: { id: AnalyticsTab; label: string }[] = [
    { id: 'performance', label: t('analytics.tab_performance') },
    { id: 'stats', label: t('analytics.tab_stats') },
    { id: 'charts', label: t('analytics.tab_charts') },
    { id: 'organisation', label: t('analytics.tab_organisation') },
    { id: 'journal', label: t('analytics.tab_journal') },
    { id: 'referees', label: t('analytics.tab_referees') },
  ];
  const refereeColumns: ColumnDef[] = [
    { id: 'matches', label: t('analytics.matches') },
    { id: 'duration', label: t('analytics.avg_duration_short') },
    { id: 'rest', label: t('analytics.avg_rest') },
    { id: 'dt', label: t('analytics.dt_calls') },
    { id: 'yellow', label: t('stats.yellow_cards') },
    { id: 'red', label: t('stats.red_cards') },
    { id: 'black', label: t('analytics.black_cards') },
  ];
  const refCols = useColumnVisibility('bp-analytics-referee-columns', refereeColumns);
  const [timings, setTimings] = useState<MatchTiming[]>([]);
  const [remoteEvents, setRemoteEvents] = useState<RemoteEvent[]>([]);
  const [liveArenas, setLiveArenas] = useState<LiveArena[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selectedTimeframe, setSelectedTimeframe] = useState<'live' | 'last30min' | 'all'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadFencerStats = useCallback(async () => {
    const data = await window.electronAPI?.db?.getCompetitionFencerStats?.(competition.id);
    if (data) setFencerStats(data as FencerCompetitionStats[]);
  }, [competition.id]);

  const loadRefereeStats = useCallback(async () => {
    const data = await window.electronAPI?.db?.getRefereeStats?.(competition.id);
    if (data) setRefereeStats(data);
  }, [competition.id]);

  useEffect(() => {
    loadFencerStats();
  }, [loadFencerStats]);

  // Horodatage des matchs, événements distants et pistes en direct (#1817)
  const loadOrganisation = useCallback(async () => {
    const api = window.electronAPI;
    const [tm, ev, ar] = await Promise.all([
      api?.db?.getMatchTimings?.(competition.id).catch(() => null),
      api?.db?.getRemoteEvents?.(competition.id).catch(() => null),
      api?.remote?.getArenas?.(competition.id).catch(() => null),
    ]);
    if (Array.isArray(tm)) setTimings(tm);
    if (Array.isArray(ev)) setRemoteEvents(ev);
    setLiveArenas(
      (ar?.arenas ?? []).map(a => ({
        number: a.number,
        status: a.status,
        matchId: a.currentMatch?.id ?? null,
      }))
    );
    setNow(Date.now());
  }, [competition.id]);

  useEffect(() => {
    void loadOrganisation();
  }, [loadOrganisation, matches]);

  useEffect(() => {
    if (!autoRefresh || activeTab !== 'organisation') return;
    const id = window.setInterval(() => void loadOrganisation(), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, activeTab, loadOrganisation]);

  const orgKpis = useMemo(
    () =>
      organisationKpis({
        pools,
        tableauMatches,
        timings,
        events: remoteEvents,
        arenas: liveArenas,
        now,
      }),
    [pools, tableauMatches, timings, remoteEvents, liveArenas, now]
  );
  const poolRanks = useMemo(
    () => new Map(overallRanking.map(r => [r.fencer.id, r.rank])),
    [overallRanking]
  );
  const finalRanks = useMemo(
    () => new Map(finalResults.map(r => [r.fencer.id, r.rank])),
    [finalResults]
  );

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const [fencerStats, matchesWithRefs] = await Promise.all([
        window.electronAPI.db.getCompetitionFencerStats(competition.id),
        window.electronAPI.db.getMatchesWithReferees(competition.id),
      ]);
      const logo = localStorage.getItem('bellepoule-logo') ?? undefined;
      await exportPostTournamentPDF(competition, fencerStats, matchesWithRefs, logo);
    } finally {
      setExporting(false);
    }
  };

  const latest = useMemo(
    () => ({
      data: calculateAnalytics(competition, pools, matches, fencers, selectedTimeframe, timings),
      at: new Date(),
      timeframe: selectedTimeframe,
    }),
    [competition, pools, matches, fencers, selectedTimeframe, timings]
  );
  // Auto-refresh décoché en mode live : on fige le dernier instantané (#1293)
  const [snapshot, setSnapshot] = useState(latest);
  const following = autoRefresh || selectedTimeframe !== 'live' || snapshot.timeframe !== 'live';
  if (following && snapshot !== latest) setSnapshot(latest);
  const shown = following ? latest : snapshot;
  const analyticsData = shown.data;
  const lastUpdate = shown.at;

  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className={`modal analytics-dashboard ${className}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <h2>{t('analytics.title')}</h2>
            <p className="analytics-dashboard__subtitle">{competition.title}</p>
          </div>
          {onClose && (
            <button className="btn-close" aria-label={t('actions.close')} onClick={onClose}>
              ×
            </button>
          )}
        </div>

        <div className="analytics-dashboard__toolbar">
          <label htmlFor="autoRefresh">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            {t('analytics.auto_refresh')}
          </label>
          <select
            className="form-select"
            aria-label={t('analytics.tf_all')}
            value={selectedTimeframe}
            onChange={e => setSelectedTimeframe(e.target.value as 'live' | 'last30min' | 'all')}
          >
            <option value="live">{t('analytics.tf_live')}</option>
            <option value="last30min">{t('analytics.tf_30')}</option>
            <option value="all">{t('analytics.tf_all')}</option>
          </select>
          <span className="analytics-dashboard__spacer" />
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportReport}
            loading={exporting}
            title={t('analytics.export_title')}
          >
            <Icon icon={exporting ? Hourglass : FileText} /> {t('analytics.report_pdf')}
          </Button>
        </div>

        <div className="modal-body">
          <div className="settings-layout">
            <nav className="settings-nav" role="tablist" aria-orientation="vertical">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`analytics-tab-${tab.id}`}
                  aria-selected={tab.id === activeTab}
                  aria-controls="analytics-panel"
                  className={`settings-nav-item${tab.id === activeTab ? ' is-active' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'charts') loadFencerStats();
                    if (tab.id === 'referees') loadRefereeStats();
                    if (tab.id === 'organisation' || tab.id === 'charts') void loadOrganisation();
                  }}
                >
                  <span className="settings-nav-label">{tab.label}</span>
                </button>
              ))}
            </nav>
            <div
              className="settings-panel"
              id="analytics-panel"
              role="tabpanel"
              aria-labelledby={`analytics-tab-${activeTab}`}
            >
              {activeTab === 'stats' && <FencerStatsTable competition={competition} />}
              {activeTab === 'charts' && (
                <AnalyticsCharts
                  competition={competition}
                  stats={fencerStats}
                  fencers={fencers}
                  poolMatches={matches}
                  tableauMatches={tableauMatches}
                  timings={timings}
                  poolRanks={poolRanks}
                  finalRanks={finalRanks}
                />
              )}
              {activeTab === 'organisation' && (
                <OrganisationPanel competitionId={competition.id} kpis={orgKpis} />
              )}
              {activeTab === 'journal' && (
                <Suspense fallback={null}>
                  <MatchAuditLog
                    competitionId={competition.id}
                    competitionName={competition.title}
                  />
                </Suspense>
              )}
              {activeTab === 'referees' &&
                (refereeStats.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-sm">
                    {t('analytics.no_referee')}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end mb-2">
                      <ColumnsMenu
                        columns={refereeColumns}
                        isVisible={refCols.isVisible}
                        onToggle={refCols.toggle}
                      />
                    </div>
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="text-left px-3 py-2 font-semibold text-gray-500">
                            {t('analytics.referee')}
                          </th>
                          {refCols.isVisible('matches') && (
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">
                              {t('analytics.matches')}
                            </th>
                          )}
                          {refCols.isVisible('duration') && (
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">
                              {t('analytics.avg_duration_short')}
                            </th>
                          )}
                          {refCols.isVisible('rest') && (
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">
                              {t('analytics.avg_rest')}
                            </th>
                          )}
                          {refCols.isVisible('dt') && (
                            <th className="text-right px-3 py-2 font-semibold text-gray-500">
                              {t('analytics.dt_calls')}
                            </th>
                          )}
                          {refCols.isVisible('yellow') && (
                            <th className="text-right px-3 py-2 font-semibold text-yellow-600">
                              <Icon icon={Square} className="icon-fill icon-yellow" />
                            </th>
                          )}
                          {refCols.isVisible('red') && (
                            <th className="text-right px-3 py-2 font-semibold text-red-600">
                              <Icon icon={Square} className="icon-fill icon-red" />
                            </th>
                          )}
                          {refCols.isVisible('black') && (
                            <th className="text-right px-3 py-2 font-semibold text-gray-800">
                              <Icon icon={Square} className="icon-fill icon-black" />
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {refereeStats.map((r, i) => (
                          <tr key={r.refereeId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-2 font-medium text-gray-800">{r.refereeName}</td>
                            {refCols.isVisible('matches') && (
                              <td className="px-3 py-2 text-right">{r.matchesCount}</td>
                            )}
                            {refCols.isVisible('duration') && (
                              <td className="px-3 py-2 text-right font-mono">
                                {formatTime(r.averageDuration * 1000)}
                              </td>
                            )}
                            {refCols.isVisible('rest') && (
                              <td className="px-3 py-2 text-right font-mono">
                                {r.averageRestSeconds
                                  ? formatTime(r.averageRestSeconds * 1000)
                                  : '—'}
                              </td>
                            )}
                            {refCols.isVisible('dt') && (
                              <td className="px-3 py-2 text-right">{r.dtCalls ?? 0}</td>
                            )}
                            {refCols.isVisible('yellow') && (
                              <td className="px-3 py-2 text-right">{r.cardsYellow}</td>
                            )}
                            {refCols.isVisible('red') && (
                              <td className="px-3 py-2 text-right">{r.cardsRed}</td>
                            )}
                            {refCols.isVisible('black') && (
                              <td className="px-3 py-2 text-right">{r.cardsBlack}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ))}

              {activeTab === 'performance' && (
                <>
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-blue-600 text-sm font-medium">
                        {t('analytics.fencers')}
                      </div>
                      <div className="text-2xl font-bold text-blue-800">
                        {analyticsData.totalFencers}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-green-600 text-sm font-medium">
                        {t('analytics.completed')}
                      </div>
                      <div className="text-2xl font-bold text-green-800">
                        {analyticsData.completedMatches}/{analyticsData.totalMatches}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="text-purple-600 text-sm font-medium">
                        {t('analytics.avg_duration')}
                      </div>
                      <div className="text-2xl font-bold text-purple-800">
                        {formatTime(analyticsData.averageMatchDuration)}
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <div className="text-orange-600 text-sm font-medium">
                        {t('analytics.last_update')}
                      </div>
                      <div className="text-lg font-bold text-orange-800">
                        {lastUpdate.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Performers */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4">{t('analytics.top')}</h3>
                      <div className="space-y-2">
                        {analyticsData.fencerPerformance.slice(0, 5).map((perf, index) => (
                          <div
                            key={perf.fencer.id}
                            className="flex items-center justify-between p-2 bg-white rounded"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                                {index + 1}
                              </div>
                              <div>
                                <div className="font-medium">{`${perf.fencer.lastName} ${perf.fencer.firstName?.charAt(0)}.`}</div>
                                <div className="text-xs text-gray-500">
                                  {t('analytics.win_rate', {
                                    rate: (perf.victoryRate * 100).toFixed(1),
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div
                                className="font-medium"
                                title={t('analytics.touches_per_match_title')}
                              >
                                {perf.averageScore.toFixed(1)}{' '}
                                <span className="text-xs text-gray-500">
                                  {t('analytics.touches_per_match')}
                                </span>
                              </div>
                              <div
                                className={`text-xs px-2 py-1 rounded-full ${getFormColor(perf.recentForm)}`}
                              >
                                {perf.recentForm}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pool Progress */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4">{t('analytics.pool_progress')}</h3>
                      <div className="space-y-3">
                        {analyticsData.poolProgress.map(pool => (
                          <div key={pool.poolId} className="p-3 bg-white rounded">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-medium">
                                {t('analytics.pool_n', { n: pool.poolNumber })}
                              </span>
                              <span className="text-sm text-gray-600">
                                {pool.completionPercentage.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${pool.completionPercentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Weapon Statistics */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold mb-4">{t('analytics.weapon_stats')}</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-gray-600">{t('analytics.total_matches')}</div>
                        <div className="font-bold">{analyticsData.weaponStats.totalMatches}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">{t('analytics.avg_margin')}</div>
                        <div className="font-bold">
                          {analyticsData.weaponStats.averageVictoryMargin.toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">{t('analytics.most_touching')}</div>
                        <div className="font-bold">
                          {analyticsData.weaponStats.mostTouchingMatch}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">{t('analytics.competition')}</div>
                        <div className="font-bold">{competition.weapon}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AnalyticsDashboard = memo(AnalyticsDashboard_);
