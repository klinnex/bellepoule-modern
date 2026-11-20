/**
 * BellePoule Modern - TableauArenaModal
 * Modal d'assignation d'un match du tableau à une piste
 * Licensed under GPL-3.0
 */

import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { TableauMatch } from './tableauTypes';
import { stripNumbers } from '../../../shared/utils/stripRange';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

interface TableauArenaModalProps {
  matches: TableauMatch[];
  selectedMatchId: string;
  arenaCount: number;
  /** Première piste de l'intervalle (1 par défaut) */
  stripStart?: number;
  currentArena: number | null;
  onAssign: (arenaNum: number | null) => void;
  onClose: () => void;
}

// ─── Static style constants ───────────────────────────────────────────────────

const ARENA_STYLES = {
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
  stripStart = 1,
  currentArena,
  onAssign,
  onClose,
}) => {
  const { t } = useTranslation();
  // Portail sur body : échappe aux ancêtres transformés (animations de phase)
  return createPortal(
    <Modal title={t('tableauArena.title')} onClose={onClose} className="is-2c8110">
      <p style={ARENA_STYLES.arenaModalHint}>{t('tableauArena.hint')}</p>
      <div style={ARENA_STYLES.arenaModalGrid}>
        <Button
          aria-label={t('actions.no_selection')}
          variant={!currentArena ? 'primary' : 'secondary'}
          onClick={() => onAssign(null)}
          style={ARENA_STYLES.arenaModalNoArenaBtn}
        >
          -
        </Button>
        {stripNumbers(stripStart, arenaCount).map(arenaNum => {
          const queueCount = matches.filter(
            m => m.arena === arenaNum && m.id !== selectedMatchId && m.winner === null
          ).length;
          return (
            <Button
              key={arenaNum}
              variant={currentArena === arenaNum ? 'primary' : 'secondary'}
              className="is-0b9519"
              onClick={() => onAssign(arenaNum)}
            >
              {t('tableauSignatures.strip_n', { n: arenaNum })}
              {queueCount > 0 && <span style={ARENA_STYLES.arenaQueueHint}>(+{queueCount})</span>}
            </Button>
          );
        })}
      </div>
    </Modal>,
    document.body
  );
};

export default TableauArenaModal;
