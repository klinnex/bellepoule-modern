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
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const isLaserSabre = weapon === Weapon.LASER;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
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
            <h1 style={{ margin: 0, fontSize: '2rem', color: '#1f2937', fontWeight: '700' }}>
              🏆 {competition.title}
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '1.1rem' }}>
              {new Date(competition.date).toLocaleDateString('fr-FR', {
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
                color: '#1f2937',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatTime(currentTime)}
            </div>
            <div style={{ color: '#10b981', fontSize: '1rem', fontWeight: '500' }}>● EN DIRECT</div>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div style={{ background: 'white', padding: '1rem 2rem', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              color: '#374151',
            }}
          >
            <span>Progression: {completionRate}%</span>
            <span>
              {completedMatches.length} / {totalMatches} matchs terminés
            </span>
          </div>
          <div
            style={{
              height: '8px',
              background: '#e5e7eb',
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
      <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex' }}>
          {(['pools', 'tableau', 'ranking'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '1rem 2rem',
                border: 'none',
                background: activeTab === tab ? '#3b82f6' : 'transparent',
                color: activeTab === tab ? 'white' : '#6b7280',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
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
                <h2 style={PANEL_TITLE}>🔴 Matchs en cours ({matchesInProgress.length})</h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {matchesInProgress.map((match, idx) => (
                    <LiveMatchCard key={match.id} match={match} index={idx} />
                  ))}
                </div>
              </div>
            )}

            {/* Pool Results */}
            <div>
              <h2 style={PANEL_TITLE}>📋 Résultats des Poules</h2>
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
            <h2 style={PANEL_TITLE}>⚔️ Phase Éliminatoire</h2>
            <TableauView matches={tableauMatches} />
          </div>
        )}

        {activeTab === 'ranking' && (
          <div>
            <h2 style={PANEL_TITLE}>🏅 Classement Final</h2>
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
        <p style={{ margin: 0, opacity: 0.8 }}>
          BellePoule Modern • Suivez la compétition en temps réel
        </p>
        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', opacity: 0.6 }}>
          Actualisation automatique toutes les {refreshInterval / 1000} secondes
        </p>
      </footer>
    </div>
  );
};

// Live Match Card Component
const LiveMatchCard_: React.FC<{ match: Match; index: number }> = ({ match, index }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

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
          🔴 LIVE • {formatElapsed(elapsed)}
        </span>
        <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Piste {match.strip || index + 1}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>:</span>
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
  const completedCount = pool.matches.filter(m => m.status === MatchStatus.FINISHED).length;
  const progress = pool.matches.length > 0 ? (completedCount / pool.matches.length) * 100 : 0;

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
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
        <h3 style={{ margin: 0, color: '#1f2937', fontSize: '1.25rem' }}>Poule {pool.number}</h3>
        <span
          style={{
            background: pool.isComplete ? '#d1fae5' : '#fef3c7',
            color: pool.isComplete ? '#065f46' : '#92400e',
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.875rem',
            fontWeight: '600',
          }}
        >
          {pool.isComplete ? '✓ Terminée' : `${Math.round(progress)}%`}
        </span>
      </div>

      {pool.ranking.length > 0 ? (
        <table style={TABLE}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.5rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                Rang
              </th>
              <th
                style={{
                  textAlign: 'left',
                  padding: '0.5rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                Tireur
              </th>
              <th
                style={{
                  textAlign: 'center',
                  padding: '0.5rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                V
              </th>
              {isLaserSabre && (
                <th
                  style={{
                    textAlign: 'center',
                    padding: '0.5rem',
                    color: '#7c3aed',
                    fontSize: '0.875rem',
                  }}
                >
                  Quest
                </th>
              )}
              <th
                style={{
                  textAlign: 'center',
                  padding: '0.5rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                TD
              </th>
              <th
                style={{
                  textAlign: 'center',
                  padding: '0.5rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                TR
              </th>
              <th
                style={{
                  textAlign: 'center',
                  padding: '0.5rem',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                Ind
              </th>
            </tr>
          </thead>
          <tbody>
            {pool.ranking.slice(0, 5).map((rank, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td
                  style={{
                    padding: '0.5rem',
                    fontWeight: '700',
                    color: idx < 3 ? '#f59e0b' : '#6b7280',
                  }}
                >
                  {idx + 1}
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <div style={{ fontWeight: '500', color: '#1f2937' }}>
                    {rank.fencer.firstName} {rank.fencer.lastName}
                  </div>
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600' }}>
                  {rank.victories}
                </td>
                {isLaserSabre && (
                  <td
                    style={{
                      padding: '0.5rem',
                      textAlign: 'center',
                      fontWeight: '600',
                      color: '#7c3aed',
                    }}
                  >
                    {rank.questPoints || 0}
                  </td>
                )}
                <td style={MONO_CELL}>{rank.touchesScored}</td>
                <td style={MONO_CELL}>{rank.touchesReceived}</td>
                <td
                  style={{
                    padding: '0.5rem',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    fontWeight: '600',
                    color: rank.touchesScored - rank.touchesReceived >= 0 ? '#059669' : '#DC2626',
                  }}
                >
                  {formatIndex(rank.touchesScored - rank.touchesReceived)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
          Pas encore de résultats
        </p>
      )}
    </div>
  );
};

// Tableau View Component
const TableauView_: React.FC<{ matches: Match[] }> = ({ matches }) => {
  const rounds = [128, 64, 32, 16, 8, 4, 2, 1];

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      }}
    >
      {matches.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '1.1rem' }}>
          Le tableau n'a pas encore commencé
        </p>
      ) : (
        <div style={{ display: 'flex', gap: '2rem', overflowX: 'auto' }}>
          {rounds.map(round => {
            const roundMatches = matches.filter(m => m.round === round);
            if (roundMatches.length === 0) return null;

            return (
              <div key={round} style={{ minWidth: '250px' }}>
                <h4
                  style={{
                    textAlign: 'center',
                    marginBottom: '1rem',
                    color: '#1f2937',
                    fontSize: '0.875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {round === 1 ? 'Finale' : round === 2 ? 'Demi-finales' : `1/${round}`}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {roundMatches.map(match => (
                    <div
                      key={match.id}
                      style={{
                        background: match.status === MatchStatus.FINISHED ? '#f0fdf4' : '#f9fafb',
                        border: '1px solid',
                        borderColor: match.status === MatchStatus.FINISHED ? '#86efac' : '#e5e7eb',
                        borderRadius: '8px',
                        padding: '1rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <span style={ROW_TEXT}>
                          {match.fencerA?.firstName?.charAt(0)}. {match.fencerA?.lastName}
                        </span>
                        <span
                          style={{
                            fontWeight: '700',
                            color:
                              match.scoreA?.value != null &&
                              match.scoreB?.value != null &&
                              match.scoreA.value > match.scoreB.value
                                ? '#16a34a'
                                : '#1f2937',
                          }}
                        >
                          {match.scoreA?.value ?? '-'}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={ROW_TEXT}>
                          {match.fencerB?.firstName?.charAt(0)}. {match.fencerB?.lastName}
                        </span>
                        <span
                          style={{
                            fontWeight: '700',
                            color:
                              match.scoreA?.value != null &&
                              match.scoreB?.value != null &&
                              match.scoreB.value > match.scoreA.value
                                ? '#16a34a'
                                : '#1f2937',
                          }}
                        >
                          {match.scoreB?.value ?? '-'}
                        </span>
                      </div>
                    </div>
                  ))}
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
  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      }}
    >
      {results.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem', fontSize: '1.1rem' }}>
          La compétition n'est pas encore terminée
        </p>
      ) : (
        <table style={TABLE}>
          <thead>
            <tr style={{ background: '#f3f4f6' }}>
              <th
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: '#374151',
                  fontWeight: '600',
                }}
              >
                Rang
              </th>
              <th style={TH}>Tireur</th>
              <th style={TH}>Club</th>
              <th
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: '#374151',
                  fontWeight: '600',
                }}
              >
                Phase
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '2rem',
                      height: '2rem',
                      borderRadius: '50%',
                      background:
                        idx === 0
                          ? '#fbbf24'
                          : idx === 1
                            ? '#9ca3af'
                            : idx === 2
                              ? '#f59e0b'
                              : '#f3f4f6',
                      color: idx < 3 ? 'white' : '#6b7280',
                      fontWeight: '700',
                    }}
                  >
                    {idx + 1}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontWeight: '500', color: '#1f2937' }}>
                  {result.fencer?.firstName} {result.fencer?.lastName}
                </td>
                <td style={{ padding: '1rem', color: '#6b7280' }}>{result.fencer?.club || '-'}</td>
                <td style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
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
