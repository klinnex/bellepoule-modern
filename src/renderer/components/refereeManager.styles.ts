/**
 * BellePoule Modern - Styles statiques de RefereeManager
 * Constantes au niveau module (références stables) pour les styles répétés.
 * Licensed under GPL-3.0
 */

import type { CSSProperties } from 'react';

export const TD: CSSProperties = { padding: '0.45rem 0.75rem' };
export const TD_BOLD: CSSProperties = { padding: '0.45rem 0.75rem', fontWeight: '500' };

export const INPUT: CSSProperties = {
  padding: '0.5rem',
  borderRadius: '4px',
  border: '1px solid var(--color-border-dark)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
};

export const SMALL_INPUT: CSSProperties = {
  width: '60px',
  marginLeft: '0.5rem',
  padding: '0.25rem',
};

export const TABLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

export const TH: CSSProperties = {
  padding: '0.5rem 0.75rem',
  textAlign: 'left',
  borderBottom: '2px solid var(--color-border)',
};

export const HEADING: CSSProperties = { marginBottom: '1rem', color: 'var(--color-text)' };
export const SUB_TEXT: CSSProperties = { fontSize: '0.875rem', color: 'var(--color-text-light)' };
export const MUTED_ITALIC: CSSProperties = {
  color: 'var(--color-text-light)',
  fontStyle: 'italic',
};
export const FLEX_GAP: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem' };
export const ROW_BORDER: CSSProperties = { borderBottom: '1px solid var(--color-border)' };
export const ROW_ALT: CSSProperties = { background: 'var(--color-surface-2)' };
