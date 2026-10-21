/**
 * BellePoule Modern - Aperçu temps réel de la simulation de formule
 */

import React, { memo } from 'react';
import { FormulaSimulation } from '../../../shared/types';
import { useTranslation } from '../../hooks/useTranslation';

type TFn = ReturnType<typeof useTranslation>['t'];

interface Props {
  simulation: FormulaSimulation;
  fencerCount: number;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function phaseLabel(t: TFn, type: string, index: number): string {
  if (type === 'pool_round') return t('formula.pool_round_n', { n: index + 1 });
  if (type === 'direct_elimination') return t('formulaSim.de');
  return t('formulaSim.final_ranking');
}

const FormulaSimulationPreview_: React.FC<Props> = ({ simulation, fencerCount }) => {
  const { t } = useTranslation();
  return (
    <div className="formula-simulation-preview">
      <h4 className="simulation-title">{t('formulaSim.title', { n: fencerCount })}</h4>

      <div className="simulation-flowchart">
        <div className="sim-node sim-node-input">
          <span className="sim-fencer-count">{fencerCount}</span>
          <span className="sim-label">{t('formulaSim.fencers')}</span>
        </div>

        {simulation.phases.map((phase, i) => (
          <React.Fragment key={i}>
            <div className="sim-arrow">↓</div>
            <div className={`sim-node sim-node-${phase.type}`}>
              <div className="sim-phase-name">{phaseLabel(t, phase.type, i)}</div>

              {phase.type === 'pool_round' && phase.poolCount !== undefined && (
                <div className="sim-phase-detail">
                  {t('formulaSim.pools', { count: phase.poolCount })}
                  {phase.poolSizes && phase.poolSizes.length > 0 && (
                    <span className="sim-pool-sizes">
                      {' '}
                      {t('formulaSim.pool_sizes', {
                        sizes: Array.from(new Set(phase.poolSizes))
                          .sort((a, b) => a - b)
                          .join('-'),
                      })}
                    </span>
                  )}
                </div>
              )}

              {phase.type === 'direct_elimination' && phase.bracketSize !== undefined && (
                <div className="sim-phase-detail">
                  {t('formulaPhase.bracket_of', { n: phase.bracketSize })}
                </div>
              )}

              {phase.matchCount !== undefined && (
                <div className="sim-match-count">
                  {t('formulaSim.matches', { n: phase.matchCount })}
                </div>
              )}

              {phase.advancingFencers !== undefined && phase.type !== 'classification' && (
                <div className="sim-advancing">
                  {t('formulaSim.advancing', { n: phase.advancingFencers })}
                </div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="simulation-totals">
        <div className="sim-total-item">
          <span className="sim-total-label">{t('formulaSim.total_matches')}</span>
          <strong>{simulation.totalMatches}</strong>
        </div>
        <div className="sim-total-item">
          <span className="sim-total-label">{t('formulaSim.duration')}</span>
          <strong>{formatDuration(simulation.estimatedDurationMinutes)}</strong>
        </div>
      </div>

      {simulation.warnings.length > 0 && (
        <div className="simulation-warnings">
          {simulation.warnings.map((w, i) => (
            <div key={i} className="sim-warning">
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const FormulaSimulationPreview = memo(FormulaSimulationPreview_);
