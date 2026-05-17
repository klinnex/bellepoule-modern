/**
 * BellePoule Modern - Competition Properties Modal
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { Competition, Weapon, Gender, Category, CompetitionSettings, QuestPhaseConfig } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';

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
      defaultPoolMaxScore: poolMaxScore,
      defaultTableMaxScore: tableMaxScore,
      manualRanking: competition.settings?.manualRanking ?? false,
      defaultRanking: competition.settings?.defaultRanking ?? 9999,
      randomScore: competition.settings?.randomScore ?? false,
      minTeamSize: competition.settings?.minTeamSize ?? 3,
      questConfig,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
        <div className="modal-header">
          <h2>Propriétés de la compétition</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Informations générales */}
          <div style={{ marginBottom: '1.5rem' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
          <div style={{ marginBottom: '1.5rem' }}>
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
                  <option value="U11">U11 (Poussin)</option>
                  <option value="U13">U13 (Benjamin)</option>
                  <option value="U15">U15 (Minime)</option>
                  <option value="U17">U17 (Cadet)</option>
                  <option value="U20">U20 (Junior)</option>
                  <option value="SEN">Senior</option>
                  <option value="V1">Vétéran 1</option>
                  <option value="V2">Vétéran 2</option>
                  <option value="V3">Vétéran 3</option>
                  <option value="V4">Vétéran 4</option>
                </select>
              </div>
            </div>
          </div>

          {/* Paramètres de formule */}
          <div style={{ marginBottom: '1rem' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Tours de poules — masqué en mode Quest sans poules préliminaires */}
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
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
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
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
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
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Touches pour gagner un match de poule
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
                    <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      {tableMaxScore === 0
                        ? '0 = illimité (pas de limite)'
                        : `${tableMaxScore} touches pour gagner`}
                    </small>
                  </div>

                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={thirdPlaceMatch}
                        onChange={e => setThirdPlaceMatch(e.target.checked)}
                        style={{ marginRight: '0.5rem' }}
                      />
                      {t('competition.third_place_match_label')}
                    </label>
                    <small style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '1.5rem' }}>
                      {t('competition.third_place_match_description')}
                    </small>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tour Quest — visible uniquement pour Sabre Laser */}
          {weapon === Weapon.LASER && (
            <div style={{ marginBottom: '1rem' }}>
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
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                  Tour Quest activé ?
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                    <input
                      type="radio"
                      name="questEnabled"
                      checked={!questEnabled}
                      onChange={() => handleQuestEnabledChange(false)}
                    />
                    Non
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
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
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                      Poules préliminaires ?
                    </label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input
                          type="radio"
                          name="questHasPools"
                          checked={!questHasPools}
                          onChange={() => handleQuestHasPoolsChange(false)}
                        />
                        Sans (Quest → Tableau)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.875rem' }}>
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
                      <label htmlFor="questQualifiers" style={{ fontSize: '0.875rem' }}>
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

export default CompetitionPropertiesModal;
