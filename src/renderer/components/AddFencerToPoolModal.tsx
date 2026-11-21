/**
 * BellePoule Modern - Add Fencer To Pool Modal
 * Allows adding an unassigned fencer to a pool mid-competition
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Fencer, Pool, PoolSnapshot } from '../../shared/types';
import { addFencerToPool } from '../../shared/domain/pools/poolComposition';
import type { RecordScoreOutcome } from './tableau/tableauViewShared';
import { logger, LogCategory } from '@shared/services/logger';
import { useToast } from './Toast';
import { useDebounce } from '../hooks/useDebounce';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useTranslation } from '../hooks/useTranslation';
import { Button } from './common/Button';
import { TriangleAlert } from 'lucide-react';
import { Icon } from './common/Icon';

interface AddFencerToPoolModalProps {
  pool: Pool;
  competitionId: string;
  maxScore?: number;
  /** Tireurs déjà placés dans une poule (toutes poules confondues) */
  assignedFencerIds?: ReadonlySet<string>;
  onConfirm: (updatedPool: Pool) => void;
  onClose: () => void;
  /** Ajout par la commande addPoolFencer (docs/adr/0017) ; « local » : ajout historique */
  onAddByCommand?: (fencerId: string) => Promise<RecordScoreOutcome>;
}

/**
 * Ajoute un tireur à la poule affichée (source de vérité = état de la session).
 * Crée un match contre chaque tireur déjà présent, à la suite des matchs existants.
 * Règle partagée avec le moteur (addPoolFencer) : shared/domain/pools/poolComposition.
 */
export function buildPoolWithAddedFencer(pool: Pool, fencer: Fencer, maxScore: number): Pool {
  return addFencerToPool(pool, fencer, {
    maxScore,
    newId: () => crypto.randomUUID(),
    now: new Date(),
  });
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
  onAddByCommand,
}) => {
  const { t } = useTranslation();
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
      .catch(err =>
        logger.error(LogCategory.DATABASE, 'getFencersByCompetition failed', err as Error)
      )
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
      // Fait de l'épreuve écrit par le moteur, PoolFencerAdded au journal ; l'écran relit l'état
      if (onAddByCommand) {
        const outcome = await onAddByCommand(selectedFencer.id);
        if (outcome === 'recorded') return onClose();
        if (outcome === 'refused') return;
      }
      const updatedPool = buildPoolWithAddedFencer(pool, selectedFencer, maxScore);
      // Synchro DB auto-réparante (crée poule/lignes manquantes) : non bloquante
      try {
        await window.electronAPI.db.syncPoolSnapshot(competitionId, toSnapshot(updatedPool));
      } catch (err) {
        logger.error(LogCategory.DATABASE, 'syncPoolSnapshot failed', err as Error);
        showToast(t('addFencerPool.sync_failed'), 'warning');
      }
      onConfirm(updatedPool);
    } catch (err) {
      showToast(
        t('addFencerPool.add_error', {
          msg: err instanceof Error ? err.message : t('addFencerPool.unknown_error'),
        }),
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
        className="modal add-fencer-to-pool-modal-1"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-fencer-title"
      >
        <div className="modal-header">
          <h2 id="add-fencer-title">{t('addFencerPool.title', { n: pool.number })}</h2>
          <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="add-fencer-to-pool-modal-2">
            <Icon icon={TriangleAlert} /> <strong>{t('addFencerPool.rescue_title')}</strong>{' '}
            {t('addFencerPool.rescue_text')}
          </div>

          <input
            type="text"
            placeholder={t('addFencerPool.search_ph')}
            aria-label={t('addFencerPool.search_aria')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            className="add-fencer-to-pool-modal-3"
          />

          <div className="add-fencer-to-pool-modal-4">
            {isFetching ? (
              <div className="add-fencer-to-pool-modal-5">{t('addFencerPool.loading')}</div>
            ) : available.length === 0 ? (
              <div className="add-fencer-to-pool-modal-5">{t('addFencerPool.none')}</div>
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
                      borderBottom: '1px solid var(--color-bg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected)
                        (e.currentTarget as HTMLDivElement).style.background =
                          'var(--color-raised-hover)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected)
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                  >
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                      {f.lastName} {f.firstName}
                    </span>
                    {f.club && <span className="add-fencer-to-pool-modal-6">{f.club}</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-footer">
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
          <Button variant="primary" onClick={handleAdd} disabled={!selectedFencer || isLoading}>
            {isLoading ? t('addFencerPool.adding') : t('addFencerPool.add')}
          </Button>
        </div>
      </div>
    </div>
  );
};

const AddFencerToPoolModal = React.memo(AddFencerToPoolModalComponent);
export default AddFencerToPoolModal;
