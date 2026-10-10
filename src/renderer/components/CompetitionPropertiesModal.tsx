/**
 * BellePoule Modern - Competition Properties Modal
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  HINT,
  HINT_INDENT,
  CHECK_LABEL,
  CHECK_LABEL_SM,
  FIELD_LABEL,
  MR,
  MB1,
  MB15,
  SM,
  GRID2,
  FLEX1,
} from './competitionPropertiesModal.styles';
import {
  Competition,
  CustomFormulaConfig,
  Weapon,
  Gender,
  Category,
  CompetitionSettings,
  QuestPhaseConfig,
  PostPoolSplitCriteria,
} from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import { createDefaultCustomFormula } from '../../shared/utils/tournamentTemplates';
import { FormulaBuilder } from './formula/FormulaBuilder';

interface CompetitionPropertiesModalProps {
  competition: Competition;
  onSave: (updates: Partial<Competition>) => void;
  onClose: () => void;
}

const CompetitionPropertiesModal: React.FC<CompetitionPropertiesModalProps> = ({
  competition,
  onSave,
  onClose,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [title, setTitle] = useState(competition.title);
  const [date, setDate] = useState(new Date(competition.date).toISOString().split('T')[0]);
  const [location, setLocation] = useState(competition.location || '');
  const [organizer, setOrganizer] = useState(competition.organizer || '');
  const [weapon, setWeapon] = useState<Weapon>(competition.weapon);
  const [gender, setGender] = useState<Gender>(competition.gender);
  const [category, setCategory] = useState<Category>(competition.category);

  // Paramètres de compétition
  const [poolRounds, setPoolRounds] = useState(competition.settings?.poolRounds ?? 1);
  const [hasDirectElimination, setHasDirectElimination] = useState(
    competition.settings?.hasDirectElimination ?? true
  );
  const [poolMaxScore, setPoolMaxScore] = useState(competition.settings?.defaultPoolMaxScore ?? 21);
  const [tableMaxScore, setTableMaxScore] = useState(
    competition.settings?.defaultTableMaxScore ?? 21
  );
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(
    competition.settings?.thirdPlaceMatch ?? false
  );
  const [signTableauMatches, setSignTableauMatches] = useState(
    competition.settings?.signTableauMatches ?? false
  );
  const [playAllPositions, setPlayAllPositions] = useState(
    competition.settings?.playAllPositions ?? false
  );

  const [poolTimerSeconds, setPoolTimerSeconds] = useState(
    competition.settings?.defaultPoolTimerSeconds ?? 180
  );
  const [tableTimerSeconds, setTableTimerSeconds] = useState(
    competition.settings?.defaultTableTimerSeconds ?? 180
  );

  const [refereeFeatureEnabled, setRefereeFeatureEnabled] = useState(
    competition.settings?.refereeFeatureEnabled ?? false
  );
  const [blackCardEnabled, setBlackCardEnabled] = useState(
    competition.settings?.blackCardEnabled ?? false
  );
  const [trainerCommentsEnabled, setTrainerCommentsEnabled] = useState(
    competition.settings?.trainerCommentsEnabled ?? false
  );
  const [expertMode, setExpertMode] = useState(competition.settings?.expertMode ?? false);
  const [poolWinnersOnly, setPoolWinnersOnly] = useState(
    competition.settings?.poolWinnersOnly ?? false
  );
  const [postPoolSplitCriteria, setPostPoolSplitCriteria] = useState<PostPoolSplitCriteria | ''>(
    competition.settings?.postPoolSplitCriteria ?? ''
  );
  const [maxRefereesPerPool, setMaxRefereesPerPool] = useState(
    competition.settings?.maxRefereesPerPool ?? 1
  );
  const [maxRefereesPerMatch, setMaxRefereesPerMatch] = useState(
    competition.settings?.maxRefereesPerMatch ?? 1
  );

  // Formule personnalisée (arme CUSTOM)
  const [customFormula, setCustomFormula] = useState<CustomFormulaConfig>(
    competition.settings?.customFormula ?? createDefaultCustomFormula()
  );

  // Tour Quest (Sabre Laser)
  const existingQuest = competition.settings?.questConfig;
  const [questEnabled, setQuestEnabled] = useState(existingQuest?.enabled ?? false);
  const [questHasPools, setQuestHasPools] = useState(existingQuest?.hasPreliminaryPools ?? false);
  const [questQualifiers, setQuestQualifiers] = useState(existingQuest?.qualifiersCount ?? 8);

  const handleQuestEnabledChange = (enabled: boolean) => {
    setQuestEnabled(enabled);
    if (enabled && !questHasPools) {
      setPoolRounds(0);
    } else if (!enabled) {
      if (poolRounds === 0) setPoolRounds(1);
    }
  };

  const handleQuestHasPoolsChange = (hasPools: boolean) => {
    setQuestHasPools(hasPools);
    if (questEnabled) {
      setPoolRounds(hasPools ? 1 : 0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const questConfig: QuestPhaseConfig | undefined =
      weapon === Weapon.LASER && questEnabled
        ? {
            enabled: true,
            hasPreliminaryPools: questHasPools,
            qualifiersCount: questHasPools ? questQualifiers : undefined,
            opponentConstraint: existingQuest?.opponentConstraint ?? 'none',
            availableTimeMinutes: existingQuest?.availableTimeMinutes,
            numberOfArenas: existingQuest?.numberOfArenas,
            fightsPerFencer: existingQuest?.fightsPerFencer,
          }
        : weapon === Weapon.LASER
          ? { enabled: false, hasPreliminaryPools: false, opponentConstraint: 'none' }
          : undefined;

    const settings: CompetitionSettings = {
      ...(competition.settings || {}),
      poolRounds,
      hasDirectElimination,
      thirdPlaceMatch,
      signTableauMatches,
      playAllPositions,
      defaultPoolMaxScore: poolMaxScore,
      defaultTableMaxScore: tableMaxScore,
      defaultPoolTimerSeconds: poolTimerSeconds,
      defaultTableTimerSeconds: tableTimerSeconds,
      manualRanking: competition.settings?.manualRanking ?? false,
      defaultRanking: competition.settings?.defaultRanking ?? 9999,
      randomScore: competition.settings?.randomScore ?? false,
      minTeamSize: competition.settings?.minTeamSize ?? 3,
      questConfig,
      refereeFeatureEnabled,
      blackCardEnabled,
      trainerCommentsEnabled,
      expertMode,
      ...(expertMode ? { maxRefereesPerPool, maxRefereesPerMatch } : {}),
      ...(weapon === Weapon.CUSTOM ? { customFormula } : {}),
      poolWinnersOnly,
      ...(postPoolSplitCriteria ? { postPoolSplitCriteria } : { postPoolSplitCriteria: undefined }),
    };

    onSave({
      title,
      date: new Date(date),
      location,
      organizer,
      weapon,
      gender,
      category,
      settings,
    });
    onClose();
  };

  const isCustomWeapon = weapon === Weapon.CUSTOM;

  function renderStandardFormula() {
    if (isCustomWeapon) return null;
    return (
      <React.Fragment>
        <div style={GRID2}>
          {(!questEnabled || questHasPools) && (
            <div className="form-group">
              <label htmlFor="poolRounds">Tours de poules</label>
              <select
                id="poolRounds"
                className="form-input form-select"
                value={questEnabled && questHasPools ? 1 : poolRounds}
                onChange={e => setPoolRounds(parseInt(e.target.value))}
                disabled={questEnabled && questHasPools}
              >
                <option value="1">1 tour</option>
                <option value="2">2 tours</option>
                <option value="3">3 tours</option>
              </select>
              <small style={HINT}>
                {questEnabled && questHasPools
                  ? '1 tour imposé avant le Tour Quest'
                  : 'Nombre de phases de poules avant le tableau'}
              </small>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="hasDirectElimination">Élimination directe</label>
            <select
              id="hasDirectElimination"
              className="form-input form-select"
              value={hasDirectElimination ? 'true' : 'false'}
              onChange={e => setHasDirectElimination(e.target.value === 'true')}
            >
              <option value="true">Activée</option>
              <option value="false">Désactivée</option>
            </select>
            <small style={HINT}>
              {hasDirectElimination
                ? 'Tableau après les poules'
                : 'Classement final sur les poules'}
            </small>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginTop: '1rem',
          }}
        >
          <div className="form-group">
            <label htmlFor="poolMaxScore">Score max poules</label>
            <input
              type="number"
              id="poolMaxScore"
              className="form-input"
              value={poolMaxScore}
              onChange={e => setPoolMaxScore(Math.max(1, parseInt(e.target.value) || 1))}
              min="1"
              placeholder="21"
            />
            <small style={HINT}>Touches pour gagner un match de poule</small>
          </div>
          <div className="form-group">
            <label htmlFor="poolTimerSeconds">Chrono poules (secondes)</label>
            <input
              type="number"
              id="poolTimerSeconds"
              className="form-input"
              value={poolTimerSeconds}
              onChange={e => setPoolTimerSeconds(Math.max(1, parseInt(e.target.value) || 180))}
              min="1"
              placeholder="180"
            />
            <small style={HINT}>
              {`${Math.floor(poolTimerSeconds / 60)}min ${poolTimerSeconds % 60}s par match de poule`}
            </small>
          </div>
          {hasDirectElimination && (
            <>
              <div className="form-group">
                <label htmlFor="tableMaxScore">Score max tableau élimination</label>
                <input
                  type="number"
                  id="tableMaxScore"
                  className="form-input"
                  value={tableMaxScore}
                  onChange={e => setTableMaxScore(parseInt(e.target.value) || 0)}
                  min="0"
                  placeholder="21"
                />
                <small style={HINT}>
                  {tableMaxScore === 0
                    ? '0 = illimité (pas de limite)'
                    : `${tableMaxScore} touches pour gagner`}
                </small>
              </div>
              <div className="form-group">
                <label htmlFor="tableTimerSeconds">Chrono tableau (secondes)</label>
                <input
                  type="number"
                  id="tableTimerSeconds"
                  className="form-input"
                  value={tableTimerSeconds}
                  onChange={e => setTableTimerSeconds(Math.max(1, parseInt(e.target.value) || 180))}
                  min="1"
                  placeholder="180"
                />
                <small style={HINT}>
                  {`${Math.floor(tableTimerSeconds / 60)}min ${tableTimerSeconds % 60}s par match tableau`}
                </small>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={thirdPlaceMatch}
                    onChange={e => setThirdPlaceMatch(e.target.checked)}
                    style={MR}
                  />
                  {t('competition.third_place_match_label')}
                </label>
                <small style={HINT_INDENT}>{t('competition.third_place_match_description')}</small>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={signTableauMatches}
                    onChange={e => setSignTableauMatches(e.target.checked)}
                    style={MR}
                  />
                  {t('competition.sign_tableau_matches_label')}
                </label>
                <small style={HINT_INDENT}>
                  {t('competition.sign_tableau_matches_description')}
                </small>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={playAllPositions}
                    onChange={e => setPlayAllPositions(e.target.checked)}
                    style={MR}
                  />
                  Jouer toutes les places
                </label>
                <small style={HINT_INDENT}>
                  Les perdants de chaque tour forment un tableau de classement
                </small>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={poolWinnersOnly}
                    onChange={e => setPoolWinnersOnly(e.target.checked)}
                    style={MR}
                  />
                  Seuls les vainqueurs de poule accèdent au tableau
                </label>
                <small style={HINT_INDENT}>
                  Seul le 1er de chaque poule est qualifié pour le tableau d'élimination
                </small>
              </div>
            </>
          )}
        </div>
        {!questEnabled && (
          <div style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="postPoolSplitCriteria">
                Compétition couplée (séparation après poules)
              </label>
              <select
                id="postPoolSplitCriteria"
                className="form-input form-select"
                value={postPoolSplitCriteria}
                onChange={e =>
                  setPostPoolSplitCriteria(e.target.value as PostPoolSplitCriteria | '')
                }
              >
                <option value="">Aucune — compétition standard</option>
                <option value="gender">Par genre (H/F) — poules mixtes, tableaux séparés</option>
              </select>
              <small style={HINT}>
                Utile quand H et F partagent les mêmes poules faute d'effectif suffisant
              </small>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  // Clic extérieur sans effet : fermeture via ✕ / Échap (#1033)
  return (
    <div className="modal-overlay">
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: weapon === Weapon.CUSTOM ? '92vw' : '550px',
          width: weapon === Weapon.CUSTOM ? '1100px' : undefined,
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Propriétés de la compétition</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Informations générales */}
          <div style={MB15}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#6b7280',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
              }}
            >
              Informations générales
            </h3>

            <div className="form-group">
              <label htmlFor="title">Titre</label>
              <input
                type="text"
                id="title"
                className="form-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </div>

            <div style={GRID2}>
              <div className="form-group">
                <label htmlFor="date">Date</label>
                <input
                  type="date"
                  id="date"
                  className="form-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="location">Lieu</label>
                <input
                  type="text"
                  id="location"
                  className="form-input"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="organizer">Organisateur</label>
              <input
                type="text"
                id="organizer"
                className="form-input"
                value={organizer}
                onChange={e => setOrganizer(e.target.value)}
              />
            </div>
          </div>

          {/* Configuration */}
          <div style={MB15}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#6b7280',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
              }}
            >
              Configuration
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label htmlFor="weapon">Arme</label>
                <select
                  id="weapon"
                  className="form-input form-select"
                  value={weapon}
                  onChange={e => {
                    const w = e.target.value as Weapon;
                    setWeapon(w);
                    if (w === Weapon.LASER) setGender(Gender.MIXED);
                  }}
                >
                  <option value="E">Épée</option>
                  <option value="F">Fleuret</option>
                  <option value="S">Sabre</option>
                  <option value="L">Sabre Laser</option>
                  <option value="C">À la carte (formule personnalisée)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="gender">Genre</label>
                <select
                  id="gender"
                  className="form-input form-select"
                  value={gender}
                  onChange={e => setGender(e.target.value as Gender)}
                >
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                  <option value="X">Mixte</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="category">Catégorie</label>
                <select
                  id="category"
                  className="form-input form-select"
                  value={category}
                  onChange={e => setCategory(e.target.value as Category)}
                >
                  <option value={Category.U11}>{t('categories.U11')}</option>
                  <option value={Category.U13}>{t('categories.U13')}</option>
                  <option value={Category.U15}>{t('categories.U15')}</option>
                  <option value={Category.U17}>{t('categories.U17')}</option>
                  <option value={Category.U20}>{t('categories.U20')}</option>
                  <option value={Category.SENIOR}>{t('categories.senior')}</option>
                  <option value={Category.V1}>{t('categories.V1')}</option>
                  <option value={Category.V2}>{t('categories.V2')}</option>
                  <option value={Category.V3}>{t('categories.V3')}</option>
                  <option value={Category.V4}>{t('categories.V4')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Paramètres de formule */}
          <div style={MB1}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#6b7280',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
              }}
            >
              Formule de compétition
            </h3>

            {/* Formule à la carte — remplace tout le reste pour arme CUSTOM */}
            {isCustomWeapon && (
              <FormulaBuilder
                formula={customFormula}
                fencerCount={32}
                onChange={setCustomFormula}
              />
            )}

            {renderStandardFormula()}
          </div>

          {/* Tour Quest — visible uniquement pour Sabre Laser */}
          {weapon === Weapon.LASER && (
            <div style={MB1}>
              <h3
                style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#6b7280',
                  marginBottom: '0.75rem',
                  textTransform: 'uppercase',
                }}
              >
                Tour Quest
              </h3>

              {/* Oui / Non */}
              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label style={FIELD_LABEL}>Tour Quest activé ?</label>
                <div style={FLEX1}>
                  <label style={CHECK_LABEL}>
                    <input
                      type="radio"
                      name="questEnabled"
                      checked={!questEnabled}
                      onChange={() => handleQuestEnabledChange(false)}
                    />
                    Non
                  </label>
                  <label style={CHECK_LABEL}>
                    <input
                      type="radio"
                      name="questEnabled"
                      checked={questEnabled}
                      onChange={() => handleQuestEnabledChange(true)}
                    />
                    Oui
                  </label>
                </div>
              </div>

              {questEnabled && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  {/* Sans / Avec poules préliminaires */}
                  <div className="form-group">
                    <label style={FIELD_LABEL}>Poules préliminaires ?</label>
                    <div style={FLEX1}>
                      <label style={CHECK_LABEL}>
                        <input
                          type="radio"
                          name="questHasPools"
                          checked={!questHasPools}
                          onChange={() => handleQuestHasPoolsChange(false)}
                        />
                        Sans (Quest → Tableau)
                      </label>
                      <label style={CHECK_LABEL}>
                        <input
                          type="radio"
                          name="questHasPools"
                          checked={questHasPools}
                          onChange={() => handleQuestHasPoolsChange(true)}
                        />
                        Avec (Poules → Quest → Tableau)
                      </label>
                    </div>
                  </div>

                  {/* Nombre de qualifiés */}
                  {questHasPools && (
                    <div className="form-group">
                      <label htmlFor="questQualifiers" style={SM}>
                        Nombre de qualifiés des poules vers le Tour Quest
                      </label>
                      <input
                        type="number"
                        id="questQualifiers"
                        className="form-input"
                        value={questQualifiers}
                        min={2}
                        onChange={e =>
                          setQuestQualifiers(Math.max(2, parseInt(e.target.value) || 2))
                        }
                        style={{ maxWidth: '150px', marginTop: '0.25rem' }}
                      />
                    </div>
                  )}

                  <small style={{ color: '#166534', fontSize: '0.75rem' }}>
                    {questHasPools
                      ? `Formule : 1 tour de poules → Top ${questQualifiers} qualifiés → Tour Quest → Tableau`
                      : 'Formule : Tour Quest direct → Tableau'}
                  </small>
                </div>
              )}
            </div>
          )}

          {/* Gestion des arbitres */}
          <div style={MB1}>
            <h3
              style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#6b7280',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
              }}
            >
              Arbitrage
            </h3>
            <div className="form-group">
              <label style={CHECK_LABEL_SM}>
                <input
                  type="checkbox"
                  checked={refereeFeatureEnabled}
                  onChange={e => setRefereeFeatureEnabled(e.target.checked)}
                />
                Activer la gestion des arbitres
              </label>
              <small style={HINT_INDENT}>
                Affiche le nom de l'arbitre sur l'arène et permet de le changer depuis la saisie
                distante
              </small>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label style={CHECK_LABEL_SM}>
                <input
                  type="checkbox"
                  checked={blackCardEnabled}
                  onChange={e => setBlackCardEnabled(e.target.checked)}
                />
                Activer le carton noir
              </label>
              <small style={HINT_INDENT}>
                Affiche le bouton carton noir sur les tablettes (exclusion)
              </small>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label style={CHECK_LABEL_SM}>
                <input
                  type="checkbox"
                  checked={trainerCommentsEnabled}
                  onChange={e => setTrainerCommentsEnabled(e.target.checked)}
                />
                Activer les commentaires des formateurs d'arbitres
              </label>
              <small style={HINT_INDENT}>
                Ouvre l'espace /formateur de la saisie distante (mot de passe dédié) pour commenter
                les arbitres ; compte rendu exportable en PDF
              </small>
            </div>
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label style={CHECK_LABEL_SM}>
                <input
                  type="checkbox"
                  checked={expertMode}
                  onChange={e => setExpertMode(e.target.checked)}
                />
                Mode expert
              </label>
              <small style={HINT_INDENT}>
                Active l'édition avancée des pistes et du nombre d'arbitres par poule / match
              </small>
            </div>
            {expertMode && (
              <div
                style={{
                  background: '#fefce8',
                  // Fond jaune clair dans les deux thèmes : libellés en noir (#1032)
                  color: '#1f2937',
                  border: '1px solid #fde047',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginTop: '0.75rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                }}
              >
                <div className="form-group">
                  <label htmlFor="maxRefereesPerPool" style={{ ...SM, color: '#1f2937' }}>
                    Arbitres max par poule
                  </label>
                  <input
                    type="number"
                    id="maxRefereesPerPool"
                    className="form-input"
                    value={maxRefereesPerPool}
                    min={1}
                    max={10}
                    onChange={e =>
                      setMaxRefereesPerPool(Math.max(1, parseInt(e.target.value) || 1))
                    }
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="maxRefereesPerMatch" style={{ ...SM, color: '#1f2937' }}>
                    Arbitres max par match (tableau)
                  </label>
                  <input
                    type="number"
                    id="maxRefereesPerMatch"
                    className="form-input"
                    value={maxRefereesPerMatch}
                    min={1}
                    max={10}
                    onChange={e =>
                      setMaxRefereesPerMatch(Math.max(1, parseInt(e.target.value) || 1))
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default React.memo(CompetitionPropertiesModal);
