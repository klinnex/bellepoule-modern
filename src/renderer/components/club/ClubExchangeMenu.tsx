/**
 * BellePoule Modern - Mode Club : bouton à menu regroupant les formats d'un import ou d'un
 * export (évite une multiplication de boutons dans la barre d'outils).
 * Licensed under GPL-3.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../common/Button';

export interface ClubExchangeMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
}

interface ClubExchangeMenuProps {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  items: ClubExchangeMenuItem[];
  dataTour?: string;
}

export const ClubExchangeMenu: React.FC<ClubExchangeMenuProps> = ({
  label,
  icon,
  disabled,
  items,
  dataTour,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        icon={icon}
        disabled={disabled}
        data-tour={dataTour}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {label} <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '4px',
            zIndex: 50,
            minWidth: '200px',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '0.25rem',
          }}
        >
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.4rem 0.6rem',
                background: 'none',
                border: 0,
                borderRadius: '4px',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
