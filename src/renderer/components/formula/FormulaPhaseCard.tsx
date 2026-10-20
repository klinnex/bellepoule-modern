/**
 * BellePoule Modern - Carte d'une phase dans le pipeline de formule
 */

import React, { useState, memo } from 'react';
import {
  CustomDEConfig,
  CustomPoolRoundConfig,
  FormulaPhaseNode,
  FormulaPhaseNodeType,
} from '../../../shared/types';
import { AdvancementRuleEditor } from './AdvancementRuleEditor';
import { RankingCriteriaEditor } from './RankingCriteriaEditor';
import { ScoringZoneEditor } from './ScoringZoneEditor';

/** Score max : valeurs usuelles + saisie libre */
const MaxScoreField: React.FC<{
  value: number;
  options: number[];
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ value, options, onChange, disabled }) => {
  const [custom, setCustom] = useState(!options.includes(value));
  return (
    <>
      <select
        className="form-input"
        value={custom ? 'custom' : value}
        onChange={e => {
          if (e.target.value === 'custom') setCustom(true);
          else {
            setCustom(false);
            onChange(Number(e.target.value));
          }
        }}
        disabled={disabled}
      >
        {options.map(v => (
          <option key={v} value={v}>
            {v} touches
          </option>
        ))}
        <option value="custom">Autre…</option>
      </select>
      {custom && (
        <input
          type="number"
          className="form-input"
          min={1}
          max={99}
          value={value}
          onChange={e => onChange(Math.max(1, Number(e.target.value) || 1))}
          disabled={disabled}
        />
      )}
    </>
  );
};

