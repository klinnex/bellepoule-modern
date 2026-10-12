/**
 * BellePoule Modern - FFE Export Modal
 * Export direct des résultats vers l'API FFE Connect
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { PoolRanking } from '../../shared/types';
import { FFEConnectService, FFEResultEntry } from '@shared/services/ffeConnectService';

interface FFEExportModalProps {
  ranking: PoolRanking[];
  onClose: () => void;
}

function toResultEntries(ranking: PoolRanking[]): {
  entries: FFEResultEntry[];
  missingLicense: number;
} {
  const entries: FFEResultEntry[] = [];
  let missingLicense = 0;
  for (const r of ranking) {
    if (!r.fencer.license) {
      missingLicense++;
      continue;
    }
    entries.push({
      licence: r.fencer.license,
      rank: r.rank,
      victories: r.victories,
      defeats: r.defeats,
      touchesScored: r.touchesScored,
      touchesReceived: r.touchesReceived,
    });
  }
  return { entries, missingLicense };
}

const FFEExportModal: React.FC<FFEExportModalProps> = ({ ranking, onClose }) => {
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [competitionCode, setCompetitionCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  const { entries, missingLicense } = toResultEntries(ranking);

  const handleExport = async () => {
    if (!competitionCode.trim()) {
      setErrors(['Le code de compétition est requis']);
      return;
    }
    setSending(true);
    setErrors([]);
    setSuccess(false);

    const service = new FFEConnectService({ apiKey: apiKey.trim() || undefined });
    const result = await service.exportResults(competitionCode.trim(), entries);

    setSending(false);
    if (!result.success) {
      setErrors(result.errors.length > 0 ? result.errors : ["Échec de l'export"]);
      return;
    }
    setSuccess(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">Exporter vers FFE Connect</h2>
          <button className="btn btn-icon btn-secondary" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Code de compétition *</label>
            <input
              className="form-input"
              type="text"
              placeholder="ex: 2024-IDF-001"
              value={competitionCode}
              onChange={e => setCompetitionCode(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Clé API (optionnelle)</label>
            <input
              className="form-input"
              type="password"
              placeholder="Votre clé API FFE"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={sending}
            />
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            {entries.length} tireur(s) prêt(s) à exporter
            {missingLicense > 0 && ` — ${missingLicense} sans numéro de licence (ignoré(s))`}
          </p>

          {errors.length > 0 && (
            <div
              style={{
                marginTop: '0.75rem',
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
          {success && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem',
                background: '#dcfce7',
                borderRadius: '6px',
                color: '#15803d',
              }}
            >
              Résultats envoyés à la FFE avec succès.
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}
        >
          <button className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={sending || entries.length === 0 || !competitionCode.trim()}
          >
            {sending ? 'Envoi…' : 'Exporter'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(FFEExportModal);
