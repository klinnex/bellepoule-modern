/**
 * BellePoule Modern - Modal de référence : ordre officiel FIE/FFE des matchs en poule
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { generatePoolMatchOrder } from '../../../shared/utils/poolCalculations';

interface PoolMatchOrderModalProps {
  onClose: () => void;
}

const PoolMatchOrderModal: React.FC<PoolMatchOrderModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [poolSize, setPoolSize] = useState(6);

  const matches = generatePoolMatchOrder(poolSize);
  const matchCount = (poolSize * (poolSize - 1)) / 2;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div onClick={handleOverlayClick} className="pool-match-order-modal-1">
      <div className="pool-match-order-modal-2">
        {/* Header */}
        <div className="pool-match-order-modal-3">
          <div>
            <div className="pool-match-order-modal-4">{t('matchOrder.title')}</div>
            <span className="pool-match-order-modal-5">{t('matchOrder.ref')}</span>
          </div>
          <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
        </div>

        {/* Sélecteur */}
        <div className="pool-match-order-modal-6">
          <label htmlFor="pool-order-size" className="pool-match-order-modal-7">
            {t('matchOrder.size')}
          </label>
          <select
            id="pool-order-size"
            value={poolSize}
            onChange={e => setPoolSize(Number(e.target.value))}
            className="pool-match-order-modal-8"
          >
            {[3, 4, 5, 6, 7, 8, 9].map(n => (
              <option key={n} value={n}>
                {t('matchOrder.option', { n, m: (n * (n - 1)) / 2 })}
                {n >= 9 ? ' (Berger)' : ''}
              </option>
            ))}
          </select>
          <span className="pool-match-order-modal-9">
            {t('matchOrder.matches', { n: matchCount })}
          </span>
        </div>

        {/* Liste des matchs — même format que "Matches à venir" dans PoolMatchList */}
        <div className="u-stack-2">
          {matches.map(([a, b], i) => (
            <div key={i} className="pool-match-order-modal-10">
              <span className="pool-match-order-modal-11">#{i + 1}</span>
              <span className="pool-match-order-modal-12">{t('matchOrder.fencer', { n: a })}</span>
              <span className="pool-match-order-modal-13">{t('matchOrder.vs')}</span>
              <span className="pool-match-order-modal-14">{t('matchOrder.fencer', { n: b })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PoolMatchOrderModal;
