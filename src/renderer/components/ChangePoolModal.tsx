/**
 * BellePoule Modern - Change Pool Modal Component
 * Allows moving a fencer from one pool to another
 * Licensed under GPL-3.0
 */

import React, { useState, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
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
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '450px' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h2>Changer de poule</h2>
          <button className="btn-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
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
              background: '#f3f4f6',
              borderRadius: '8px',
              marginBottom: '1rem',
              textAlign: 'center',
              cursor: 'grab',
              userSelect: 'none',
            }}
          >
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              ↕ Tireur (glisser vers une poule)
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '600' }}>
              {fencer.firstName} {fencer.lastName}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Actuellement en Poule {currentPool.number}
            </div>
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
              ⚠️ <strong>Attention :</strong> Ce tireur a déjà disputé des matches dans cette poule.
              Le déplacement supprimera ses résultats.
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '0.5rem',
              }}
            >
              Déplacer vers :
            </label>

            {otherPools.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: '#6b7280',
                  background: '#f9fafb',
                  borderRadius: '6px',
                }}
              >
                Aucune autre poule disponible
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                        border: `2px solid ${isSelected || dragOverIndex === index ? '#3b82f6' : '#e5e7eb'}`,
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
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: '600' }}>Poule {pool.number}</span>
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.875rem',
                              color: '#6b7280',
                            }}
                          >
                            ({pool.fencers.length} tireurs)
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
                            {matchesPlayed} match{matchesPlayed > 1 ? 's' : ''} joué
                            {matchesPlayed > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#9ca3af',
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
              ✓ Les matches des deux poules seront recalculés
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={handleMove}
            disabled={selectedPoolIndex === null}
          >
            Déplacer le tireur
          </button>
        </div>
      </div>
    </div>
  );
};

const ChangePoolModal = React.memo(ChangePoolModalComponent);
export default ChangePoolModal;
