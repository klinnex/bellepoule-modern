/**
 * BellePoule Modern - Historical Stats
 * Statistiques historiques d'un tireur sur plusieurs compétitions
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { logger, LogCategory } from '@shared/services/logger';

interface CompetitionResult {
  competitionId: string;
  competitionTitle: string;
  date: string;
  rank: number;
  victories: number;
  defeats: number;
  touchesScored: number;
  touchesReceived: number;
  weapon: string;
}

interface HistoricalStatsProps {
  fencerId: string;
  fencerName: string;
  onClose: () => void;
}

export const HistoricalStats: React.FC<HistoricalStatsProps> = ({
  fencerId,
  fencerName,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // @ts-ignore — API optionnelle, peut ne pas exister sur toutes les versions
        const data = await window.electronAPI?.db?.getFencerStats?.(fencerId);
        if (data && Array.isArray(data)) {
          setResults(data as CompetitionResult[]);
        } else {
          // Données de démonstration si l'API n'existe pas encore
          setResults(DEMO_DATA(fencerId));
        }
      } catch (err) {
        logger.warn(
          LogCategory.UI,
          '[HistoricalStats] getFencerStats unavailable, using demo data'
        );
        setResults(DEMO_DATA(fencerId));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fencerId]);

  const totalCompetitions = results.length;
  const bestRank = results.length > 0 ? Math.min(...results.map(r => r.rank)) : null;
  const totalVictories = results.reduce((s, r) => s + r.victories, 0);
  const totalDefeats = results.reduce((s, r) => s + r.defeats, 0);
  const ratio =
    totalVictories + totalDefeats > 0
      ? ((totalVictories / (totalVictories + totalDefeats)) * 100).toFixed(1)
      : '—';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '750px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 style={{ margin: 0 }}>Historique — {fencerName}</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                padding: '1rem 1.5rem',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                flexShrink: 0,
              }}
            >
              <StatCard label="Compétitions" value={totalCompetitions.toString()} />
              <StatCard label="Meilleur rang" value={bestRank !== null ? `${bestRank}e` : '—'} />
              <StatCard label="Victoires" value={totalVictories.toString()} color="#16a34a" />
              <StatCard label="% victoires" value={`${ratio}%`} />
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {results.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
                  Aucun historique disponible
                </div>
              ) : (
                <>
                  <div
                    style={{
                      padding: '0.75rem 1.5rem',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      fontFamily: 'monospace',
                    }}
                  >
                    {sparkline(results.map(r => r.rank))}
                  </div>
                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
                  >
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={thS}>Date</th>
                        <th style={{ ...thS, textAlign: 'left' }}>Compétition</th>
                        <th style={thS}>Arme</th>
                        <th style={thS}>Rang</th>
                        <th style={thS}>V</th>
                        <th style={thS}>D</th>
                        <th style={thS}>TD/TR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={r.competitionId + i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={tdS}>{r.date}</td>
                          <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>
                            {r.competitionTitle}
                          </td>
                          <td style={tdS}>{r.weapon}</td>
                          <td style={{ ...tdS, fontWeight: 700, color: rankColor(r.rank) }}>
                            {r.rank}
                          </td>
                          <td style={{ ...tdS, color: '#16a34a' }}>{r.victories}</td>
                          <td style={{ ...tdS, color: '#dc2626' }}>{r.defeats}</td>
                          <td style={tdS}>
                            {r.touchesScored}/{r.touchesReceived}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: color ?? '#1f2937' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{label}</div>
    </div>
  );
}

function sparkline(ranks: number[]): string {
  if (ranks.length === 0) return '';
  const max = Math.max(...ranks);
  const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  return (
    'Évolution des rangs : ' +
    ranks
      .map(r => {
        const pct = max > 1 ? 1 - (r - 1) / (max - 1) : 1;
        return bars[Math.floor(pct * (bars.length - 1))];
      })
      .join('')
  );
}

function rankColor(rank: number): string {
  if (rank === 1) return '#d97706';
  if (rank === 2) return '#6b7280';
  if (rank === 3) return '#b45309';
  return '#1f2937';
}

const thS: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: '#4b5563',
  borderBottom: '2px solid #e5e7eb',
};
const tdS: React.CSSProperties = { padding: '0.5rem 0.75rem', textAlign: 'center' };

function DEMO_DATA(fencerId: string): CompetitionResult[] {
  return [
    {
      competitionId: `${fencerId}-1`,
      competitionTitle: 'Championnat régional IDF',
      date: '2025-10-12',
      rank: 3,
      victories: 4,
      defeats: 1,
      touchesScored: 22,
      touchesReceived: 15,
      weapon: 'E',
    },
    {
      competitionId: `${fencerId}-2`,
      competitionTitle: 'Tournoi de Paris',
      date: '2025-11-20',
      rank: 1,
      victories: 6,
      defeats: 0,
      touchesScored: 30,
      touchesReceived: 8,
      weapon: 'E',
    },
    {
      competitionId: `${fencerId}-3`,
      competitionTitle: 'Open Île-de-France',
      date: '2026-01-15',
      rank: 5,
      victories: 3,
      defeats: 2,
      touchesScored: 18,
      touchesReceived: 20,
      weapon: 'E',
    },
  ];
}

export default React.memo(HistoricalStats);
