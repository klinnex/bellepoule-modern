/**
 * BellePoule Modern - Constructeur de formule visuel
 * Composant principal du créateur de formule à la carte.
 */

import React, { useMemo, useState, memo } from 'react';
import {
  CompetitionSpecialMode,
  CustomDEConfig,
  CustomFormulaConfig,
  CustomPoolRoundConfig,
  FormulaPhaseNode,
} from '../../../shared/types';
import { simulateFormula } from '../../../shared/utils/customRankingCalculator';
import { createDefaultCustomFormula } from '../../../shared/utils/tournamentTemplates';
import { FormulaPhaseCard } from './FormulaPhaseCard';
import { FormulaSimulationPreview } from './FormulaSimulationPreview';
import { FormulaTemplateModal } from './FormulaTemplateModal';
import { useTranslation } from '../../hooks/useTranslation';

interface Props {
  formula: CustomFormulaConfig;
  fencerCount?: number;
  onChange: (formula: CustomFormulaConfig) => void;
  readOnly?: boolean;
  /** Mode spécial choisi (bouton « Modes spéciaux » affiché si `onSpecialModeChange`) (#1118) */
  specialMode?: CompetitionSpecialMode;
  onSpecialModeChange?: (mode: CompetitionSpecialMode | undefined) => void;
}

const SPECIAL_MODES: CompetitionSpecialMode[] = ['rapieres'];

