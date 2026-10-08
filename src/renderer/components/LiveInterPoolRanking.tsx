/**
 * BellePoule Modern - Live Inter-Pool Ranking
 * Classement général temps réel agrégeant toutes les poules
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Pool, PoolRanking, Weapon, MatchStatus } from '../../shared/types';
import {
  calculateOverallRanking,
  calculateOverallRankingQuest,
} from '../../shared/utils/poolCalculations';
import { formatRatio, formatIndex, formatQuestPerMatch } from '../../shared/utils/poolCalculations';

interface LiveInterPoolRankingProps {
  pools: Pool[];
  weapon: Weapon;
  isLaserSabre: boolean;
  onClose: () => void;
}

interface RankedEntry extends PoolRanking {
  poolNumber: number;
}

export const LiveInterPoolRanking: React.FC<LiveInterPoolRankingProps> = ({
  pools,
  weapon,
  isLaserSabre,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [ranking, setRanking] = useState<RankedEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const buildRanking = useCallback(() => {
    const overall = isLaserSabre
      ? calculateOverallRankingQuest(pools)
      : calculateOverallRanking(pools);

    const fencerPoolMap = new Map<string, number>();
    for (const pool of pools) {
      for (const fencer of pool.fencers) {
        fencerPoolMap.set(fencer.id, pool.number);
      }
    }

    const entries: RankedEntry[] = overall.map(r => ({
      ...r,
      poolNumber: fencerPoolMap.get(r.fencer.id) ?? 0,
    }));

    setRanking(entries);
    setLastUpdate(new Date());
  }, [pools, isLaserSabre]);

  useEffect(() => {
    buildRanking();
    const interval = setInterval(buildRanking, 3000);
    return () => clearInterval(interval);
  }, [buildRanking]);

  const totalMatches = pools.reduce((s, p) => s + p.matches.length, 0);
  const finishedMatches = pools.reduce(
    (s, p) => s + p.matches.filter(m => m.status === MatchStatus.FINISHED).length,
    0
  );
  const progress = totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#22c55e',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <h2 style={{ margin: 0 }}>Classement général — Live</h2>
          </div>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div
          style={{
            padding: '0.75rem 1.5rem',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Matchs terminés : {finishedMatches}/{totalMatches}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  width: '200px',
                  height: '6px',
                  background: '#e5e7eb',
                  borderRadius: '3px',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: '#3b82f6',
                    borderRadius: '3px',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{progress}%</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              Mis à jour {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0 }}>
                <th style={thStyle}>Rg</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Nom</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Club</th>
                <th style={thStyle}>Poule</th>
                <th style={thStyle}>V</th>
                <th style={thStyle}>D</th>
                <th style={thStyle}>TD</th>
                <th style={thStyle}>TR</th>
                <th style={thStyle}>Ind.</th>
                {isLaserSabre && <th style={thStyle}>Quest</th>}
                {isLaserSabre && <th style={thStyle}>Q/M</th>}
              </tr>
            </thead>
            <tbody>
              {ranking.map((entry, idx) => (
                <tr
                  key={entry.fencer.id}
                  style={{
                    background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                    borderBottom: '1px solid #f3f4f6',
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 700, color: rankColor(idx + 1) }}>
                    {idx + 1}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>
                    {entry.fencer.lastName} {entry.fencer.firstName}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', color: '#6b7280' }}>
                    {entry.fencer.club || '—'}
                  </td>
                  <td style={tdStyle}>{entry.poolNumber}</td>
                  <td style={{ ...tdStyle, color: '#16a34a', fontWeight: 600 }}>
                    {entry.victories}
                  </td>
                  <td style={{ ...tdStyle, color: '#dc2626' }}>{entry.defeats}</td>
                  <td style={tdStyle}>{entry.touchesScored}</td>
                  <td style={tdStyle}>{entry.touchesReceived}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                    {formatIndex(entry.index)}
                  </td>
                  {isLaserSabre && <td style={tdStyle}>{entry.questPoints ?? 0}</td>}
                  {isLaserSabre && <td style={tdStyle}>{formatQuestPerMatch(entry)}</td>}
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td
                    colSpan={isLaserSabre ? 11 : 9}
                    style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}
                  >
                    Aucun résultat disponible
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function rankColor(rank: number): string {
  if (rank === 1) return '#d97706';
  if (rank === 2) return '#6b7280';
  if (rank === 3) return '#b45309';
  return '#1f2937';
}

const thStyle: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: '#4b5563',
  borderBottom: '2px solid #e5e7eb',
};

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  textAlign: 'center',
};

export default React.memo(LiveInterPoolRanking);
