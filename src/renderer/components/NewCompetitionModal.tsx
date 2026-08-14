/**
 * BellePoule Modern - New Competition Modal
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Competition, CustomFormulaConfig, Weapon, Gender, Category } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';
import {
  createDefaultCustomFormula,
} from '../../shared/utils/tournamentTemplates';
import { FormulaBuilder } from './formula/FormulaBuilder';

interface NewCompetitionModalProps {
  onClose: () => void;
  onCreate: (data: Partial<Competition>) => void;
}

const NewCompetitionModal: React.FC<NewCompetitionModalProps> = ({ onClose, onCreate }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weapon, setWeapon] = useState<Weapon>(Weapon.EPEE);
  const [gender, setGender] = useState<Gender>(Gender.MALE);
  const [category, setCategory] = useState<Category>(Category.SENIOR);
  const [location, setLocation] = useState('');
  const [customFormula, setCustomFormula] = useState<CustomFormulaConfig>(
    createDefaultCustomFormula()
  );
  const [isTeamEvent, setIsTeamEvent] = useState(false);
  const [teamSize, setTeamSize] = useState(3);
  const [teamReserveCount, setTeamReserveCount] = useState(1);
  const [laserTeamMode, setLaserTeamMode] = useState<'touches' | 'points'>('touches');
  // Sabre Laser équipe uniquement : relais FIE classique (cible cumulée
  // progressive) ou format arène (assauts indépendants 5 touches/3min, score
  // = total de points, règlement épreuve par équipe Sabre Laser).
  const [teamFormat, setTeamFormat] = useState<'fie-relay' | 'laser-arena'>('fie-relay');

  const handleWeaponChange = (w: Weapon) => {
    setWeapon(w);
    if (w === Weapon.LASER) setGender(Gender.MIXED);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const teamSettings = {
      minTeamSize: teamSize,
      teamReserveCount,
      ...(weapon === Weapon.LASER ? { laserTeamMode, teamFormat } : {}),
    };

    const settings =
      weapon === Weapon.CUSTOM
        ? {
            defaultPoolMaxScore: 5,
            defaultTableMaxScore: 15,
            defaultPoolTimerSeconds: 180,
            defaultTableTimerSeconds: 180,
            poolRounds: 1,
            hasDirectElimination: true,
            thirdPlaceMatch: true,
            manualRanking: false,
            defaultRanking: 9999,
            randomScore: false,
            customFormula,
            ...teamSettings,
          }
        : isTeamEvent
          ? {
              defaultPoolMaxScore: 5,
              defaultTableMaxScore: 15,
              defaultPoolTimerSeconds: 180,
              defaultTableTimerSeconds: 180,
              poolRounds: 1,
              hasDirectElimination: true,
              thirdPlaceMatch: false,
              manualRanking: false,
              defaultRanking: 9999,
              randomScore: false,
              ...teamSettings,
            }
          : undefined;

    onCreate({
      title: title || `Compétition du ${new Date(date).toLocaleDateString('fr-FR')}`,
      date: new Date(date),
      weapon,
      gender,
      category,
      location,
      color: getRandomColor(),
      isTeamEvent,
      ...(settings ? { settings } : {}),
    });
  };

  const getRandomColor = () => {
    const colors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const isCustom = weapon === Weapon.CUSTOM;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        style={isCustom ? { maxWidth: '92vw', width: '1100px' } : undefined}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">{t('competition.new')}</h2>
          <button
            className="btn btn-icon btn-secondary"
            onClick={onClose}
            style={{ padding: '0.25rem' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">{t('competition.title')}</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Championnat Régional"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('competition.date')}</label>
              <input
                type="date"
                className="form-input"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('competition.weapon')}</label>
                <select
                  className="form-input form-select"
                  value={weapon}
                  onChange={e => handleWeaponChange(e.target.value as Weapon)}
                >
                  <option value={Weapon.EPEE}>{t('weapons.epee')}</option>
                  <option value={Weapon.FOIL}>{t('weapons.foil')}</option>
                  <option value={Weapon.SABRE}>{t('weapons.sabre')}</option>
                  <option value={Weapon.LASER}>{t('weapons.laser')}</option>
                  <option value={Weapon.CUSTOM}>À la carte (formule personnalisée)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('competition.gender')}</label>
                <select
                  className="form-input form-select"
                  value={gender}
                  onChange={e => setGender(e.target.value as Gender)}
                  disabled={weapon === Weapon.LASER}
                >
                  <option value={Gender.MALE}>{t('genders.male')}</option>
                  <option value={Gender.FEMALE}>{t('genders.female')}</option>
                  <option value={Gender.MIXED}>{t('genders.mixed')}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('competition.category')}</label>
                <select
                  className="form-input form-select"
                  value={category}
                  onChange={e => setCategory(e.target.value as Category)}
                >
                  <option value={Category.U11}>{t('categories.U11')} ({t('categories.U11')})</option>
                  <option value={Category.U13}>{t('categories.U13')} ({t('categories.U13')})</option>
                  <option value={Category.U15}>{t('categories.U15')} ({t('categories.U15')})</option>
                  <option value={Category.U17}>{t('categories.U17')} ({t('categories.U17')})</option>
                  <option value={Category.U20}>{t('categories.U20')} ({t('categories.U20')})</option>
                  <option value={Category.SENIOR}>{t('categories.senior')}</option>
                  <option value={Category.V1}>{t('categories.V1')} (40-49)</option>
                  <option value={Category.V2}>{t('categories.V2')} (50-59)</option>
                  <option value={Category.V3}>{t('categories.V3')} (60-69)</option>
                  <option value={Category.V4}>{t('categories.V4')} (70+)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isTeamEvent}
                  onChange={e => setIsTeamEvent(e.target.checked)}
                />
                <span className="form-label" style={{ margin: 0 }}>Compétition par équipes</span>
              </label>
            </div>

            {isTeamEvent && (
              <div
                className="form-group"
                style={{
                  display: 'grid',
                  gridTemplateColumns: weapon === Weapon.LASER ? '1fr 1fr 1fr 1fr' : '1fr 1fr',
                  gap: '1rem',
                  background: '#f9fafb',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                }}
              >
                <div className="form-group">
                  <label className="form-label">Titulaires par équipe</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={10}
                    value={teamSize}
                    onChange={e => setTeamSize(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Réservistes par équipe</label>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={5}
                    value={teamReserveCount}
                    onChange={e => setTeamReserveCount(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                {weapon === Weapon.LASER && (
                  <div className="form-group">
                    <label className="form-label">Cible Sabre Laser</label>
                    <select
                      className="form-input form-select"
                      value={laserTeamMode}
                      onChange={e => setLaserTeamMode(e.target.value as 'touches' | 'points')}
                    >
                      <option value="touches">Touches (comme les autres armes)</option>
                      <option value="points">Points de zone cumulés (A/B/C)</option>
                    </select>
                  </div>
                )}
                {weapon === Weapon.LASER && (
                  <div className="form-group">
                    <label className="form-label">Format de rencontre</label>
                    <select
                      className="form-input form-select"
                      value={teamFormat}
                      onChange={e => setTeamFormat(e.target.value as 'fie-relay' | 'laser-arena')}
                    >
                      <option value="fie-relay">Relais FIE classique (cible cumulée)</option>
                      <option value="laser-arena">
                        Arène équipe (assauts 5 touches/3min, règlement ASL-FFE)
                      </option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                {t('competition.location')} ({t('actions.default')})
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: Gymnase Jean Moulin, Paris"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>

            {/* Constructeur de formule — visible uniquement pour arme CUSTOM */}
            {isCustom && (
              <div className="form-group custom-formula-section">
                <label className="form-label" style={{ fontSize: '1rem', fontWeight: 600 }}>
                  Constructeur de formule
                </label>
                <FormulaBuilder
                  formula={customFormula}
                  fencerCount={32}
                  onChange={setCustomFormula}
                />
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('actions.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('actions.add')} {t('competition.title').toLowerCase()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default React.memo(NewCompetitionModal);
