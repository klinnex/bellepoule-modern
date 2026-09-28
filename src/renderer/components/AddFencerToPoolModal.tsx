/**
 * BellePoule Modern - Add Fencer To Pool Modal
 * Allows adding an unassigned fencer to a pool mid-competition
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Fencer, Match, MatchStatus, Pool, PoolSnapshot } from '../../shared/types';
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from './Toast';
import { useDebounce } from '../hooks/useDebounce';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface AddFencerToPoolModalProps {
  pool: Pool;
  competitionId: string;
  maxScore?: number;
  /** Tireurs déjà placés dans une poule (toutes poules confondues) */
  assignedFencerIds?: ReadonlySet<string>;
  onConfirm: (updatedPool: Pool) => void;
  onClose: () => void;
}

/**
 * Ajoute un tireur à la poule affichée (source de vérité = état de la session).
 * Crée un match contre chaque tireur déjà présent, à la suite des matchs existants.
 */
export function buildPoolWithAddedFencer(pool: Pool, fencer: Fencer, maxScore: number): Pool {
  const now = new Date();
  let nextNumber = pool.matches.reduce((max, m) => Math.max(max, m.number || 0), 0);
  const newMatches: Match[] = pool.fencers.map(existing => ({
    id: crypto.randomUUID(),
    poolId: pool.id,
    number: ++nextNumber,
    fencerA: fencer,
    fencerB: existing,
    scoreA: null,
    scoreB: null,
    maxScore,
    status: MatchStatus.NOT_STARTED,
    createdAt: now,
    updatedAt: now,
  }));
  return {
    ...pool,
    fencers: [...pool.fencers, fencer],
    matches: [...pool.matches, ...newMatches],
    isComplete: false,
    updatedAt: now,
  };
}

function toSnapshot(pool: Pool): PoolSnapshot {
  return {
    id: pool.id,
    number: pool.number,
    fencerIds: pool.fencers.map(f => f.id),
    matches: pool.matches.map(m => ({
      id: m.id,
      number: m.number,
      fencerAId: m.fencerA?.id ?? null,
      fencerBId: m.fencerB?.id ?? null,
      maxScore: m.maxScore,
    })),
  };
}

const AddFencerToPoolModalComponent: React.FC<AddFencerToPoolModalProps> = ({
  pool,
  competitionId,
  maxScore = 5,
  assignedFencerIds,
  onConfirm,
  onClose,
}) => {
  const { showToast } = useToast();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  const [allFencers, setAllFencers] = useState<Fencer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedFencer, setSelectedFencer] = useState<Fencer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    setIsFetching(true);
    window.electronAPI.db
      .getFencersByCompetition(competitionId)
      .then(setAllFencers)
      .catch(err => logger.error(LogCategory.DATABASE, 'getFencersByCompetition failed', err as Error))
      .finally(() => setIsFetching(false));
  }, [competitionId]);

  const debouncedSearch = useDebounce(search, 250);
  const available = useMemo(() => {
    const poolFencerIds = new Set(pool.fencers.map(f => f.id));
    const q = debouncedSearch.toLowerCase();
    return allFencers.filter(
      f =>
        !poolFencerIds.has(f.id) &&
        !assignedFencerIds?.has(f.id) &&
        (`${f.firstName} ${f.lastName}`.toLowerCase().includes(q) ||
          f.lastName.toLowerCase().includes(q))
    );
  }, [allFencers, assignedFencerIds, pool.fencers, debouncedSearch]);

  const handleAdd = async () => {
    if (!selectedFencer) return;
    setIsLoading(true);
    try {
      const updatedPool = buildPoolWithAddedFencer(pool, selectedFencer, maxScore);
      // Synchro DB auto-réparante (crée poule/lignes manquantes) : non bloquante
      try {
        await window.electronAPI.db.syncPoolSnapshot(competitionId, toSnapshot(updatedPool));
      } catch (err) {
        logger.error(LogCategory.DATABASE, 'syncPoolSnapshot failed', err as Error);
        showToast('Tireur ajouté, mais la synchronisation en base a échoué', 'warning');
      }
      onConfirm(updatedPool);
    } catch (err) {
      showToast(
        "Erreur lors de l'ajout : " + (err instanceof Error ? err.message : 'Erreur inconnue'),
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-fencer-title"
      >
        <div className="modal-header">
          <h2 id="add-fencer-title">Ajouter un tireur – Poule {pool.number}</h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
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
            ⚠️ <strong>Opération de sauvetage :</strong> le tireur sera ajouté sans rééquilibrage.
            Des matchs contre tous les tireurs présents seront créés.
          </div>

          <input
            type="text"
            placeholder="Rechercher par nom…"
            aria-label="Rechercher un tireur par nom"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              marginBottom: '0.75rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />

          <div
            style={{
              maxHeight: '240px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
            }}
          >
            {isFetching ? (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                Chargement des tireurs…
              </div>
            ) : available.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                }}
              >
                Aucun tireur disponible
              </div>
            ) : (
              available.map(f => {
                const isSelected = selectedFencer?.id === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFencer(isSelected ? null : f)}
                    style={{
                      padding: '0.6rem 0.75rem',
                      cursor: 'pointer',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                      {f.lastName} {f.firstName}
                    </span>
                    {f.club && (
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{f.club}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={!selectedFencer || isLoading}
          >
            {isLoading ? 'Ajout…' : 'Ajouter le tireur'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AddFencerToPoolModal = React.memo(AddFencerToPoolModalComponent);
export default AddFencerToPoolModal;
