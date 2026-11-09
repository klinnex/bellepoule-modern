/**
 * BellePoule Modern - Live Public Dashboard
 * Public-facing interface for spectators
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Competition, Pool, Match, MatchStatus, PoolRanking, Weapon } from '../../shared/types';
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
import { useTranslation } from '../hooks/useTranslation';

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
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);

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
      <header
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '1.5rem 2rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1
              style={{ margin: 0, fontSize: '2rem', color: 'var(--color-text)', fontWeight: '700' }}
            >
              🏆 {competition.title}
            </h1>
            <p
              style={{
                margin: '0.5rem 0 0 0',
                color: 'var(--color-text-light)',
                fontSize: '1.1rem',
              }}
            >
              {new Date(competition.date).toLocaleDateString(getActiveLocale(), {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {competition.location && ` • ${competition.location}`}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: '2.5rem',
                fontWeight: '700',
                color: 'var(--color-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTime(currentTime)}
            </div>
            <div style={{ color: '#10b981', fontSize: '1rem', fontWeight: '500' }}>
              {t('liveDashboard.live')}
            </div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div
        style={{
          background: 'white',
          padding: '1rem 2rem',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              color: 'var(--color-text)',
            }}
          >
            <span>{t('liveDashboard.progress', { rate: completionRate })}</span>
            <span>
              {t('liveDashboard.finished', { done: completedMatches.length, total: totalMatches })}
            </span>
          </div>
          <div
            style={{
              height: '8px',
              background: 'var(--color-border)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
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
      <div style={{ background: 'white', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex' }}>
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
              {tab === 'pools' && '📊 Poules'}
              {tab === 'tableau' && '⚔️ Tableau'}
              {tab === 'ranking' && '🏅 Classement'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        {activeTab === 'pools' && (
          <div>
            {/* Live Matches */}
            {matchesInProgress.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={PANEL_TITLE}>
                  {t('liveDashboard.in_progress', { n: matchesInProgress.length })}
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '1rem',
                  }}
                >
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                  gap: '1.5rem',
                }}
              >
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
      <footer
        style={{
          background: 'rgba(0,0,0,0.2)',
          color: 'white',
          textAlign: 'center',
          padding: '1.5rem',
          marginTop: '2rem',
        }}
      >
        <p style={{ margin: 0, opacity: 0.8 }}>{t('liveDashboard.footer')}</p>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', opacity: 0.6 }}>
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
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 10px 15px rgba(0,0,0,0.1)',
        border: '2px solid #fbbf24',
        animation: 'pulse 2s infinite',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <span
          style={{
            background: '#fef3c7',
            color: '#92400e',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: '600',
          }}
        >
          {t('liveDashboard.live_badge', { t: formatElapsed(elapsed) })}
        </span>
        <span style={{ color: 'var(--color-text-light)', fontSize: '0.875rem' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0 1.5rem' }}>
          <span
            style={{
              fontSize: '3rem',
              fontWeight: '700',
              color: '#dc2626',
              fontFamily: 'var(--font-digital)',
            }}
          >
            {match.scoreA?.value || 0}
          </span>
          <span style={{ fontSize: '1.5rem', color: 'var(--color-text-muted)' }}>:</span>
          <span
            style={{
              fontSize: '3rem',
              fontWeight: '700',
              color: '#16a34a',
              fontFamily: 'var(--font-digital)',
            }}
          >
            {match.scoreB?.value || 0}
          </span>
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
        <p className="ld-empty ld-empty--plain">{t('liveDashboard.tableau_not_started')}</p>
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
                  {result.round === 1
                    ? '🥇 Finale'
                    : result.round === 2
                      ? '🥈 Demi'
                      : `1/${result.round}`}
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
