/**
 * BellePoule Modern - Tournoi des rapières : choix de la plage de vagues à imprimer (#1441)
 * Impression anticipée des feuilles de match d'un intervalle de vagues (vague de départ → fin).
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useFocusTrap } from '../../renderer/hooks/useFocusTrap';
import { useTranslation } from '../../renderer/hooks/useTranslation';

interface RapieresWavePrintDialogProps {
  total: number;
  /** Vague par défaut : la vague en cours (ou la première) */
  defaultFrom: number;
  onConfirm: (from: number, to: number) => void;
  onClose: () => void;
}

const RapieresWavePrintDialog: React.FC<RapieresWavePrintDialogProps> = ({
  total,
  defaultFrom,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [from, setFrom] = useState(Math.min(Math.max(defaultFrom, 1), total));
  const [to, setTo] = useState(total);
  const waves = Array.from({ length: total }, (_, i) => i + 1);
  const valid = from >= 1 && to >= from && to <= total;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2 className="modal-title">{t('rapieres.print_wave_range_title')}</h2>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="rapieres-print-from">
              {t('rapieres.print_wave_from')}
            </label>
            <select
              id="rapieres-print-from"
              className="form-input"
              value={from}
              onChange={e => {
                const v = Number(e.target.value);
                setFrom(v);
                if (to < v) setTo(v);
              }}
            >
              {waves.map(w => (
                <option key={w} value={w}>
                  {t('rapieres.wave_n', { n: String(w) })}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rapieres-print-to">
              {t('rapieres.print_wave_to')}
            </label>
            <select
              id="rapieres-print-to"
              className="form-input"
              value={to}
              onChange={e => setTo(Number(e.target.value))}
            >
              {waves
                .filter(w => w >= from)
                .map(w => (
                  <option key={w} value={w}>
                    {t('rapieres.wave_n', { n: String(w) })}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('rapieres.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onConfirm(from, to)}
          >
            {t('rapieres.print')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RapieresWavePrintDialog;
