/**
 * BellePoule Modern - Change Pool Modal Component
 * Allows moving a fencer from one pool to another
 * Licensed under GPL-3.0
 */

import React, { useState, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Modal from './common/Modal';
import { Fencer, Pool, MatchStatus } from '../../shared/types';

interface ChangePoolModalProps {
  fencer: Fencer;
  currentPool: Pool;
  allPools: Pool[];
  onMove: (fencerId: string, fromPoolIndex: number, toPoolIndex: number) => void;
  onClose: () => void;
}

const ChangePoolModalComponent: React.FC<ChangePoolModalProps> = ({
  fencer,
  currentPool,
  allPools,
  onMove,
  onClose,
}) => {
  const { t } = useTranslation();
  const [selectedPoolIndex, setSelectedPoolIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragRef = useRef<boolean>(false);

  const currentPoolIndex = allPools.findIndex(p => p.id === currentPool.id);
  const otherPools = allPools
    .map((pool, index) => ({ pool, index }))
    .filter(({ pool }) => pool.id !== currentPool.id);

  // Vérifier si des matches ont été joués dans la poule actuelle impliquant ce tireur
  const hasPlayedMatches = currentPool.matches.some(
    m =>
      m.status === MatchStatus.FINISHED &&
      (m.fencerA?.id === fencer.id || m.fencerB?.id === fencer.id)
  );

  const handleMove = () => {
    if (selectedPoolIndex !== null) {
      onMove(fencer.id, currentPoolIndex, selectedPoolIndex);
      onClose();
    }
  };

  return (
    <Modal
      title={t('changePool.title')}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleMove}
            disabled={selectedPoolIndex === null}
          >
            {t('changePool.move')}
          </button>
        </>
      }
    >
      <div
        draggable
        onDragStart={() => {
          dragRef.current = true;
        }}
        onDragEnd={() => {
          dragRef.current = false;
          setDragOverIndex(null);
        }}
        style={{
          padding: '1rem',
          background: 'var(--color-bg)',
          borderRadius: '8px',
          marginBottom: '1rem',
          textAlign: 'center',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            fontSize: '0.875rem',
            color: 'var(--color-text-light)',
            marginBottom: '0.25rem',
          }}
        >
          {t('changePool.drag')}
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
          {fencer.firstName} {fencer.lastName}
        </div>
        <div className="u-hint">{t('changePool.current', { n: currentPool.number })}</div>
      </div>

      {hasPlayedMatches && (
        <div
          style={{
            padding: '0.75rem',
            background: '#fef3c7',
            borderRadius: '6px',
            marginBottom: '1rem',
            color: '#92400e',
            fontSize: '0.875rem',
          }}
        >
          ⚠️ <strong>{t('changePool.warning')}</strong> {t('changePool.warning_text')}
        </div>
      )}

      <div className="mb-4">
        <label
          style={{
            display: 'block',
            fontSize: '0.875rem',
            fontWeight: '500',
            marginBottom: '0.5rem',
          }}
        >
          {t('changePool.move_to')}
        </label>

        {otherPools.length === 0 ? (
          <div
            style={{
              padding: '1rem',
              textAlign: 'center',
              color: 'var(--color-text-light)',
              background: 'var(--color-surface-2)',
              borderRadius: '6px',
            }}
          >
            {t('changePool.none')}
          </div>
        ) : (
          <div className="u-stack-2">
            {otherPools.map(({ pool, index }) => {
              const matchesPlayed = pool.matches.filter(
                m => m.status === MatchStatus.FINISHED
              ).length;
              const isSelected = selectedPoolIndex === index;

              return (
                <div
                  key={pool.id}
                  onClick={() => setSelectedPoolIndex(index)}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setSelectedPoolIndex(index);
                    setDragOverIndex(null);
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    border: `2px solid ${isSelected || dragOverIndex === index ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isSelected
                      ? '#eff6ff'
                      : dragOverIndex === index
                        ? '#dbeafe'
                        : 'white',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div className="u-row-between">
                    <div>
                      <span style={{ fontWeight: '600' }}>
                        {t('changePool.pool_n', { n: pool.number })}
                      </span>
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.875rem',
                          color: 'var(--color-text-light)',
                        }}
                      >
                        {t('changePool.fencers_n', { n: pool.fencers.length })}
                      </span>
                    </div>
                    {matchesPlayed > 0 && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.125rem 0.5rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '4px',
                        }}
                      >
                        {t('changePool.played', { count: matchesPlayed })}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      marginTop: '0.25rem',
                    }}
                  >
                    {pool.fencers.map(f => f.lastName).join(', ')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedPoolIndex !== null && (
        <div
          style={{
            padding: '0.75rem',
            background: '#f0fdf4',
            borderRadius: '6px',
            color: '#166534',
            fontSize: '0.875rem',
          }}
        >
          {t('changePool.recalc')}
        </div>
      )}
    </Modal>
  );
};

const ChangePoolModal = React.memo(ChangePoolModalComponent);
export default ChangePoolModal;
