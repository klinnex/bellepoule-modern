/**
 * BellePoule Modern - Analytics Dashboard Component
 * Real-time performance analytics for coaches
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo, useCallback, memo, Suspense } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Competition, Fencer, Pool, Match, MatchStatus, FencerCompetitionStats } from '../../shared/types';
import { FencerStatsTable } from '../../features/analytics/components/FencerStatsTable';
import { AnalyticsCharts } from './analytics/AnalyticsCharts';
import { exportPostTournamentPDF } from '../../shared/utils/postTournamentReport';
const MatchAuditLog = React.lazy(() => import('./MatchAuditLog').then(m => ({ default: m.MatchAuditLog })));

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

function calculateAverageMatchDuration(matches: Match[]): number {
  if (matches.length === 0) return 0;

  const durations = matches
    .map(match => {
      if (!match.createdAt || !match.updatedAt) return 0;
      return new Date(match.updatedAt).getTime() - new Date(match.createdAt).getTime();
    })
    .filter(d => d > 0);

  return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
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

function calculateFencerPerformance(
  fencerList: Fencer[],
  matches: Match[]
): FencerPerformance[] {
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
    const poolMatches = matches.filter(m =>
      (pool.matches ?? []).some(pm => pm.id === m.id)
    );

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
  timeframe: string
): AnalyticsData {
  const filteredMatches = filterMatchesByTimeframe(matchList, timeframe);
  const completedMatches = filteredMatches.filter(match => match.status === MatchStatus.FINISHED);

  return {
    totalFencers: fencerList.length,
    completedMatches: completedMatches.length,
    totalMatches: filteredMatches.length,
    averageMatchDuration: calculateAverageMatchDuration(completedMatches),
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
      return 'text-green-600 bg-green-100';
    case 'good':
      return 'text-blue-600 bg-blue-100';
    case 'average':
      return 'text-yellow-600 bg-yellow-100';
    case 'poor':
      return 'text-red-600 bg-red-100';
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
  className = '',
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [activeTab, setActiveTab] = useState<'performance' | 'stats' | 'charts' | 'journal'>('performance');
  const [fencerStats, setFencerStats] = useState<FencerCompetitionStats[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'live' | 'last30min' | 'all'>('live');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [exporting, setExporting] = useState(false);

  const loadFencerStats = useCallback(async () => {
    const data = await window.electronAPI?.db?.getCompetitionFencerStats?.(competition.id);
    if (data) setFencerStats(data as FencerCompetitionStats[]);
  }, [competition.id]);

  useEffect(() => { loadFencerStats(); }, [loadFencerStats]);

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

  const analyticsData = useMemo(
    () => calculateAnalytics(competition, pools, matches, fencers, selectedTimeframe),
    [competition, pools, matches, fencers, selectedTimeframe]
  );

  useEffect(() => {
    if (!autoRefresh || selectedTimeframe !== 'live') return;

    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedTimeframe]);

  return (
    <div className="modal-overlay" onClick={onClose}>
    <div ref={modalRef} className={`modal modal--lg analytics-dashboard ${className}`} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Analytics Dashboard</h2>
          <p className="text-gray-600">{competition.title}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autoRefresh" className="text-sm text-gray-600">
              Auto-refresh
            </label>
          </div>
          <select
            value={selectedTimeframe}
            onChange={e => setSelectedTimeframe(e.target.value as 'live' | 'last30min' | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="live">Live</option>
            <option value="last30min">Last 30 min</option>
            <option value="all">All time</option>
          </select>
          <button
            onClick={handleExportReport}
            disabled={exporting}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            title="Exporter le rapport post-tournoi en PDF"
          >
            {exporting ? '⏳' : '📄'} Rapport PDF
          </button>
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl font-bold">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-200 mb-5">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'performance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('performance')}
        >
          Performance
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'stats' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('stats')}
        >
          Statistiques
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'charts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => { setActiveTab('charts'); loadFencerStats(); }}
        >
          Graphiques
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'journal' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('journal')}
        >
          Journal
        </button>
      </div>

      {activeTab === 'stats' && <FencerStatsTable competition={competition} />}
      {activeTab === 'charts' && <AnalyticsCharts competition={competition} stats={fencerStats} />}
      {activeTab === 'journal' && (
        <Suspense fallback={null}>
          <MatchAuditLog competitionId={competition.id} competitionName={competition.title} />
        </Suspense>
      )}

      {activeTab === 'performance' && <>
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-blue-600 text-sm font-medium">Fencers</div>
          <div className="text-2xl font-bold text-blue-800">{analyticsData.totalFencers}</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-green-600 text-sm font-medium">Completed Matches</div>
          <div className="text-2xl font-bold text-green-800">
            {analyticsData.completedMatches}/{analyticsData.totalMatches}
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-purple-600 text-sm font-medium">Avg Match Duration</div>
          <div className="text-2xl font-bold text-purple-800">
            {formatTime(analyticsData.averageMatchDuration)}
          </div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-orange-600 text-sm font-medium">Last Update</div>
          <div className="text-lg font-bold text-orange-800">{lastUpdate.toLocaleTimeString()}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">Top Performers</h3>
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
                      Win rate: {(perf.victoryRate * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{perf.averageScore.toFixed(1)}</div>
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
          <h3 className="text-lg font-semibold mb-4">Pool Progress</h3>
          <div className="space-y-3">
            {analyticsData.poolProgress.map(pool => (
              <div key={pool.poolId} className="p-3 bg-white rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Pool {pool.poolNumber}</span>
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
        <h3 className="text-lg font-semibold mb-4">Weapon Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-600">Total Matches</div>
            <div className="font-bold">{analyticsData.weaponStats.totalMatches}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Avg Victory Margin</div>
            <div className="font-bold">
              {analyticsData.weaponStats.averageVictoryMargin.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Most Touching Match</div>
            <div className="font-bold">{analyticsData.weaponStats.mostTouchingMatch}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Competition</div>
            <div className="font-bold">{competition.weapon}</div>
          </div>
        </div>
      </div>
      </>}
    </div>
    </div>
  );
};

export const AnalyticsDashboard = memo(AnalyticsDashboard_);
