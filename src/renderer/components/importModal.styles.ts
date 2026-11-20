/**
 * BellePoule Modern - Styles statiques de ImportModal
 * Constantes au niveau module (références stables) pour les styles répétés.
 * Licensed under GPL-3.0
 */

import type { CSSProperties } from 'react';

export const TD: CSSProperties = { padding: '0.5rem' };
export const TD_CENTER: CSSProperties = { padding: '0.5rem', textAlign: 'center' };
export const TD_LEFT: CSSProperties = { padding: '0.5rem', textAlign: 'left' };

export const LIST_INDENT: CSSProperties = { margin: '0.5rem 0 0 1rem', padding: 0 };

export const TABLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.875rem',
};

export const STICKY_HEAD: CSSProperties = {
  position: 'sticky',
  top: 0,
  background: 'var(--color-bg)',
};

export const TH_CHECK: CSSProperties = { padding: '0.5rem', textAlign: 'center', width: '40px' };

/** Onglets tireurs / arbitres (XML avec <Arbitres>, #1504) */
export const TAB_LIST: CSSProperties = { display: 'flex', gap: '0.25rem' };

export const tabStyle = (active: boolean): CSSProperties => ({
  padding: '0.25rem 0.75rem',
  fontSize: '0.875rem',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  cursor: 'pointer',
  background: active ? 'var(--color-primary)' : 'transparent',
  color: active ? '#FFFFFF' : 'var(--color-text)',
});

/** Ligne de la liste d'import (sélectionnée ou non) */
export const rowStyle = (selected: boolean, clickable: boolean): CSSProperties => ({
  cursor: clickable ? 'pointer' : 'default',
  background: selected ? 'var(--color-primary)' : 'transparent',
  color: selected ? '#FFFFFF' : 'var(--color-text)',
  borderBottom: '1px solid var(--color-border)',
});
