/**
 * BellePoule Modern - Assistant de planning
 * Expose le moteur d'optimisation TournamentFlowManager (jusque-là inutilisé côté UI)
 * pour aider l'organisateur à répartir les matchs restants sur les pistes disponibles.
 * Licensed under GPL-3.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../hooks/useTranslation';
import { Competition, MatchStatus, Pool } from '../../../shared/types';
import {
  TournamentFlowManager,
  DEFAULT_TOURNAMENT_CONFIG,
  Arena as FlowArena,
  FlowOptimizationResult,
  TableauFlowMatch,
} from '../../../shared/services/tournamentFlow';
import { getActiveLocale } from '../../../shared/utils/localeFormat';

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
  const { t } = useTranslation();
  const isTableau = !!tableauBrackets;
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
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
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '560px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="planning-assistant-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="planning-assistant-title">
            {t('planning.title')}
          </h2>
        </div>
        <div className="modal-body u-stack-4">
          <div className="u-row">
            <label htmlFor="planning-arena-count" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {t('planning.strips')}
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
                <strong>{t('planning.finish')}</strong>{' '}
                {tableauResult.estimatedFinishTime.toLocaleTimeString(getActiveLocale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                ({Math.round(tableauResult.totalDuration / 60000)} min)
                <br />
                <strong>{t('planning.ready')}</strong> {tableauResult.readyCount} ·{' '}
                <strong>{t('planning.waiting')}</strong> {tableauResult.waitingCount}
                <br />
                <strong>{t('planning.useful')}</strong> {tableauResult.maxConcurrent}
              </div>
              {tableauResult.recommendations.length === 0 ? (
                <p className="u-hint">{t('planning.no_issue')}</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
                  {tableauResult.recommendations.map((r, i) => (
                    <li key={`tab-rec-${i}`}>{r}</li>
                  ))}
                </ul>
              )}
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-light)' }}>
                {t('planning.rest', { n: DEFAULT_TOURNAMENT_CONFIG.minRestTime })}
              </div>
            </>
          )}

          {!isTableau && loading && (
            <p style={{ color: 'var(--color-text-light)' }}>{t('planning.computing')}</p>
          )}

          {!isTableau && !loading && error && (
            <p role="alert" style={{ color: 'var(--color-danger, #dc2626)', fontSize: '0.875rem' }}>
              {t('planning.error', { error })}
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
                <strong>{t('planning.finish')}</strong>{' '}
                {insights.estimatedFinishTime.toLocaleTimeString(getActiveLocale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                <br />
                <strong>{t('planning.remaining')}</strong> {remainingMatches}
              </div>

              {recommendations.length === 0 && insights.bottlenecks.length === 0 ? (
                <p className="u-hint">{t('planning.no_issue')}</p>
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
                  {t('planning.wait', {
                    avg: Math.max(0, Math.round(result.metrics.averageWaitTime)),
                    max: Math.max(0, Math.round(result.metrics.maxFencerWait)),
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(PlanningAssistant);
