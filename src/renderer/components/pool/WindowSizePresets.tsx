/**
 * BellePoule Modern - Window Size Presets
 * Bouton à menu déroulant pour redimensionner les cartes des poules affichées (#1034).
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'bellepoule-pool-window-size';

// Facteur appliqué à la largeur minimale d'une carte de poule
export const PRESETS = [
  { label: 'Compact', scale: 0.8 },
  { label: 'Normal', scale: 1 },
  { label: 'Large', scale: 1.3 },
  { label: 'XL', scale: 1.6 },
] as const;

type Preset = (typeof PRESETS)[number];
export type PresetLabel = Preset['label'];

export function presetScale(label: PresetLabel): number {
  return PRESETS.find(p => p.label === label)?.scale ?? 1;
}

export function readSavedPoolCardSize(): PresetLabel {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const found = PRESETS.find(p => p.label === saved);
    if (found) return found.label;
  } catch {
    /* stockage indisponible */
  }
  return 'Normal';
}

interface WindowSizePresetsProps {
  value: PresetLabel;
  onChange: (label: PresetLabel) => void;
}

const WindowSizePresets: React.FC<WindowSizePresetsProps> = ({ value: active, onChange }) => {
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
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open, updatePos]);

  const apply = (preset: Preset) => {
    onChange(preset.label);
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, preset.label);
    } catch {
      /* stockage indisponible */
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        className="btn btn-secondary"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Taille des cartes de poule"
      >
        🗔 Cartes : {active} ▾
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
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
              minWidth: '200px',
              padding: '0.25rem',
            }}
          >
            {PRESETS.map(preset => {
              const isActive = preset.label === active;
              return (
                <button
                  key={preset.label}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => apply(preset)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    width: '100%',
                    padding: '0.4rem 0.6rem',
                    border: 'none',
                    borderRadius: '4px',
                    background: isActive ? 'var(--color-primary)' : 'transparent',
                    color: isActive ? '#fff' : 'inherit',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 600 : 400,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = 'var(--color-surface-2)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span>{preset.label}</span>
                  <span style={{ opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(preset.scale * 100)} %
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};

export default WindowSizePresets;
