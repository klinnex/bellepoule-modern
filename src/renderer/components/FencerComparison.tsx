/**
 * BellePoule Modern - Fencer Comparison Component
 * Licensed under GPL-3.0
 */

import React, { useState, useMemo , memo} from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Fencer, Pool } from '../../shared/types';
import { TableauMatch } from './tableau/tableauTypes';
import { FencerStatsCalculator } from '../../shared/utils/fencerStatsCalculator';

interface FencerComparisonProps {
  fencers: Fencer[];
  pools: Pool[];
  tableauMatches: TableauMatch[];
  onClose: () => void;
}

interface ComparisonStats {
  fencer1: Fencer;
  fencer2: Fencer;
  poolMatches: Array<{
    poolId: string;
    score1: number;
    score2: number;
    winner: string;
  }>;
  tableauMatches: Array<{
    round: string;
    score1: number;
    score2: number;
    winner: string;
  }>;
  totalMatches: number;
  wins1: number;
  wins2: number;
  avgScore1: number;
  avgScore2: number;
  // Statistiques globales des tireurs
  fencer1GlobalStats: {
    matchesPlayed: number;
    victories: number;
    victoryRatio: number;
    touchesScored: number;
    touchesReceived: number;
    index: number;
  };
  fencer2GlobalStats: {
    matchesPlayed: number;
    victories: number;
    victoryRatio: number;
    touchesScored: number;
    touchesReceived: number;
    index: number;
  };
}

