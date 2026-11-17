/**
 * BellePoule Modern - Global Pool Columns Menu
 * Bouton global pour choisir les colonnes affichées dans toutes les poules.
 * Applique le choix à l'ensemble des poules et efface les réglages propres à chaque poule.
 * Licensed under GPL-3.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Funnel } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { useColumnVisibility, POOL_COLUMNS, ColumnId } from '../../hooks/useColumnVisibility';
import { Button } from '../common/Button';

interface GlobalPoolColumnsMenuProps {
  isLaserSabre: boolean;
  /** Tournoi des rapières : colonne « Cat. » proposée (#1864) */
  hasCategory?: boolean;
}

const GlobalPoolColumnsMenu: React.FC<GlobalPoolColumnsMenuProps> = ({
  isLaserSabre,
  hasCategory = false,
}) => {
  const { t } = useTranslation();
  const { visibility, setAllPoolColumns } = useColumnVisibility();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Positionne le menu sous le bouton (coordonnées viewport pour position: fixed)
  const updatePos = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(t) &&
        menuRef.current &&
        !menuRef.current.contains(t)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  const columns = POOL_COLUMNS.filter(
    col => (col.id !== 'quest' || isLaserSabre) && (col.id !== 'category' || hasCategory)
  );
  // Colonne masquée → bordure orange (#1032)
  const filterEdited = columns.some(col => !visibility.pool.includes(col.id));

  const toggle = (id: ColumnId) => {
    const current = visibility.pool;
    const next = current.includes(id) ? current.filter(c => c !== id) : [...current, id];
    setAllPoolColumns(next);
  };

  return (
    <div ref={ref} className="global-pool-columns-menu-1">
      <Button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          ...(filterEdited ? { border: '2px solid #f97316' } : {}),
        }}
      >
        <Funnel size={15} /> {t('poolColumns.button')}
      </Button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 9999,
              minWidth: '240px',
              maxHeight: '60vh',
              overflowY: 'auto',
              padding: '0.5rem',
            }}
          >
            <div className="global-pool-columns-menu-2">{t('poolColumns.header')}</div>
            {columns.map(col => (
              <label
                key={col.id}
                className="global-pool-columns-menu-3"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <input
                  type="checkbox"
                  checked={visibility.pool.includes(col.id)}
                  onChange={() => toggle(col.id)}
                  className="cursor-pointer"
                />
                {t(`poolColumns.col_${col.id}`)}
              </label>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};

export default GlobalPoolColumnsMenu;
