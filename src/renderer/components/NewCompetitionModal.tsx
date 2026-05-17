/**
 * BellePoule Modern - New Competition Modal
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { Competition, Weapon, Gender, Category } from '../../shared/types';
import { useTranslation } from '../hooks/useTranslation';

interface NewCompetitionModalProps {
  onClose: () => void;
  onCreate: (data: Partial<Competition>) => void;
}

const NewCompetitionModal: React.FC<NewCompetitionModalProps> = ({ onClose, onCreate }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weapon, setWeapon] = useState<Weapon>(Weapon.EPEE);
  const [gender, setGender] = useState<Gender>(Gender.MALE);
  const [category, setCategory] = useState<Category>(Category.SENIOR);
  const [location, setLocation] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onCreate({
      title: title || `Compétition du ${new Date(date).toLocaleDateString('fr-FR')}`,
      date: new Date(date),
      weapon,
      gender,
      category,
      location,
      color: getRandomColor(),
    });
  };

  const getRandomColor = () => {
    const colors = [
      '#3B82F6',
      '#10B981',
      '#F59E0B',
      '#EF4444',
      '#8B5CF6',
      '#EC4899',
      '#06B6D4',
      '#84CC16',
      '#F97316',
      '#6366F1',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
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
                  onChange={e => {
                    const w = e.target.value as Weapon;
                    setWeapon(w);
                    if (w === Weapon.LASER) setGender(Gender.MIXED);
                  }}
                >
                  <option value={Weapon.EPEE}>{t('weapons.epee')}</option>
                  <option value={Weapon.FOIL}>{t('weapons.foil')}</option>
                  <option value={Weapon.SABRE}>{t('weapons.sabre')}</option>
                  <option value={Weapon.LASER}>{t('weapons.laser')}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('competition.gender')}</label>
                <select
                  className="form-input form-select"
                  value={gender}
                  onChange={e => setGender(e.target.value as Gender)}
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
                  <option value={Category.U11}>
                    {t('categories.U11')} ({t('categories.U11')})
                  </option>
                  <option value={Category.U13}>
                    {t('categories.U13')} ({t('categories.U13')})
                  </option>
                  <option value={Category.U15}>
                    {t('categories.U15')} ({t('categories.U15')})
                  </option>
                  <option value={Category.U17}>
                    {t('categories.U17')} ({t('categories.U17')})
                  </option>
                  <option value={Category.U20}>
                    {t('categories.U20')} ({t('categories.U20')})
                  </option>
                  <option value={Category.SENIOR}>{t('categories.senior')}</option>
                  <option value={Category.V1}>{t('categories.V1')} (40-49)</option>
                  <option value={Category.V2}>{t('categories.V2')} (50-59)</option>
                  <option value={Category.V3}>{t('categories.V3')} (60-69)</option>
                  <option value={Category.V4}>{t('categories.V4')} (70+)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('competition.location')} ({t('actions.default')})
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={`Ex: Gymnase Jean Moulin, Paris`}
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
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

export default NewCompetitionModal;
