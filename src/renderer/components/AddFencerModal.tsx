/**
 * BellePoule Modern - Add Fencer Modal
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Fencer, Gender, FencerStatus } from '../../shared/types';
import { useToast } from './Toast';
import FencerPhoto from './FencerPhoto';
import { useTranslation } from '../contexts/TranslationContext';

interface AddFencerModalProps {
  onClose: () => void;
  onAdd: (fencer: Partial<Fencer>) => void;
  competitionGender?: Gender;
}

const AddFencerModalComponent: React.FC<AddFencerModalProps> = ({ onClose, onAdd, competitionGender }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [club, setClub] = useState('');
  const [region, setRegion] = useState('');
  const [license, setLicense] = useState('');
  const [ranking, setRanking] = useState('');
  const lockedGender = competitionGender === Gender.MALE || competitionGender === Gender.FEMALE ? competitionGender : null;
  const [gender, setGender] = useState<Gender>(lockedGender ?? Gender.MALE);
  const [nationality, setNationality] = useState('FRA');
  const [photo, setPhoto] = useState<string | undefined>();

  const buildFencer = (): Partial<Fencer> => ({
    lastName: lastName.trim().toUpperCase(),
    firstName: firstName.trim(),
    club: club.trim() || undefined,
    region: region.trim() || undefined,
    license: license.trim() || undefined,
    ranking: ranking ? parseInt(ranking, 10) : undefined,
    gender,
    nationality,
    status: FencerStatus.NOT_CHECKED_IN,
    photo,
  });

  const resetForm = () => {
    setLastName('');
    setFirstName('');
    setClub('');
    setRegion('');
    setLicense('');
    setRanking('');
    setGender(Gender.MALE);
    setNationality('FRA');
    setPhoto(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastName.trim() || !firstName.trim()) {
      showToast(t('messages.name_required'), 'warning');
      return;
    }
    onAdd(buildFencer());
    onClose();
  };

  const handleSaveAndAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!lastName.trim() || !firstName.trim()) {
      showToast(t('messages.name_required'), 'warning');
      return;
    }
    onAdd(buildFencer());
    resetForm();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">{t('fencer.add')}</h2>
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
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <FencerPhoto
                photo={photo}
                firstName={firstName}
                lastName={lastName}
                onPhotoChange={setPhoto}
                editable
                size="medium"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('fencer.last_name')} *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="DUPONT"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('fencer.first_name')} *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Jean"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('fencer.gender')}</label>
                {lockedGender ? (
                  <input
                    type="text"
                    className="form-input"
                    value={lockedGender === Gender.MALE ? t('genders.male') : t('genders.female')}
                    readOnly
                    style={{ background: 'var(--bg-secondary, #f5f5f5)', cursor: 'not-allowed' }}
                  />
                ) : (
                  <select
                    className="form-input form-select"
                    value={gender}
                    onChange={e => setGender(e.target.value as Gender)}
                  >
                    <option value={Gender.MALE}>{t('genders.male')}</option>
                    <option value={Gender.FEMALE}>{t('genders.female')}</option>
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t('fencer.nationality')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="FRA"
                  value={nationality}
                  onChange={e => setNationality(e.target.value.toUpperCase())}
                  maxLength={3}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('fencer.club')}</label>
              <input
                type="text"
                className="form-input"
                placeholder="PARIS USM"
                value={club}
                onChange={e => setClub(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{t('fencer.league')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Île-de-France"
                  value={region}
                  onChange={e => setRegion(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('fencer.license')}</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="123456789"
                  value={license}
                  onChange={e => setLicense(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('fencer.ranking')}</label>
              <input
                type="number"
                className="form-input"
                placeholder="1000"
                value={ranking}
                onChange={e => setRanking(e.target.value)}
                min="1"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('actions.cancel')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleSaveAndAdd}>
              {t('actions.save_and_add')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t('actions.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddFencerModal = React.memo(AddFencerModalComponent);
export default AddFencerModal;