const FencerComparison_: React.FC<FencerComparisonProps> = ({
  fencers,
  pools,
  tableauMatches,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [fencer1Id, setFencer1Id] = useState<string>('');
  const [fencer2Id, setFencer2Id] = useState<string>('');

  const comparison = useMemo<ComparisonStats | null>(() => {
    if (!fencer1Id || !fencer2Id || fencer1Id === fencer2Id) return null;

    const fencer1 = fencers.find(f => f.id === fencer1Id);
    const fencer2 = fencers.find(f => f.id === fencer2Id);
    if (!fencer1 || !fencer2) return null;

    const poolMatches: ComparisonStats['poolMatches'] = [];
    const tableauMatchesList: ComparisonStats['tableauMatches'] = [];
    let wins1 = 0;
    let wins2 = 0;
    let totalScore1 = 0;
    let totalScore2 = 0;

    // Chercher les matchs de poule
    pools.forEach(pool => {
      (pool.matches ?? []).forEach(match => {
        const matchFencerAId = match.fencerA?.id;
        const matchFencerBId = match.fencerB?.id;

        if (
          (matchFencerAId === fencer1Id && matchFencerBId === fencer2Id) ||
          (matchFencerAId === fencer2Id && matchFencerBId === fencer1Id)
        ) {
          const isFencer1First = matchFencerAId === fencer1Id;
          const score1 = isFencer1First ? (match.scoreA?.value ?? 0) : (match.scoreB?.value ?? 0);
          const score2 = isFencer1First ? (match.scoreB?.value ?? 0) : (match.scoreA?.value ?? 0);

          // Déterminer le winner basé sur isVictory uniquement
          let winner = '';
          if (match.scoreA?.isVictory) {
            winner = match.fencerA?.id === fencer1Id ? fencer1.lastName : fencer2.lastName;
          } else if (match.scoreB?.isVictory) {
            winner = match.fencerB?.id === fencer1Id ? fencer1.lastName : fencer2.lastName;
          }

          // Compter les victoires - utiliser des if séparés pour chaque fencer
          if (match.fencerA?.id === fencer1Id && match.scoreA?.isVictory) {
            wins1++;
          }
          if (match.fencerB?.id === fencer1Id && match.scoreB?.isVictory) {
            wins1++;
          }
          if (match.fencerA?.id === fencer2Id && match.scoreA?.isVictory) {
            wins2++;
          }
          if (match.fencerB?.id === fencer2Id && match.scoreB?.isVictory) {
            wins2++;
          }

          totalScore1 += score1;
          totalScore2 += score2;

          poolMatches.push({
            poolId: pool.id,
            score1,
            score2,
            winner,
          });
        }
      });
    });

    // Chercher les matchs de tableau
    tableauMatches.forEach(match => {
      const matchFencerAId = match.fencerA?.id;
      const matchFencerBId = match.fencerB?.id;

      if (
        (matchFencerAId === fencer1Id && matchFencerBId === fencer2Id) ||
        (matchFencerAId === fencer2Id && matchFencerBId === fencer1Id)
      ) {
        const isFencer1First = matchFencerAId === fencer1Id;
        const score1 = isFencer1First ? match.scoreA || 0 : match.scoreB || 0;
        const score2 = isFencer1First ? match.scoreB || 0 : match.scoreA || 0;
        const winner = match.winner?.id === fencer1Id ? fencer1.lastName : fencer2.lastName;

        if (match.winner?.id === fencer1Id) wins1++;
        else if (match.winner?.id === fencer2Id) wins2++;

        totalScore1 += score1;
        totalScore2 += score2;

        tableauMatchesList.push({
          round: `1/${match.round}`,
          score1,
          score2,
          winner,
        });
      }
    });

    const totalMatches = poolMatches.length + tableauMatchesList.length;

    // Calculer les statistiques globales des tireurs
    const allPoolMatches = pools.flatMap(p => p.matches);
    const fencer1GlobalStats = FencerStatsCalculator.calculateFencerPoolStats(
      fencer1,
      allPoolMatches
    );
    const fencer2GlobalStats = FencerStatsCalculator.calculateFencerPoolStats(
      fencer2,
      allPoolMatches
    );

    return {
      fencer1,
      fencer2,
      poolMatches,
      tableauMatches: tableauMatchesList,
      totalMatches,
      wins1,
      wins2,
      avgScore1: totalMatches > 0 ? totalScore1 / totalMatches : 0,
      avgScore2: totalMatches > 0 ? totalScore2 / totalMatches : 0,
      fencer1GlobalStats,
      fencer2GlobalStats,
    };
  }, [fencer1Id, fencer2Id, fencers, pools, tableauMatches]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal modal--lg" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal__header">
          <h2 className="modal__title">⚔️ Comparaison Head-to-Head</h2>
          <button className="modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {/* Sélection des tireurs */}
          <div className="comparison__selectors">
            <div className="form-group">
              <label className="form-label">Tireur 1</label>
              <select
                className="form-control"
                value={fencer1Id}
                onChange={e => setFencer1Id(e.target.value)}
              >
                <option value="">Sélectionner un tireur</option>
                {fencers.map(fencer => (
                  <option key={fencer.id} value={fencer.id}>
                    {fencer.lastName} {fencer.firstName} ({fencer.club})
                  </option>
                ))}
              </select>
            </div>

            <div className="comparison__vs">VS</div>

            <div className="form-group">
              <label className="form-label">Tireur 2</label>
              <select
                className="form-control"
                value={fencer2Id}
                onChange={e => setFencer2Id(e.target.value)}
              >
                <option value="">Sélectionner un tireur</option>
                {fencers.map(fencer => (
                  <option key={fencer.id} value={fencer.id}>
                    {fencer.lastName} {fencer.firstName} ({fencer.club})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Résultats de la comparaison */}
          {comparison && (
            <div className="comparison__results">
              {/* Statistiques globales */}
              <div className="comparison__global-stats">
                <h4>📊 Statistiques globales</h4>
                <div className="comparison__stats-grid">
                  {(['fencer1GlobalStats', 'fencer2GlobalStats'] as const).map((key, idx) => {
                    const stats = comparison[key];
                    const otherStats = comparison[idx === 0 ? 'fencer2GlobalStats' : 'fencer1GlobalStats'];
                    const fencer = idx === 0 ? comparison.fencer1 : comparison.fencer2;
                    const cmp = (a: number, b: number, lowerIsBetter = false) => {
                      if (a === b) return 'comparison__stat-value--equal';
                      const better = lowerIsBetter ? a < b : a > b;
                      return better ? 'comparison__stat-value--better' : 'comparison__stat-value--worse';
                    };
                    return (
                      <div key={key} className="comparison__stats-column">
                        <h5>{fencer.lastName}</h5>
                        <div className="comparison__stat-row">
                          <span className="comparison__stat-label">Matchs joués:</span>
                          <span className={`comparison__stat-value ${cmp(stats.matchesPlayed, otherStats.matchesPlayed)}`}>
                            {stats.matchesPlayed}
                          </span>
                        </div>
                        <div className="comparison__stat-row">
                          <span className="comparison__stat-label">Victoires:</span>
                          <span className={`comparison__stat-value ${cmp(stats.victories, otherStats.victories)}`}>
                            {stats.victories}
                          </span>
                        </div>
                        <div className="comparison__stat-row">
                          <span className="comparison__stat-label">Taux de victoire:</span>
                          <span className={`comparison__stat-value ${cmp(stats.victoryRatio, otherStats.victoryRatio)}`}>
                            {(stats.victoryRatio * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="comparison__stat-row">
                          <span className="comparison__stat-label">Touches données:</span>
                          <span className={`comparison__stat-value ${cmp(stats.touchesScored, otherStats.touchesScored)}`}>
                            {stats.touchesScored}
                          </span>
                        </div>
                        <div className="comparison__stat-row">
                          <span className="comparison__stat-label">Touches reçues:</span>
                          <span className={`comparison__stat-value ${cmp(stats.touchesReceived, otherStats.touchesReceived, true)}`}>
                            {stats.touchesReceived}
                          </span>
                        </div>
                        <div className="comparison__stat-row">
                          <span className="comparison__stat-label">Index:</span>
                          <span className={`comparison__stat-value ${cmp(stats.index, otherStats.index)}`}>
                            {stats.index}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cartes des confrontations directes */}
              <div className="comparison__cards">
                <div
                  className={`comparison__card ${comparison.wins1 > comparison.wins2 ? 'comparison__card--winner' : ''}`}
                >
                  <h3>
                    {comparison.fencer1.lastName} {comparison.fencer1.firstName}
                  </h3>
                  <p className="text-muted">{comparison.fencer1.club}</p>
                  <div className="comparison__stat">
                    <span className="comparison__stat-value comparison__stat-value--large">
                      {comparison.wins1}
                    </span>
                    <span className="comparison__stat-label">Victoires directes</span>
                  </div>
                  <div className="comparison__stat">
                    <span className="comparison__stat-value">
                      {comparison.avgScore1.toFixed(1)}
                    </span>
                    <span className="comparison__stat-label">Score moyen</span>
                  </div>
                </div>

                <div className="comparison__divider">
                  <div className="comparison__total-matches">
                    {comparison.totalMatches} match{comparison.totalMatches > 1 ? 's' : ''}
                  </div>
                </div>

                <div
                  className={`comparison__card ${comparison.wins2 > comparison.wins1 ? 'comparison__card--winner' : ''}`}
                >
                  <h3>
                    {comparison.fencer2.lastName} {comparison.fencer2.firstName}
                  </h3>
                  <p className="text-muted">{comparison.fencer2.club}</p>
                  <div className="comparison__stat">
                    <span className="comparison__stat-value comparison__stat-value--large">
                      {comparison.wins2}
                    </span>
                    <span className="comparison__stat-label">Victoires directes</span>
                  </div>
                  <div className="comparison__stat">
                    <span className="comparison__stat-value">
                      {comparison.avgScore2.toFixed(1)}
                    </span>
                    <span className="comparison__stat-label">Score moyen</span>
                  </div>
                </div>
              </div>

              {/* Historique des matchs */}
              {comparison.totalMatches > 0 && (
                <div className="comparison__history">
                  <h4>📜 Historique des confrontations</h4>

                  {comparison.poolMatches.length > 0 && (
                    <div className="comparison__section">
                      <h5>Matchs de poule</h5>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Poule</th>
                            <th>Score {comparison.fencer1.lastName}</th>
                            <th>Score {comparison.fencer2.lastName}</th>
                            <th>Vainqueur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.poolMatches.map((match, idx) => (
                            <tr key={idx}>
                              <td>Poule {match.poolId.slice(-4)}</td>
                              <td
                                className={
                                  match.score1 > match.score2 ? 'text-success font-bold' : ''
                                }
                              >
                                {match.score1}
                              </td>
                              <td
                                className={
                                  match.score2 > match.score1 ? 'text-success font-bold' : ''
                                }
                              >
                                {match.score2}
                              </td>
                              <td>{match.winner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {comparison.tableauMatches.length > 0 && (
                    <div className="comparison__section">
                      <h5>Matchs de tableau</h5>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tour</th>
                            <th>Score {comparison.fencer1.lastName}</th>
                            <th>Score {comparison.fencer2.lastName}</th>
                            <th>Vainqueur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.tableauMatches.map((match, idx) => (
                            <tr key={idx}>
                              <td>{match.round}</td>
                              <td
                                className={
                                  match.score1 > match.score2 ? 'text-success font-bold' : ''
                                }
                              >
                                {match.score1}
                              </td>
                              <td
                                className={
                                  match.score2 > match.score1 ? 'text-success font-bold' : ''
                                }
                              >
                                {match.score2}
                              </td>
                              <td>{match.winner}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {comparison.totalMatches === 0 && (
                <div className="alert alert--info">
                  Ces deux tireurs ne se sont jamais affrontés dans cette compétition.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const FencerComparison = memo(FencerComparison_);
