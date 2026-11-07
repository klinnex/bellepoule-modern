/**
 * BellePoule Modern - Bouton d'assignation de piste pour toute une poule (#1501)
 * Même principe que le bouton de désignation d'arbitre ; lié à la sélection de
 * piste de l'onglet Préparation (pool.strip).
 * Licensed under GPL-3.0
 */
import React, { useState } from 'react';
import Modal from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';
import { stripNumbers } from '../../../shared/utils/stripRange';
import { useStripAvailability } from '../../hooks/useStripAvailability';

interface PoolStripButtonProps {
  poolNumber: number;
  /** Piste actuelle de la poule (undefined = automatique) */
  strip?: number | null;
  /** Intervalle de pistes de la saisie distante */
  stripRange: { start: number; end: number };
  onChange: (strip: number | undefined) => void;
}

const GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '0.5rem',
};

export const PoolStripButton: React.FC<PoolStripButtonProps> = ({
  poolNumber,
  strip,
  stripRange,
  onChange,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unavailable = useStripAvailability(s => s.unavailable);
  const pick = (value: number | undefined) => {
    onChange(value);
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('poolView.assign_strip')}
        className={`pv-pill${strip != null ? ' is-assigned' : ''}${strip != null && unavailable.includes(strip) ? ' is-unavailable' : ''}`}
      >
        🏟 {strip != null ? t('poolView.strip_n', { n: strip }) : t('poolView.add_strip')}
      </button>
      {open && (
        <Modal title={t('poolView.assign_strip')} onClose={() => setOpen(false)} size="sm">
          <p className="u-hint mb-4">{t('poolView.select_strip', { n: poolNumber })}</p>
          <div style={GRID}>
            <button
              type="button"
              className={`btn ${strip == null ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => pick(undefined)}
            >
              –
            </button>
            {stripNumbers(stripRange.start, stripRange.end).map(n => (
              <button
                type="button"
                key={n}
                className={`btn ${strip === n ? 'btn-primary' : 'btn-secondary'}${unavailable.includes(n) ? ' is-unavailable' : ''}`}
                onClick={() => pick(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
};
