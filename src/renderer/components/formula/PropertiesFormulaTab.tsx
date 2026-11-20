/**
 * BellePoule Modern - Onglet « Formule » des propriétés, organisé par phase (#2013, étape A)
 * Frise Appel → Poules (tours) → Tour Quest → Tableau → Classement final ;
 * réglages de la phase sélectionnée ; relevé de cohérence avec la catégorie.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { Category, PostPoolSplitCriteria, Weapon } from '../../../shared/types';
import { isOlympicWeapon } from '../../../shared/utils/defaultMaxScores';
import { hasCoherenceReference } from '../../../shared/utils/formulaCoherence';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';
import { HINT, HINT_INDENT, MR, GRID2, SM } from '../competitionPropertiesModal.styles';
import {
  FormulaDraft,
  FormulaPhaseId,
  POOL_ROUNDS_WARNING,
  addPoolRound,
  applyCoherence,
  canAddPoolRound,
  canRemovePoolRound,
  draftCoherenceIssues,
  effectivePoolRounds,
  removePoolRound,
  setQuest,
} from '../../../shared/domain/formula/formulaDraft';

interface Props {
  draft: FormulaDraft;
  onChange: (patch: Partial<FormulaDraft>) => void;
  weapon: Weapon;
  category: Category;
}

const int = (v: string, fallback: number) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const PropertiesFormulaTab: React.FC<Props> = ({ draft, onChange, weapon, category }) => {
  const { t } = useTranslation();
  const rounds = effectivePoolRounds(draft, weapon);
  const isLaser = weapon === Weapon.LASER;
  const [selected, setSelected] = useState<FormulaPhaseId>(
    rounds > 0 ? { kind: 'pool', round: 0 } : { kind: 'tableau' }
  );
  // Sélection encore valide après ajout / retrait de phases
  const current: FormulaPhaseId | null =
    selected.kind === 'pool' && selected.round < rounds
      ? selected
      : selected.kind === 'quest' && isLaser && draft.questEnabled
        ? selected
        : selected.kind === 'tableau' && draft.hasDirectElimination
          ? selected
          : rounds > 0
            ? { kind: 'pool', round: 0 }
            : draft.hasDirectElimination
              ? { kind: 'tableau' }
              : null;

  const issues = draftCoherenceIssues(draft, weapon, category);
  const categoryLabel = t(`categories.${category === Category.SENIOR ? 'senior' : category}`);
  const isSelected = (p: FormulaPhaseId) =>
    current?.kind === p.kind &&
    (p.kind !== 'pool' || (current.kind === 'pool' && current.round === p.round));

  const poolSummary = t('properties.summary_pool', {
    min: draft.poolSizeMin,
    max: draft.poolSizeMax,
    score: draft.poolMaxScore,
  });
  const tableSummary =
    (draft.tableMaxScore === 0
      ? t('properties.summary_tableau_unlimited')
      : t('properties.summary_tableau', { score: draft.tableMaxScore })) +
    (draft.thirdPlaceMatch || draft.playAllPositions
      ? ` · ${t('properties.summary_third_place')}`
      : '');

  const step = (p: FormulaPhaseId, title: string, summary: string, testId: string) => (
    <button
      type="button"
      key={testId}
      data-testid={testId}
      className={`formula-frieze__step${isSelected(p) ? ' is-selected' : ''}`}
      aria-pressed={isSelected(p)}
      onClick={() => setSelected(p)}
    >
      <span className="formula-frieze__title">{title}</span>
      <span className="formula-frieze__summary">{summary}</span>
    </button>
  );
  const arrow = (key: string) => (
    <span key={key} className="formula-frieze__arrow" aria-hidden="true">
      →
    </span>
  );

  const frieze: React.ReactNode[] = [
    <span key="checkin" className="formula-frieze__step formula-frieze__step--fixed">
      {t('properties.phase_checkin')}
    </span>,
  ];
  for (let r = 0; r < rounds; r++) {
    frieze.push(arrow(`a-pool-${r}`));
    frieze.push(
      step(
        { kind: 'pool', round: r },
        rounds > 1 ? t('properties.phase_pool_round', { n: r + 1 }) : t('properties.phase_pools'),
        poolSummary,
        `formula-step-pool-${r + 1}`
      )
    );
  }
  if (isLaser && draft.questEnabled) {
    frieze.push(arrow('a-quest'));
    frieze.push(
      step(
        { kind: 'quest' },
        t('properties.quest_round'),
        draft.questHasPools ? t('properties.summary_quest', { count: draft.questQualifiers }) : '',
        'formula-step-quest'
      )
    );
  }
  if (draft.hasDirectElimination) {
    frieze.push(arrow('a-tableau'));
    frieze.push(
      step({ kind: 'tableau' }, t('properties.phase_tableau'), tableSummary, 'formula-step-tableau')
    );
  }
  frieze.push(arrow('a-final'));
  frieze.push(
    <span key="final" className="formula-frieze__step formula-frieze__step--fixed">
      {t('properties.phase_final_ranking')}
    </span>
  );

  const canRemoveTableau = draft.hasDirectElimination && rounds > 0;

  function renderPoolRound(round: number) {
    const isLast = round === rounds - 1;
    const shared = rounds > 1;
    return (
      <>
        <fieldset className="properties-group">
          <legend>{t('properties.group_essential')}</legend>
          {shared && <p style={HINT}>{t('properties.shared_rounds_hint')}</p>}
          <div style={GRID2}>
            <div className="form-group">
              <label htmlFor="poolSizeMin">{t('properties.pool_size_min')}</label>
              <input
                id="poolSizeMin"
                type="number"
                className="form-input"
                min={3}
                max={draft.poolSizeMax}
                value={draft.poolSizeMin}
                onChange={e => {
                  const v = Math.max(3, int(e.target.value, 3));
                  onChange({ poolSizeMin: v, poolSizeMax: Math.max(v, draft.poolSizeMax) });
                }}
              />
            </div>
            <div className="form-group">
              <label htmlFor="poolSizeMax">{t('properties.pool_size_max')}</label>
              <input
                id="poolSizeMax"
                type="number"
                className="form-input"
                min={draft.poolSizeMin}
                max={64}
                value={draft.poolSizeMax}
                onChange={e =>
                  onChange({
                    poolSizeMax: Math.min(64, Math.max(draft.poolSizeMin, int(e.target.value, 7))),
                  })
                }
              />
            </div>
          </div>
          <small style={HINT}>{t('properties.pool_size_hint')}</small>
          <div style={GRID2} className="mt-4">
            <div className="form-group">
              <label htmlFor="poolMaxScore">{t('properties.pool_max_score')}</label>
              <input
                type="number"
                id="poolMaxScore"
                className="form-input"
                value={draft.poolMaxScore}
                onChange={e => onChange({ poolMaxScore: Math.max(1, int(e.target.value, 1)) })}
                min="1"
              />
              <small style={HINT}>{t('properties.pool_max_score_hint')}</small>
            </div>
            <div className="form-group">
              <label htmlFor="poolTimerSeconds">{t('properties.pool_timer')}</label>
              <input
                type="number"
                id="poolTimerSeconds"
                className="form-input"
                value={draft.poolTimerSeconds}
                onChange={e =>
                  onChange({ poolTimerSeconds: Math.max(1, int(e.target.value, 180)) })
                }
                min="1"
              />
            </div>
          </div>
          {!isLast && !(isLaser && draft.questEnabled) && (
            <div className="form-group">
              <label htmlFor={`poolRoundQualifiers-${round}`}>
                {t('properties.qualified_round')} {round + 2}
              </label>
              <input
                id={`poolRoundQualifiers-${round}`}
                type="number"
                min={0}
                className="form-input"
                value={draft.poolRoundQualifiers[round] ?? 0}
                onChange={e => {
                  const n = Math.max(0, int(e.target.value, 0));
                  const next = [...draft.poolRoundQualifiers];
                  next[round] = n;
                  onChange({ poolRoundQualifiers: next });
                }}
              />
              <small style={HINT}>{t('properties.qualified_round_hint')}</small>
            </div>
          )}
          {isLast && draft.hasDirectElimination && !(isLaser && draft.questEnabled) && (
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={draft.poolWinnersOnly}
                  onChange={e => onChange({ poolWinnersOnly: e.target.checked })}
                  style={MR}
                />
                {t('properties.pool_winners_only')}
              </label>
              <small style={HINT_INDENT}>{t('properties.pool_winners_only_hint')}</small>
            </div>
          )}
        </fieldset>
        {!(isLaser && draft.questEnabled) && (
          <details
            className="properties-group"
            open={draft.poolBoutOrder !== 'fie' || (isLast && !!draft.postPoolSplitCriteria)}
          >
            <summary>{t('properties.expert_settings')}</summary>
            <div className="form-group mt-4">
              <label htmlFor="poolBoutOrder">{t('properties.bout_order')}</label>
              <select
                id="poolBoutOrder"
                className="form-input form-select"
                value={draft.poolBoutOrder}
                onChange={e => onChange({ poolBoutOrder: e.target.value as 'fie' | 'free' })}
              >
                <option value="fie">{t('properties.bout_order_fie')}</option>
                <option value="free">{t('properties.bout_order_free')}</option>
              </select>
              <small style={HINT}>{t('properties.bout_order_hint')}</small>
            </div>
            {isLast && (
              <div className="form-group">
                <label htmlFor="postPoolSplitCriteria">{t('properties.coupled')}</label>
                <select
                  id="postPoolSplitCriteria"
                  className="form-input form-select"
                  value={draft.postPoolSplitCriteria}
                  onChange={e =>
                    onChange({
                      postPoolSplitCriteria: e.target.value as PostPoolSplitCriteria | '',
                    })
                  }
                >
                  <option value="">{t('properties.coupled_none')}</option>
                  <option value="gender">{t('properties.coupled_gender')}</option>
                </select>
                <small style={HINT}>{t('properties.coupled_hint')}</small>
              </div>
            )}
          </details>
        )}
      </>
    );
  }

  function renderQuest() {
    return (
      <fieldset className="properties-group">
        <legend>{t('properties.quest_round')}</legend>
        {draft.questHasPools && (
          <div className="form-group">
            <label htmlFor="questQualifiers" style={SM}>
              {t('properties.quest_qualified')}
            </label>
            <input
              type="number"
              id="questQualifiers"
              className="form-input is-9829e6"
              value={draft.questQualifiers}
              min={2}
              onChange={e => onChange({ questQualifiers: Math.max(2, int(e.target.value, 2)) })}
            />
          </div>
        )}
        <small style={HINT}>
          {draft.questHasPools
            ? t('properties.quest_with_pools')
            : t('properties.quest_without_pools')}
        </small>
      </fieldset>
    );
  }

  function renderTableau() {
    return (
      <>
        <fieldset className="properties-group">
          <legend>{t('properties.group_essential')}</legend>
          <div style={GRID2}>
            <div className="form-group">
              <label htmlFor="tableMaxScore">{t('properties.table_max_score')}</label>
              <input
                type="number"
                id="tableMaxScore"
                className="form-input"
                value={draft.tableMaxScore}
                onChange={e => onChange({ tableMaxScore: Math.max(0, int(e.target.value, 0)) })}
                min="0"
              />
              <small style={HINT}>{t('properties.table_max_score_hint')}</small>
            </div>
            <div className="form-group">
              <label htmlFor="tableTimerSeconds">{t('properties.table_timer')}</label>
              <input
                type="number"
                id="tableTimerSeconds"
                className="form-input"
                value={draft.tableTimerSeconds}
                onChange={e =>
                  onChange({ tableTimerSeconds: Math.max(1, int(e.target.value, 180)) })
                }
                min="1"
              />
            </div>
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={draft.thirdPlaceMatch || draft.playAllPositions}
                disabled={draft.playAllPositions}
                onChange={e => onChange({ thirdPlaceMatch: e.target.checked })}
                style={MR}
              />
              {t('competition.third_place_match_label')}
            </label>
            <small style={HINT_INDENT}>{t('competition.third_place_match_description')}</small>
          </div>
        </fieldset>
        <details className="properties-group" open={draft.playAllPositions}>
          <summary>{t('properties.expert_settings')}</summary>
          <div className="form-group mt-4">
            <label>
              <input
                type="checkbox"
                checked={draft.playAllPositions}
                onChange={e => onChange({ playAllPositions: e.target.checked })}
                style={MR}
              />
              {t('properties.all_places')}
            </label>
            <small style={HINT_INDENT}>{t('properties.all_places_hint')}</small>
          </div>
        </details>
      </>
    );
  }

  return (
    <div>
      <nav className="formula-frieze" aria-label={t('properties.frieze_label')}>
        {frieze}
      </nav>

      <div className="formula-frieze__actions">
        {canAddPoolRound(draft, weapon) && (
          <Button type="button" style={SM} onClick={() => onChange(addPoolRound(draft, weapon))}>
            {t('properties.add_pool_round')}
          </Button>
        )}
        {current?.kind === 'pool' && canRemovePoolRound(draft, weapon) && (
          <Button
            type="button"
            style={SM}
            onClick={() => onChange(removePoolRound(draft, weapon, current.round))}
          >
            {t('properties.remove_pool_round')}
          </Button>
        )}
        {isLaser && (
          <Button
            type="button"
            style={SM}
            onClick={() => onChange(setQuest(draft, !draft.questEnabled))}
          >
            {draft.questEnabled ? t('properties.remove_quest') : t('properties.add_quest')}
          </Button>
        )}
        {!draft.hasDirectElimination && (
          <Button type="button" style={SM} onClick={() => onChange({ hasDirectElimination: true })}>
            {t('properties.add_tableau')}
          </Button>
        )}
        {canRemoveTableau && (
          <Button
            type="button"
            style={SM}
            onClick={() => onChange({ hasDirectElimination: false })}
          >
            {t('properties.remove_tableau')}
          </Button>
        )}
      </div>
      {rounds > POOL_ROUNDS_WARNING && (
        <p style={HINT} role="note">
          {t('properties.rounds_warning', { count: rounds })}
        </p>
      )}

      {current?.kind === 'pool' && renderPoolRound(current.round)}
      {current?.kind === 'quest' && renderQuest()}
      {current?.kind === 'tableau' && renderTableau()}

      {isOlympicWeapon(weapon) && (
        <fieldset className="properties-group">
          <legend>{t('properties.formula_general')}</legend>
          <div className="form-group">
            <label htmlFor="restTimeSeconds">{t('properties.rest_time')}</label>
            <input
              type="number"
              id="restTimeSeconds"
              className="form-input"
              value={draft.restTimeSeconds}
              onChange={e => onChange({ restTimeSeconds: Math.max(0, int(e.target.value, 0)) })}
              min="0"
            />
            <small style={HINT}>{t('properties.rest_time_hint')}</small>
          </div>
        </fieldset>
      )}

      {hasCoherenceReference(weapon) && (
        <section
          className={`formula-coherence${issues.length ? ' has-issues' : ''}`}
          data-testid="formula-coherence"
          aria-live="polite"
        >
          <strong>{t('properties.coherence_title')}</strong>
          {issues.length === 0 ? (
            <p>{t('properties.coherence_ok', { category: categoryLabel })}</p>
          ) : (
            <ul>
              {issues.map(issue => (
                <li key={issue.field}>
                  <span>
                    {t(`properties.coherence_${issue.phase}`, {
                      actual: issue.actual,
                      expected: issue.expected,
                      category: categoryLabel,
                    })}
                  </span>
                  <Button
                    type="button"
                    style={SM}
                    onClick={() => onChange(applyCoherence([issue]))}
                  >
                    {t('properties.coherence_apply')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <small style={HINT}>{t('properties.coherence_source')}</small>
        </section>
      )}
    </div>
  );
};
