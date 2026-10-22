/**
 * BellePoule Modern - TableauArenaModal
 * Modal d'assignation d'un match du tableau à une piste
 * Licensed under GPL-3.0
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTranslation } from '../../hooks/useTranslation';
import { TableauMatch } from './tableauTypes';

interface TableauArenaModalProps {
  matches: TableauMatch[];
  selectedMatchId: string;
  arenaCount: number;
  currentArena: number | null;
  onAssign: (arenaNum: number | null) => void;
  onClose: () => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const ARENA_STYLES = {
  arenaModalBody: { padding: '1.5rem' } satisfies React.CSSProperties,
  arenaModalHint: {
    marginBottom: '1rem',
    color: 'var(--color-text-light)',
  } satisfies React.CSSProperties,
  arenaModalGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '0.5rem',
  } satisfies React.CSSProperties,
  arenaModalNoArenaBtn: { padding: '0.75rem' } satisfies React.CSSProperties,
  arenaQueueHint: {
    fontSize: '0.7rem',
    marginLeft: '0.3rem',
    color: 'var(--color-text-light)',
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;

const TableauArenaModal: React.FC<TableauArenaModalProps> = ({
  matches,
  selectedMatchId,
  arenaCount,
  currentArena,
  onAssign,
  onClose,
}) => {
  const { t } = useTranslation();
  const modalRef = useFocusTrap<HTMLDivElement>(true, onClose);
  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '400px' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tableau-arena-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="tableau-arena-title">
            {t('tableauArena.title')}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label={t('actions.close')}>
            ×
          </button>
        </div>
        <div className="modal-body" style={ARENA_STYLES.arenaModalBody}>
          <p style={ARENA_STYLES.arenaModalHint}>{t('tableauArena.hint')}</p>
          <div style={ARENA_STYLES.arenaModalGrid}>
            <button
              className={`btn ${!currentArena ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onAssign(null)}
              style={ARENA_STYLES.arenaModalNoArenaBtn}
            >
              -
            </button>
            {Array.from({ length: arenaCount }, (_, i) => i + 1).map(arenaNum => {
              const queueCount = matches.filter(
                m => m.arena === arenaNum && m.id !== selectedMatchId && m.winner === null
              ).length;
              return (
                <button
                  key={arenaNum}
                  className={`btn ${currentArena === arenaNum ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onAssign(arenaNum)}
                  style={{ padding: '0.75rem', position: 'relative' }}
                >
                  {t('tableauSignatures.strip_n', { n: arenaNum })}
                  {queueCount > 0 && (
                    <span style={ARENA_STYLES.arenaQueueHint}>(+{queueCount})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TableauArenaModal;
