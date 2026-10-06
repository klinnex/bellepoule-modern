/**
 * BellePoule Modern - FFE Connect Modal
 * Import participants from FFE Connect API
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Fencer } from '../../shared/types';
import { FFEConnectService, FFEParticipant } from '@shared/services/ffeConnectService';

interface FFEConnectModalProps {
  onImport: (fencers: Partial<Fencer>[]) => void;
  onClose: () => void;
}

const FFEConnectModal: React.FC<FFEConnectModalProps> = ({ onImport, onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [competitionCode, setCompetitionCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [participants, setParticipants] = useState<FFEParticipant[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleImportFetch = async () => {
    if (!competitionCode.trim()) {
      setErrors(['Le code de compétition est requis']);
      return;
    }
    setLoading(true);
    setErrors([]);
    setParticipants([]);
    setSelected(new Set());

    const service = new FFEConnectService({ apiKey: apiKey.trim() || undefined });
    const result = await service.importParticipants(competitionCode.trim());

    setLoading(false);
    if (!result.success || result.participants.length === 0) {
      setErrors(
        result.errors.length > 0
          ? result.errors
          : ['Aucun participant trouvé pour ce code de compétition']
      );
      return;
    }

    setParticipants(result.participants);
    setSelected(new Set(result.participants.map((_, i) => i)));
  };

  const toggleAll = () => {
    if (selected.size === participants.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(participants.map((_, i) => i)));
    }
  };

  const toggleOne = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelected(next);
  };

  const handleAdd = () => {
    const service = new FFEConnectService({ apiKey: apiKey.trim() || undefined });
    const fencers = participants.filter((_, i) => selected.has(i)).map(p => service.toFencer(p));
    onImport(fencers);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '860px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">Importer depuis FFE Connect</h2>
          <button className="btn btn-icon btn-secondary" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          <div className="form-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Code de compétition *</label>
              <input
                className="form-input"
                type="text"
                placeholder="ex: 2024-IDF-001"
                value={competitionCode}
                onChange={e => setCompetitionCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleImportFetch()}
                disabled={loading}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Clé API (optionnelle)</label>
              <input
                className="form-input"
                type="password"
                placeholder="Votre clé API FFE"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="form-group" style={{ flex: 'none', alignSelf: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleImportFetch}
                disabled={loading || !competitionCode.trim()}
              >
                {loading ? 'Chargement…' : 'Importer'}
              </button>
            </div>
          </div>

          {errors.length > 0 && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#fee2e2',
                borderRadius: '6px',
                color: '#dc2626',
              }}
            >
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          {participants.length > 0 && (
            <>
              <div
                style={{
                  marginBottom: '0.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  <strong>{participants.length}</strong> participant(s) trouvé(s) —{' '}
                  <strong>{selected.size}</strong> sélectionné(s)
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={toggleAll}
                  style={{ padding: '4px 10px' }}
                >
                  {selected.size === participants.length
                    ? 'Tout désélectionner'
                    : 'Tout sélectionner'}
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="results-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Licence</th>
                      <th>Nom</th>
                      <th>Prénom</th>
                      <th>Club</th>
                      <th>Ligue</th>
                      <th>Sexe</th>
                      <th>Nationalité</th>
                      <th>Classement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p, i) => (
                      <tr
                        key={i}
                        onClick={() => toggleOne(i)}
                        style={{
                          cursor: 'pointer',
                          background: selected.has(i)
                            ? 'var(--color-primary-light, rgba(0,100,255,0.08))'
                            : undefined,
                        }}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selected.has(i)}
                            onChange={() => toggleOne(i)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td>{p.licence}</td>
                        <td>{p.nom}</td>
                        <td>{p.prenom}</td>
                        <td>{p.club}</td>
                        <td>{p.ligue}</td>
                        <td>{p.sexe}</td>
                        <td>{p.nationalite}</td>
                        <td>{p.classement ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div
          className="modal-footer"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '1rem' }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={selected.size === 0}>
            Ajouter les sélectionnés ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FFEConnectModal);
