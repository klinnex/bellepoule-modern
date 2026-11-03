/**
 * BellePoule Modern - Choix des sections et de leur ordre pour le dossier PDF (#1325)
 * Licensed under GPL-3.0
 */

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import Modal from './common/Modal';
import { BOOK_SECTION_KINDS, type BookSectionKind } from '../../shared/utils/pdfExport/bookToc';

interface BookSectionsModalProps {
  onClose: () => void;
  /** Types inclus, dans l'ordre choisi */
  onConfirm: (order: BookSectionKind[]) => void;
}

/** Déplace l'élément `index` de `delta` rangs (borné) */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

const BookSectionsModal: React.FC<BookSectionsModalProps> = ({ onClose, onConfirm }) => {
  const { t } = useTranslation();
  const [order, setOrder] = React.useState<BookSectionKind[]>([...BOOK_SECTION_KINDS]);
  const [included, setIncluded] = React.useState<Set<BookSectionKind>>(new Set(BOOK_SECTION_KINDS));

  const toggle = (kind: BookSectionKind) =>
    setIncluded(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <Modal
      title={t('results.book_sections_title')}
      onClose={onClose}
      size="sm"
      elevated
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={included.size === 0}
            onClick={() => onConfirm(order.filter(k => included.has(k)))}
          >
            {t('results.book_generate')}
          </button>
        </>
      }
    >
      <p className="book-sections-hint">{t('results.book_sections_hint')}</p>
      <ul className="book-sections-list">
        {order.map((kind, i) => (
          <li key={kind}>
            <label className="book-sections-label">
              <input type="checkbox" checked={included.has(kind)} onChange={() => toggle(kind)} />
              {t(`results.book_kind_${kind}`)}
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={t('results.book_move_up')}
              disabled={i === 0}
              onClick={() => setOrder(o => moveItem(o, i, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label={t('results.book_move_down')}
              disabled={i === order.length - 1}
              onClick={() => setOrder(o => moveItem(o, i, 1))}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
};

export default BookSectionsModal;
