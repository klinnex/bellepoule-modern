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
  /** Grise « Avancement vers la phase suivante » (par défaut : actif en mode rapières) (#1118) */
  advancementDisabled?: boolean;
  /** Règles affichées quand la formule n'en choisit pas (armes modernes en mode rapières, #1118) */
  defaultRuleSet?: 'modern' | 'laser';
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
  advancementDisabled: advancementDisabledProp,
  defaultRuleSet,
}) => {
  const { t } = useTranslation();
  const advancementDisabled = advancementDisabledProp ?? specialMode === 'rapieres';
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

  const ruleSet =
    formula.ruleSet ?? defaultRuleSet ?? (specialMode === 'rapieres' ? 'modern' : 'laser');
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
            placeholder={t('formulaBuilder.name_ph')}
            disabled={readOnly}
          />
        </div>

        {!readOnly && (
          <div className="formula-add-buttons">
            <button
              type="button"
              className="btn btn-secondary btn-sm formula-add-btn pool-add"
              onClick={addPoolRound}
              title={t('formula.add_pool_round')}
            >
              {t('formulaBuilder.pools_btn')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm formula-add-btn de-add"
              onClick={addDE}
              title={t('formulaBuilder.add_de_title')}
            >
              {t('formulaBuilder.de_btn')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm formula-add-btn class-add"
              onClick={addClassification}
              title={t('formulaBuilder.add_cls_title')}
            >
              {t('formulaBuilder.cls_btn')}
            </button>
          </div>
        )}

        <div className="formula-template-buttons">
          {!readOnly && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setTemplateModal('save')}
              title={t('formula.save_template')}
            >
              {t('formulaBuilder.save_btn')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setTemplateModal('load')}
            title={t('formula.load_template')}
          >
            {t('formulaBuilder.load_btn')}
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
                <p>{t('formulaBuilder.empty')}</p>
                <p>{t('formulaBuilder.empty_hint')}</p>
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
                    advancementDisabled={advancementDisabled}
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
                {t('formula.rule_set')}
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
                <option value="laser">{t('formula.rule_set_laser')}</option>
                <option value="modern">{t('formula.rule_set_modern')}</option>
              </select>
              {ruleSet === 'modern' && (
                <>
                  <label className="form-label" htmlFor="formula-rest-time">
                    {t('formula.rest_time')}
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
                      ? t('formulaBuilder.rest_off')
                      : t('formulaBuilder.rest_on')}
                  </small>
                </>
              )}
            </div>

            <div className="formula-notes-group">
              <label className="form-label">{t('formulaBuilder.notes')}</label>
              <textarea
                className="form-input formula-notes-input"
                value={formula.notes ?? ''}
                onChange={e => updateNotes(e.target.value)}
                placeholder={t('formulaBuilder.notes_ph')}
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
