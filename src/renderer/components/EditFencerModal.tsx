/**
 * BellePoule Modern - Edit Fencer Modal Component
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Fencer, Gender, FencerStatus } from '../../shared/types';
import FencerPhoto from './FencerPhoto';

interface EditFencerModalProps {
  fencer: Fencer;
  onSave: (id: string, updates: Partial<Fencer>) => void;
  onClose: () => void;
}

const EditFencerModal: React.FC<EditFencerModalProps> = ({ fencer, onSave, onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [lastName, setLastName] = useState(fencer.lastName);
  const [firstName, setFirstName] = useState(fencer.firstName);
  const [gender, setGender] = useState<Gender>(fencer.gender);
  const [club, setClub] = useState(fencer.club || '');
  const [region, setRegion] = useState(fencer.region || '');
  const [nationality, setNationality] = useState(fencer.nationality || 'FRA');
  const [license, setLicense] = useState(fencer.license || '');
  const [ranking, setRanking] = useState(fencer.ranking?.toString() || '');
  const [status, setStatus] = useState<FencerStatus>(fencer.status);
  const [photo, setPhoto] = useState<string | undefined>(fencer.photo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSave(fencer.id, {
      lastName: lastName.toUpperCase(),
      firstName,
      gender,
      club: club || undefined,
      region: region || undefined,
      nationality,
      license: license || undefined,
      ranking: ranking ? parseInt(ranking) : undefined,
      status,
      photo,
    });

    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Modifier le tireur</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
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
              <label className="form-label">Nom *</label>
              <input
                type="text"
                className="form-input"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Prénom *</label>
              <input
                type="text"
                className="form-input"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Sexe</label>
              <select
                className="form-input form-select"
                value={gender}
                onChange={e => setGender(e.target.value as Gender)}
              >
                <option value={Gender.MALE}>Homme</option>
                <option value={Gender.FEMALE}>Femme</option>
                <option value={Gender.MIXED}>Mixte</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Statut</label>
              <select
                className="form-input form-select"
                value={status}
                onChange={e => setStatus(e.target.value as FencerStatus)}
              >
                <option value={FencerStatus.NOT_CHECKED_IN}>Non pointé</option>
                <option value={FencerStatus.CHECKED_IN}>Pointé (présent)</option>
                <option value={FencerStatus.FORFAIT}>Forfait</option>
                <option value={FencerStatus.ABANDONED}>Abandon</option>
                <option value={FencerStatus.EXCLUDED}>Exclu</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Club</label>
            <input
              type="text"
              className="form-input"
              value={club}
              onChange={e => setClub(e.target.value)}
              placeholder="Ex: CE Melun"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Région</label>
              <input
                type="text"
                className="form-input"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="Ex: IDF"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nationalité</label>
              <input
                type="text"
                className="form-input"
                value={nationality}
                onChange={e => setNationality(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="FRA"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">N° Licence</label>
              <input
                type="text"
                className="form-input"
                value={license}
                onChange={e => setLicense(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Classement</label>
              <input
                type="number"
                className="form-input"
                value={ranking}
                onChange={e => setRanking(e.target.value)}
                min="1"
                placeholder="Non classé"
              />
            </div>
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

export default React.memo(EditFencerModal);
