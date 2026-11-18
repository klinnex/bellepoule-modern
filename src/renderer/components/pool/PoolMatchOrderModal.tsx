/**
 * BellePoule Modern - Modal de référence : ordre officiel FIE/FFE des matchs en poule
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { boutsForTable, type PoolBoutTable } from '../../../shared/utils/poolBoutOrder';

/** Variantes réglementaires par taille (FIE o.70.3 et o.70.4, #1964) */
const VARIANTS: Record<number, PoolBoutTable[]> = {
  6: ['standard', 'trio6', 'quartet6'],
  7: ['standard', 'trio7'],
};

interface PoolMatchOrderModalProps {
  onClose: () => void;
}

const PoolMatchOrderModal: React.FC<PoolMatchOrderModalProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [poolSize, setPoolSize] = useState(6);
  const [variant, setVariant] = useState<PoolBoutTable>('standard');
  const variants = VARIANTS[poolSize] ?? ['standard'];
  const table = variants.includes(variant) ? variant : 'standard';

  const matches = boutsForTable(table, poolSize);
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
            onChange={e => {
              setPoolSize(Number(e.target.value));
              setVariant('standard');
            }}
            className="pool-match-order-modal-8"
          >
            {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
              <option key={n} value={n}>
                {t('matchOrder.option', { n, m: (n * (n - 1)) / 2 })}
              </option>
            ))}
          </select>
          {variants.length > 1 && (
            <select
              aria-label={t('matchOrder.variant')}
              value={table}
              onChange={e => setVariant(e.target.value as PoolBoutTable)}
              className="pool-match-order-modal-8"
              data-testid="pool-order-variant"
            >
              {variants.map(v => (
                <option key={v} value={v}>
                  {t(`matchOrder.variant_${v}`)}
                </option>
              ))}
            </select>
          )}
          <span className="pool-match-order-modal-9">
            {t('matchOrder.matches', { n: matchCount })}
          </span>
        </div>

        {table !== 'standard' && (
          <p className="pool-match-order-modal-9">{t(`matchOrder.placement_${table}`)}</p>
        )}

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