interface Props {
  node: FormulaPhaseNode;
  index: number;
  inputFencers: number;
  onUpdate: (node: FormulaPhaseNode) => void;
  onRemove: () => void;
  readOnly?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Réglage « Avancement vers la phase suivante » grisé (mode rapières : non pris en compte) (#1118) */
  advancementDisabled?: boolean;
}

const NODE_TYPE_LABELS: Record<FormulaPhaseNodeType, string> = {
  pool_round: 'Tour de poules',
  direct_elimination: 'Élimination directe',
  classification: 'Classement final',
};

const NODE_TYPE_COLORS: Record<FormulaPhaseNodeType, string> = {
  pool_round: '#3B82F6',
  direct_elimination: '#EF4444',
  classification: '#10B981',
};

const FormulaPhaseCard_: React.FC<Props> = ({
  node,
  index,
  inputFencers,
  onUpdate,
  onRemove,
  readOnly,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  advancementDisabled,
}) => {
  const [expanded, setExpanded] = useState(index === 0);

  const updatePoolConfig = (partial: Partial<CustomPoolRoundConfig>) => {
    onUpdate({ ...node, config: { ...node.config, ...partial } });
  };

  const updateDEConfig = (partial: Partial<CustomDEConfig>) => {
    onUpdate({ ...node, config: { ...node.config, ...partial } });
  };

  const isPool = node.type === 'pool_round';
  const isDE = node.type === 'direct_elimination';
  const poolCfg = node.config as CustomPoolRoundConfig;
  const deCfg = node.config as CustomDEConfig;

  return (
    <div className="formula-phase-card" style={{ borderLeftColor: NODE_TYPE_COLORS[node.type] }}>
      {/* En-tête */}
      <div className="phase-card-header">
        <div className="phase-card-title-row">
          <span className="phase-type-badge" style={{ background: NODE_TYPE_COLORS[node.type] }}>
            {NODE_TYPE_LABELS[node.type]}
          </span>
          <input
            type="text"
            className="phase-label-input"
            value={node.label ?? NODE_TYPE_LABELS[node.type]}
            onChange={e => onUpdate({ ...node, label: e.target.value })}
            disabled={readOnly}
            placeholder="Nom de la phase"
          />
        </div>
        <div className="phase-card-actions">
          {!readOnly && (
            <>
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                onClick={onMoveUp}
                disabled={!canMoveUp}
                title="Monter"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                onClick={onMoveDown}
                disabled={!canMoveDown}
                title="Descendre"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-icon btn-danger"
                onClick={onRemove}
                title="Supprimer cette phase"
              >
                ✕
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-icon btn-secondary"
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Réduire' : 'Développer'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Corps */}
      {expanded && (
        <div className="phase-card-body">
          {/* Tour de poules */}
          {isPool && (
            <>
              <div className="phase-config-grid">
                <div className="form-group">
                  <label className="form-label">Taille min / max poule</label>
                  <div className="input-row">
                    <input
                      type="number"
                      className="form-input"
                      min={3}
                      max={poolCfg.maxPoolSize}
                      value={poolCfg.minPoolSize}
                      onChange={e => updatePoolConfig({ minPoolSize: Number(e.target.value) })}
                      disabled={readOnly}
                    />
                    <span>à</span>
                    <input
                      type="number"
                      className="form-input"
                      min={poolCfg.minPoolSize}
                      max={20}
                      value={poolCfg.maxPoolSize}
                      onChange={e => updatePoolConfig({ maxPoolSize: Number(e.target.value) })}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Score max</label>
                  <MaxScoreField
                    value={poolCfg.maxScore}
                    options={[3, 5, 8, 10, 15, 20]}
                    onChange={maxScore => updatePoolConfig({ maxScore })}
                    disabled={readOnly}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Chrono (sec)</label>
                  <input
                    type="number"
                    className="form-input"
                    min={60}
                    max={900}
                    step={30}
                    value={poolCfg.timerSeconds}
                    onChange={e => updatePoolConfig({ timerSeconds: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Répartition</label>
                  <select
                    className="form-input"
                    value={poolCfg.seeding}
                    onChange={e =>
                      updatePoolConfig({
                        seeding: e.target.value as 'serpentine' | 'sequential' | 'random',
                      })
                    }
                    disabled={readOnly}
                  >
                    <option value="serpentine">Serpentine</option>
                    <option value="sequential">Séquentielle</option>
                    <option value="random">Aléatoire</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Séparation</label>
                <div className="checkbox-row">
                  {(['byClub', 'byRegion', 'byNation'] as const).map(key => (
                    <label key={key} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={poolCfg.separation[key]}
                        onChange={e =>
                          updatePoolConfig({
                            separation: { ...poolCfg.separation, [key]: e.target.checked },
                          })
                        }
                        disabled={readOnly}
                      />
                      {key === 'byClub' ? 'Club' : key === 'byRegion' ? 'Région' : 'Nation'}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Système de score</label>
                <ScoringZoneEditor
                  scoring={poolCfg.scoring}
                  onChange={s => updatePoolConfig({ scoring: s })}
                  readOnly={readOnly}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Critères de classement</label>
                <RankingCriteriaEditor
                  criteria={poolCfg.rankingCriteria}
                  onChange={criteria => updatePoolConfig({ rankingCriteria: criteria })}
                  readOnly={readOnly}
                />
              </div>

              <div
                className={advancementDisabled ? 'form-group form-group--disabled' : 'form-group'}
                aria-disabled={advancementDisabled || undefined}
              >
                <label className="form-label">Avancement vers la phase suivante</label>
                <AdvancementRuleEditor
                  rule={poolCfg.advancementRule}
                  onChange={r => updatePoolConfig({ advancementRule: r })}
                  inputFencers={inputFencers}
                  readOnly={readOnly || advancementDisabled}
                />
              </div>
            </>
          )}

          {/* Élimination directe */}
          {isDE && (
            <>
              <div className="phase-config-grid">
                <div className="form-group">
                  <label className="form-label">Score max</label>
                  <MaxScoreField
                    value={deCfg.maxScore}
                    options={[5, 10, 15, 20, 25]}
                    onChange={maxScore => updateDEConfig({ maxScore })}
                    disabled={readOnly}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Chrono (sec)</label>
                  <input
                    type="number"
                    className="form-input"
                    min={60}
                    max={900}
                    step={30}
                    value={deCfg.timerSeconds}
                    onChange={e => updateDEConfig({ timerSeconds: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tableau (taille)</label>
                  <select
                    className="form-input"
                    value={deCfg.bracketSizeOverride ?? 0}
                    onChange={e => {
                      const v = Number(e.target.value);
                      updateDEConfig({ bracketSizeOverride: v === 0 ? undefined : v });
                    }}
                    disabled={readOnly}
                  >
                    <option value={0}>Auto</option>
                    {[4, 8, 16, 32, 64, 128].map(v => (
                      <option key={v} value={v}>
                        Tableau de {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <div className="checkbox-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={deCfg.thirdPlaceMatch}
                      onChange={e => updateDEConfig({ thirdPlaceMatch: e.target.checked })}
                      disabled={readOnly}
                    />
                    Petite finale (3e place)
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={deCfg.fifthPlaceMatch ?? false}
                      onChange={e => updateDEConfig({ fifthPlaceMatch: e.target.checked })}
                      disabled={readOnly}
                    />
                    Match pour la 5e place
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Système de score</label>
                <ScoringZoneEditor
                  scoring={deCfg.scoring}
                  onChange={s => updateDEConfig({ scoring: s })}
                  readOnly={readOnly}
                />
              </div>
            </>
          )}

          {/* Classement final — pas de config particulière */}
          {node.type === 'classification' && (
            <p className="classification-hint">
              Phase de classement final — aucune configuration requise.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const FormulaPhaseCard = memo(FormulaPhaseCard_);
