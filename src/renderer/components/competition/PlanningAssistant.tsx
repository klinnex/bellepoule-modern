/**
 * BellePoule Modern - Assistant de planning
 * Expose le moteur d'optimisation TournamentFlowManager (jusque-là inutilisé côté UI)
 * pour aider l'organisateur à répartir les matchs restants sur les pistes disponibles.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Competition, MatchStatus, Pool } from '../../../shared/types';
import {
  TournamentFlowManager,
  DEFAULT_TOURNAMENT_CONFIG,
  Arena as FlowArena,
  FlowOptimizationResult,
  TableauFlowMatch,
} from '../../../shared/services/tournamentFlow';

interface PlanningAssistantProps {
  competition: Competition;
  pools: Pool[];
  /** Phase de tableau : tableau principal puis consolantes (#1018) */
  tableauBrackets?: TableauFlowMatch[][];
  suggestedArenaCount: number;
  onClose: () => void;
}

const PlanningAssistant: React.FC<PlanningAssistantProps> = ({
  competition,
  pools,
  tableauBrackets,
  suggestedArenaCount,
  onClose,
}) => {
  const isTableau = !!tableauBrackets;
  const [arenaCount, setArenaCount] = useState(Math.max(1, suggestedArenaCount));
  const [result, setResult] = useState<FlowOptimizationResult | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [insights, setInsights] = useState<{
    estimatedFinishTime: Date;
    bottlenecks: string[];
    recommendations: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manager = useMemo(() => new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG), []);

  const arenas: FlowArena[] = useMemo(
    () =>
      Array.from({ length: arenaCount }, (_, i) => ({
        id: `piste-${i + 1}`,
        name: `Piste ${i + 1}`,
        available: true,
      })),
    [arenaCount]
  );

  const tableauResult = useMemo(
    () => (tableauBrackets ? manager.optimizeTableauFlow(tableauBrackets, arenas) : null),
    [manager, tableauBrackets, arenas]
  );

  useEffect(() => {
    if (isTableau) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    manager
      .optimizeTournamentFlow(competition, pools, arenas)
      .then(res => {
        if (cancelled) return;
        setResult(res);
        setRecommendations(manager.getFlowRecommendations(res.schedule, arenas, res.metrics));
        setInsights(manager.generatePredictiveInsights(competition, pools, res.schedule));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        // Ne jamais laisser « Calcul en cours » bloqué (#1018)
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manager, competition, pools, arenas, isTableau]);

  const remainingMatches = pools.reduce(
    (sum, p) => sum + p.matches.filter(m => m.status !== MatchStatus.FINISHED).length,
    0
  );

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 11000 }}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '560px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-assistant-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="planning-assistant-title">
            🗓️ Assistant de planning
          </h2>
        </div>
        <div
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="planning-arena-count" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Nombre de pistes disponibles
            </label>
            <input
              id="planning-arena-count"
              type="number"
              min={1}
              max={20}
              value={arenaCount}
              onChange={e => setArenaCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              style={{ width: '4rem' }}
            />
          </div>

          {tableauResult && (
            <>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                <strong>Fin estimée :</strong>{' '}
                {tableauResult.estimatedFinishTime.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                ({Math.round(tableauResult.totalDuration / 60000)} min)
                <br />
                <strong>Duels prêts :</strong> {tableauResult.readyCount} ·{' '}
                <strong>en attente :</strong> {tableauResult.waitingCount}
                <br />
                <strong>Pistes utiles :</strong> {tableauResult.maxConcurrent}
              </div>
              {tableauResult.recommendations.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>
                  Aucun point de vigilance détecté avec cette configuration.
                </p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                  {tableauResult.recommendations.map((r, i) => (
                    <li key={`tab-rec-${i}`}>{r}</li>
                  ))}
                </ul>
              )}
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-light)' }}>
                Estimation : {DEFAULT_TOURNAMENT_CONFIG.minRestTime} min de repos entre deux duels
                d&apos;un tireur.
              </div>
            </>
          )}

          {!isTableau && loading && (
            <p style={{ color: 'var(--color-text-light)' }}>Calcul en cours…</p>
          )}

          {!isTableau && !loading && error && (
            <p role="alert" style={{ color: 'var(--color-danger, #dc2626)', fontSize: '0.875rem' }}>
              Calcul impossible : {error}
            </p>
          )}

          {!isTableau && !loading && insights && (
            <>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                }}
              >
                <strong>Fin estimée :</strong>{' '}
                {insights.estimatedFinishTime.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                <br />
                <strong>Matchs restants :</strong> {remainingMatches}
              </div>

              {recommendations.length === 0 && insights.bottlenecks.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-light)' }}>
                  Aucun point de vigilance détecté avec cette configuration.
                </p>
              ) : (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '1.25rem',
                    fontSize: '0.875rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                  }}
                >
                  {recommendations.map((r, i) => (
                    <li key={`rec-${i}`}>{r}</li>
                  ))}
                  {insights.bottlenecks.map((b, i) => (
                    <li key={`bn-${i}`}>⚠️ {b}</li>
                  ))}
                </ul>
              )}

              {result && result.schedule.length > 0 && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-light)' }}>
                  Attente entre deux matchs (poule la plus grande, ordre officiel) : moyenne{' '}
                  {Math.max(0, Math.round(result.metrics.averageWaitTime))} min, max{' '}
                  {Math.max(0, Math.round(result.metrics.maxFencerWait))} min
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PlanningAssistant);
