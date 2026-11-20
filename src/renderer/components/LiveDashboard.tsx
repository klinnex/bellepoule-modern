/**
 * BellePoule Modern - Live Public Dashboard
 * Public-facing interface for spectators
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Competition, Pool, Match, MatchStatus, Weapon } from '../../shared/types';
import { formatIndex } from '../../shared/utils/poolCalculations';
import {
  PANEL_TITLE,
  TABLE,
  CELL_CENTER_FLEX,
  TH,
  MONO_CELL,
  STAT_VALUE,
  SUB_TEXT,
  ROW_TEXT,
} from './liveDashboard.styles';
import { getActiveLocale } from '../../shared/utils/localeFormat';
import EmptyState from './common/EmptyState';
import { useTranslation } from '../hooks/useTranslation';
import { Award, ChartColumn, Medal, Swords, Trophy } from 'lucide-react';
import { Icon } from './common/Icon';

interface LiveDashboardProps {
  competition: Competition;
  pools: Pool[];
  currentPhase: 'pools' | 'tableau' | 'results';
  tableauMatches?: Match[];
  finalResults?: any[];
  weapon?: Weapon;
}

export const LiveDashboard: React.FC<LiveDashboardProps> = ({
  competition,
  pools,
  currentPhase,
  tableauMatches = [],
  finalResults = [],
  weapon,
}) => {
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'pools' | 'tableau' | 'ranking'>('pools');
  const [refreshInterval] = useState<number>(5000);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Get matches in progress — mémorisé pour ne pas recalculer à chaque tick d'horloge (1 Hz)
  const matchesInProgress = useMemo(
    () => pools.flatMap(pool => pool.matches.filter(m => m.status === MatchStatus.IN_PROGRESS)),
    [pools]
  );

  // Heure de début observée par match en cours (le modèle Match ne porte pas d'heure de début réelle)
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});
  useEffect(() => {
    setStartedAt(prev => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const m of matchesInProgress) {
        const known = prev[m.id];
        next[m.id] = known ?? (m.startTime ? new Date(m.startTime).getTime() : Date.now());
        if (known === undefined) changed = true;
      }
      return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev;
    });
  }, [matchesInProgress]);
  const nowMs = currentTime.getTime();

  // Get completed matches
  const completedMatches = useMemo(
    () => pools.flatMap(pool => pool.matches.filter(m => m.status === MatchStatus.FINISHED)),
    [pools]
  );

  // Calculate completion percentage
  const totalMatches = useMemo(
    () => pools.reduce((sum, pool) => sum + pool.matches.length, 0),
    [pools]
  );
  const completionRate =
    totalMatches > 0 ? Math.round((completedMatches.length / totalMatches) * 100) : 0;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(getActiveLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const isLaserSabre = weapon === Weapon.LASER;

  return (
    <div className="is-b477c3">
      {/* Header */}
      <header className="live-dashboard-1">
        <div className="live-dashboard-2">
          <div>
            <h1 className="live-dashboard-3">
              <Icon icon={Trophy} /> {competition.title}
            </h1>
            <p className="live-dashboard-4">
              {new Date(competition.date).toLocaleDateString(getActiveLocale(), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {competition.location && ` • ${competition.location}`}
            </p>
          </div>
          <div className="live-dashboard-5">
            <div className="live-dashboard-6">{formatTime(currentTime)}</div>
            <div className="live-dashboard-7">{t('liveDashboard.live')}</div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="live-dashboard-8">
        <div className="live-dashboard-9">
          <div className="live-dashboard-10">
            <span>{t('liveDashboard.progress', { rate: completionRate })}</span>
            <span>
              {t('liveDashboard.finished', { done: completedMatches.length, total: totalMatches })}
            </span>
          </div>
          <div className="live-dashboard-11">
            <div
              style={{
                height: '100%',
                width: `${completionRate}%`,
                background: 'linear-gradient(90deg, #10b981, #34d399)',
                borderRadius: '4px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="live-dashboard-12">
        <div className="live-dashboard-13">
          {(['pools', 'tableau', 'ranking'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '1rem 2rem',
                border: 'none',
                background: activeTab === tab ? 'var(--color-primary)' : 'transparent',
                color: activeTab === tab ? 'white' : 'var(--color-text-light)',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderBottom:
                  activeTab === tab ? '3px solid var(--color-primary)' : '3px solid transparent',
              }}
            >
              {tab === 'pools' && (
                <>
                  <Icon icon={ChartColumn} /> {t('phases.pools')}
                </>
              )}
              {tab === 'tableau' && (
                <>
                  <Icon icon={Swords} /> {t('phases.tableau')}
                </>
              )}
              {tab === 'ranking' && (
                <>
                  <Icon icon={Award} /> {t('phases.ranking')}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="live-dashboard-14">
        {activeTab === 'pools' && (
          <div>
            {/* Live Matches */}
            {matchesInProgress.length > 0 && (
              <div className="live-dashboard-15">
                <h2 style={PANEL_TITLE}>
                  {t('liveDashboard.in_progress', { n: matchesInProgress.length })}
                </h2>
                <div className="live-dashboard-16">
                  {matchesInProgress.map((match, idx) => (
                    <LiveMatchCard
                      key={match.id}
                      match={match}
                      index={idx}
                      elapsed={Math.max(
                        0,
                        Math.floor((nowMs - (startedAt[match.id] ?? nowMs)) / 1000)
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Pool Results */}
            <div>
              <h2 style={PANEL_TITLE}>{t('liveDashboard.pool_results')}</h2>
              <div className="live-dashboard-17">
                {pools.map(pool => (
                  <PoolResultsCard key={pool.id} pool={pool} isLaserSabre={isLaserSabre} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tableau' && (
          <div>
            <h2 style={PANEL_TITLE}>{t('liveDashboard.elimination')}</h2>
            <TableauView matches={tableauMatches} />
          </div>
        )}

        {activeTab === 'ranking' && (
          <div>
            <h2 style={PANEL_TITLE}>{t('liveDashboard.final_ranking')}</h2>
            <FinalRankingView results={finalResults} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="live-dashboard-18">
        <p className="live-dashboard-19">{t('liveDashboard.footer')}</p>
        <p className="live-dashboard-20">
          {t('liveDashboard.auto_refresh', { n: refreshInterval / 1000 })}
        </p>
      </footer>
    </div>
  );
};

// Live Match Card Component
const LiveMatchCard_: React.FC<{ match: Match; index: number; elapsed: number }> = ({
  match,
  index,
  elapsed,
}) => {
  const { t } = useTranslation();

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="live-dashboard-21">
      <div className="live-dashboard-22">
        <span className="live-dashboard-23">
          {t('liveDashboard.live_badge', { t: formatElapsed(elapsed) })}
        </span>
        <span className="live-dashboard-24">
          {t('liveDashboard.strip', { n: match.strip || index + 1 })}
        </span>
      </div>

      <div className="u-row-between">
        <div style={CELL_CENTER_FLEX}>
          <div style={STAT_VALUE}>
            {match.fencerA?.firstName} {match.fencerA?.lastName}
          </div>
          <div style={SUB_TEXT}>{match.fencerA?.club}</div>
        </div>

        <div className="live-dashboard-25">
          <span className="live-dashboard-26">{match.scoreA?.value || 0}</span>
          <span className="live-dashboard-27">:</span>
          <span className="live-dashboard-28">{match.scoreB?.value || 0}</span>
        </div>

        <div style={CELL_CENTER_FLEX}>
          <div style={STAT_VALUE}>
            {match.fencerB?.firstName} {match.fencerB?.lastName}
          </div>
          <div style={SUB_TEXT}>{match.fencerB?.club}</div>
        </div>
      </div>
    </div>
  );
};

// Pool Results Card Component
const PoolResultsCard_: React.FC<{ pool: Pool; isLaserSabre?: boolean }> = ({
  pool,
  isLaserSabre = false,
}) => {
  const { t } = useTranslation();
  const completedCount = pool.matches.filter(m => m.status === MatchStatus.FINISHED).length;
  const progress = pool.matches.length > 0 ? (completedCount / pool.matches.length) * 100 : 0;

  return (
    <div className="ld-card">
      <div className="ld-pool-head">
        <h3 className="ld-pool-title">{t('liveDashboard.pool', { n: pool.number })}</h3>
        <span className={`ld-pool-badge${pool.isComplete ? ' ld-pool-badge--done' : ''}`}>
          {pool.isComplete ? '✓ Terminée' : `${Math.round(progress)}%`}
        </span>
      </div>

      {pool.ranking.length > 0 ? (
        <table style={TABLE}>
          <thead>
            <tr className="ld-head-row">
              <th className="ld-th ld-th--left">{t('liveDashboard.rank')}</th>
              <th className="ld-th ld-th--left">{t('liveDashboard.fencer')}</th>
              <th className="ld-th">V</th>
              {isLaserSabre && <th className="ld-th ld-th--quest">{t('liveDashboard.quest')}</th>}
              <th className="ld-th">{t('ranking.touches_scored')}</th>
              <th className="ld-th">{t('ranking.touches_received')}</th>
              <th className="ld-th">{t('liveDashboard.ind')}</th>
            </tr>
          </thead>
          <tbody>
            {pool.ranking.slice(0, 5).map((rank, idx) => {
              const index = rank.touchesScored - rank.touchesReceived;
              return (
                <tr key={idx} className="ld-row">
                  <td className={`ld-td ld-td--rank${idx < 3 ? ' ld-td--rank-top' : ''}`}>
                    {idx + 1}
                  </td>
                  <td className="ld-td">
                    <div className="ld-name">
                      {rank.fencer.firstName} {rank.fencer.lastName}
                    </div>
                  </td>
                  <td className="ld-td ld-td--center">{rank.victories}</td>
                  {isLaserSabre && (
                    <td className="ld-td ld-td--center ld-td--quest">{rank.questPoints || 0}</td>
                  )}
                  <td style={MONO_CELL}>{rank.touchesScored}</td>
                  <td style={MONO_CELL}>{rank.touchesReceived}</td>
                  <td
                    className={`ld-td ld-td--center ld-td--index${index >= 0 ? '' : ' ld-td--index-neg'}`}
                  >
                    {formatIndex(index)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="ld-empty">{t('liveDashboard.no_results')}</p>
      )}
    </div>
  );
};

// Tableau View Component
const TableauView_: React.FC<{ matches: Match[] }> = ({ matches }) => {
  const { t } = useTranslation();
  const rounds = [128, 64, 32, 16, 8, 4, 2, 1];

  return (
    <div className="ld-card ld-card--roomy">
      {matches.length === 0 ? (
        <EmptyState title={t('liveDashboard.tableau_not_started')} />
      ) : (
        <div className="ld-rounds">
          {rounds.map(round => {
            const roundMatches = matches.filter(m => m.round === round);
            if (roundMatches.length === 0) return null;

            return (
              <div key={round} className="ld-round">
                <h4 className="ld-round-title">
                  {round === 1 ? 'Finale' : round === 2 ? 'Demi-finales' : `1/${round}`}
                </h4>
                <div className="u-stack-4">
                  {roundMatches.map(match => {
                    const a = match.scoreA?.value;
                    const b = match.scoreB?.value;
                    const scored = a != null && b != null;
                    return (
                      <div
                        key={match.id}
                        className={`ld-match${match.status === MatchStatus.FINISHED ? ' ld-match--done' : ''}`}
                      >
                        <div className="ld-match-line ld-match-line--first">
                          <span style={ROW_TEXT}>
                            {match.fencerA?.firstName?.charAt(0)}. {match.fencerA?.lastName}
                          </span>
                          <span className={`ld-score${scored && a > b ? ' ld-score--win' : ''}`}>
                            {a ?? '-'}
                          </span>
                        </div>
                        <div className="ld-match-line">
                          <span style={ROW_TEXT}>
                            {match.fencerB?.firstName?.charAt(0)}. {match.fencerB?.lastName}
                          </span>
                          <span className={`ld-score${scored && b > a ? ' ld-score--win' : ''}`}>
                            {b ?? '-'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Final Ranking View
const FinalRankingView_: React.FC<{ results: any[] }> = ({ results }) => {
  const { t } = useTranslation();
  return (
    <div className="ld-card ld-card--flush">
      {results.length === 0 ? (
        <p className="ld-empty ld-empty--roomy">{t('liveDashboard.not_finished')}</p>
      ) : (
        <table style={TABLE}>
          <thead>
            <tr className="ld-final-head">
              <th className="ld-final-th">{t('liveDashboard.rank')}</th>
              <th style={TH}>{t('liveDashboard.fencer')}</th>
              <th style={TH}>{t('liveDashboard.club')}</th>
              <th className="ld-final-th">{t('liveDashboard.phase')}</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, idx) => (
              <tr key={idx} className="ld-final-row">
                <td className="ld-final-td ld-final-td--center">
                  <span className={`ld-medal${idx < 3 ? ` ld-medal--${idx + 1}` : ''}`}>
                    {idx + 1}
                  </span>
                </td>
                <td className="ld-final-td ld-final-td--name">
                  {result.fencer?.firstName} {result.fencer?.lastName}
                </td>
                <td className="ld-final-td">{result.fencer?.club || '-'}</td>
                <td className="ld-final-td ld-final-td--center">
                  {result.round === 1 ? (
                    <>
                      <Icon icon={Medal} className="medal-gold" /> {t('tableau.round_final')}
                    </>
                  ) : result.round === 2 ? (
                    <>
                      <Icon icon={Medal} className="medal-silver" /> {t('kiosk.round_semi')}
                    </>
                  ) : (
                    `1/${result.round}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const LiveMatchCard = React.memo(LiveMatchCard_);
const PoolResultsCard = React.memo(PoolResultsCard_);
const TableauView = React.memo(TableauView_);
const FinalRankingView = React.memo(FinalRankingView_);

export default React.memo(LiveDashboard);