function uid(): string {
  return `phase_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makePoolRound(roundIndex: number): FormulaPhaseNode {
  const defaultFormula = createDefaultCustomFormula();
  const defaultPoolPhase = defaultFormula.phases[0] as FormulaPhaseNode;
  const defaultCfg = defaultPoolPhase.config as CustomPoolRoundConfig;
  return {
    id: uid(),
    type: 'pool_round',
    label: `Tour de poules ${roundIndex + 1}`,
    config: { ...defaultCfg, roundIndex },
  };
}

function makeDE(): FormulaPhaseNode {
  const cfg: CustomDEConfig = {
    maxScore: 15,
    timerSeconds: 180,
    thirdPlaceMatch: true,
    placesToFence: [1, 3],
    scoring: { type: 'standard', maxScore: 15 },
  };
  return { id: uid(), type: 'direct_elimination', label: 'Élimination directe', config: cfg };
}

function makeClassification(): FormulaPhaseNode {
  const cfg: CustomDEConfig = {
    maxScore: 15,
    timerSeconds: 180,
    thirdPlaceMatch: false,
    placesToFence: [],
    scoring: { type: 'standard', maxScore: 15 },
  };
  return { id: uid(), type: 'classification', label: 'Classement final', config: cfg };
}

function computeInputFencers(phases: FormulaPhaseNode[], index: number, initial: number): number {
  let count = initial;
  for (let i = 0; i < index; i++) {
    const node = phases[i];
    if (node.type === 'pool_round') {
      const cfg = node.config as CustomPoolRoundConfig;
      const rule = cfg.advancementRule;
      switch (rule.mode) {
        case 'all':
          break;
        case 'percentage':
          count = Math.round(count * ((rule.percentage ?? 80) / 100));
          break;
        case 'fixed_count':
          count = Math.min(rule.count ?? count, count);
          break;
        case 'fixed_bracket': {
          const sizes = [2, 4, 8, 16, 32, 64, 128, 256];
          const target = rule.count ?? count;
          count = sizes.filter(s => s <= target).pop() ?? 2;
          break;
        }
      }
    }
  }
  return count;
}

const FormulaBuilder_: React.FC<Props> = ({
  formula,
  fencerCount = 32,
  onChange,
  readOnly,
  specialMode,
  onSpecialModeChange,
}) => {
  const { t } = useTranslation();
  const [templateModal, setTemplateModal] = useState<'save' | 'load' | null>(null);
  const [specialMenuOpen, setSpecialMenuOpen] = useState(false);

  const simulation = useMemo(() => simulateFormula(fencerCount, formula), [fencerCount, formula]);

  const updatePhase = (index: number, node: FormulaPhaseNode) => {
    const phases = [...formula.phases];
    phases[index] = node;
    onChange({ ...formula, phases });
  };

  const removePhase = (index: number) => {
    const phases = formula.phases.filter((_, i) => i !== index);
    onChange({ ...formula, phases });
  };

  const movePhase = (from: number, to: number) => {
    if (to < 0 || to >= formula.phases.length) return;
    const phases = [...formula.phases];
    const [moved] = phases.splice(from, 1);
    phases.splice(to, 0, moved);
    onChange({ ...formula, phases });
  };

  const addPoolRound = () => {
    const poolCount = formula.phases.filter(p => p.type === 'pool_round').length;
    // Insérer avant le premier DE ou à la fin
    const deIndex = formula.phases.findIndex(p => p.type === 'direct_elimination');
    const insertAt = deIndex >= 0 ? deIndex : formula.phases.length;
    const phases = [...formula.phases];
    phases.splice(insertAt, 0, makePoolRound(poolCount));
    onChange({ ...formula, phases });
  };

  const addDE = () => {
    // Insérer avant la classification ou à la fin
    const classIndex = formula.phases.findIndex(p => p.type === 'classification');
    const insertAt = classIndex >= 0 ? classIndex : formula.phases.length;
    const phases = [...formula.phases];
    phases.splice(insertAt, 0, makeDE());
    onChange({ ...formula, phases });
  };

  const addClassification = () => {
    onChange({ ...formula, phases: [...formula.phases, makeClassification()] });
  };

  const updateFormulaName = (name: string) => onChange({ ...formula, formulaName: name });

  const updateNotes = (notes: string) => onChange({ ...formula, notes });

  const ruleSet = formula.ruleSet ?? 'laser';
  const restTimeSeconds = formula.restTimeSeconds ?? 60;

  return (
    <div className="formula-builder">
      {/* Barre d'outils */}
      <div className="formula-builder-toolbar">
        <div className="formula-name-group">
          <input
            type="text"
            className="form-input formula-name-input"
            value={formula.formulaName ?? ''}
            onChange={e => updateFormulaName(e.target.value)}
            placeholder="Nom de la formule"
            disabled={readOnly}
          />
        </div>

        {!readOnly && (
          <div className="formula-add-buttons">
            <button
              type="button"
              className="btn btn-secondary btn-sm formula-add-btn pool-add"
              onClick={addPoolRound}
              title="Ajouter un tour de poules"
            >
              + Poules
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm formula-add-btn de-add"
              onClick={addDE}
              title="Ajouter une phase d'élimination directe"
            >
              + DE
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm formula-add-btn class-add"
              onClick={addClassification}
              title="Ajouter une phase de classement"
            >
              + Classement
            </button>
          </div>
        )}

        <div className="formula-template-buttons">
          {!readOnly && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setTemplateModal('save')}
              title="Enregistrer comme modèle"
            >
              Enregistrer modèle
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setTemplateModal('load')}
            title="Charger un modèle"
          >
            Charger modèle
          </button>
          {onSpecialModeChange && !readOnly && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className={`btn btn-sm ${specialMode ? 'btn-primary' : 'btn-secondary'}`}
                aria-haspopup="menu"
                aria-expanded={specialMenuOpen}
                onClick={() => setSpecialMenuOpen(o => !o)}
              >
                {specialMode
                  ? `${t('rapieres.special_modes')} : ${t(`rapieres.mode_${specialMode}`)}`
                  : t('rapieres.special_modes')}
                {' ▾'}
              </button>
              {specialMenuOpen && (
                <div
                  role="menu"
                  className="card"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    zIndex: 20,
                    minWidth: '16rem',
                    padding: '0.25rem',
                    display: 'grid',
                  }}
                >
                  {[undefined, ...SPECIAL_MODES].map(mode => (
                    <button
                      key={mode ?? 'none'}
                      type="button"
                      role="menuitemradio"
                      aria-checked={specialMode === mode}
                      className="btn btn-sm btn-ghost"
                      style={{
                        justifyContent: 'flex-start',
                        fontWeight: specialMode === mode ? 700 : 400,
                      }}
                      onClick={() => {
                        onSpecialModeChange(mode);
                        setSpecialMenuOpen(false);
                      }}
                    >
                      {mode ? t(`rapieres.mode_${mode}`) : t('rapieres.mode_none')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {specialMode ? (
        <div className="card" style={{ padding: '1rem', marginTop: '0.75rem' }}>
          <strong>{t(`rapieres.mode_${specialMode}`)}</strong>
          <p style={{ marginTop: '0.5rem' }}>{t(`rapieres.mode_description`)}</p>
        </div>
      ) : (
        /* Contenu principal : pipeline + simulation */
        <div className="formula-builder-content">
          {/* Pipeline de phases */}
          <div className="formula-pipeline">
            {formula.phases.length === 0 ? (
              <div className="formula-empty-state">
                <p>Aucune phase configurée.</p>
                <p>Utilisez les boutons ci-dessus pour ajouter des phases.</p>
              </div>
            ) : (
              formula.phases.map((node, index) => (
                <React.Fragment key={node.id}>
                  <FormulaPhaseCard
                    node={node}
                    index={index}
                    inputFencers={computeInputFencers(formula.phases, index, fencerCount)}
                    onUpdate={updated => updatePhase(index, updated)}
                    onRemove={() => removePhase(index)}
                    readOnly={readOnly}
                    canMoveUp={index > 0}
                    canMoveDown={index < formula.phases.length - 1}
                    onMoveUp={() => movePhase(index, index - 1)}
                    onMoveDown={() => movePhase(index, index + 1)}
                  />
                  {index < formula.phases.length - 1 && <div className="phase-connector">↓</div>}
                </React.Fragment>
              ))
            )}
          </div>

          {/* Simulation temps réel */}
          <div className="formula-simulation-panel">
            <FormulaSimulationPreview simulation={simulation} fencerCount={fencerCount} />

            {/* Règles de match appliquées par les tablettes arbitre (#1125) */}
            <div className="formula-notes-group">
              <label className="form-label" htmlFor="formula-rule-set">
                Règles de la compétition
              </label>
              <select
                id="formula-rule-set"
                className="form-input"
                value={ruleSet}
                onChange={e =>
                  onChange({ ...formula, ruleSet: e.target.value as 'modern' | 'laser' })
                }
                disabled={readOnly}
              >
                <option value="laser">
                  Sabre Laser (temps additionnel 30 s, mort subite, cartons Sabre Laser)
                </option>
                <option value="modern">
                  Armes modernes (épée, fleuret, sabre : 1 min supplémentaire, repos, cartons FIE)
                </option>
              </select>
              {ruleSet === 'modern' && (
                <>
                  <label className="form-label" htmlFor="formula-rest-time">
                    Temps de repos (secondes)
                  </label>
                  <input
                    id="formula-rest-time"
                    type="number"
                    className="form-input"
                    min={0}
                    value={restTimeSeconds}
                    onChange={e =>
                      onChange({
                        ...formula,
                        restTimeSeconds: Math.max(0, parseInt(e.target.value) || 0),
                      })
                    }
                    disabled={readOnly}
                  />
                  <small>
                    {restTimeSeconds === 0
                      ? '0 = bouton « Repos » désactivé'
                      : 'Bouton « Repos » de la tablette arbitre, quand le chrono arrive à 00:00'}
                  </small>
                </>
              )}
            </div>

            <div className="formula-notes-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input formula-notes-input"
                value={formula.notes ?? ''}
                onChange={e => updateNotes(e.target.value)}
                placeholder="Notes sur la formule (optionnel)"
                rows={3}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {templateModal && (
        <FormulaTemplateModal
          mode={templateModal}
          currentFormula={formula}
          onLoad={f => onChange(f)}
          onClose={() => setTemplateModal(null)}
        />
      )}
    </div>
  );
};

export const FormulaBuilder = memo(FormulaBuilder_);
