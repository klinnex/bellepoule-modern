/**
 * BellePoule Modern - Window Size Presets
 * Bouton à menu déroulant pour redimensionner la fenêtre principale (affichage des poules).
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

const STORAGE_KEY = 'bellepoule-pool-window-size';

const PRESETS = [
  { label: 'Compact', width: 1024, height: 768 },
  { label: 'Normal', width: 1400, height: 900 },
  { label: 'Large', width: 1800, height: 1050 },
  { label: 'XL', width: 2200, height: 1200 },
] as const;

type Preset = (typeof PRESETS)[number];
type PresetLabel = Preset['label'];

function readSaved(): PresetLabel {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const found = PRESETS.find(p => p.label === saved);
    if (found) return found.label;
  } catch {
    /* stockage indisponible */
  }
  return 'Normal';
}

const WindowSizePresets: React.FC = () => {
  const [active, setActive] = useState<PresetLabel>(readSaved);
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
    setActive(preset.label);
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, preset.label);
    } catch {
      /* stockage indisponible */
    }
    // force : sort du maximisé / plein écran, sinon le redimensionnement est ignoré (#1034)
    window.electronAPI?.setWindowSize(preset.width, preset.height, { force: true });
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        className="btn btn-secondary"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Taille de la fenêtre"
      >
        🖥️ Fenêtre : {active} ▾
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
                    {preset.width}×{preset.height}
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
