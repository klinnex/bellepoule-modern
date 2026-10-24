/**
 * BellePoule Modern - Styles statiques de SettingsModal
 * Constantes au niveau module (références stables) pour les styles répétés.
 * Licensed under GPL-3.0
 */

import type { CSSProperties } from 'react';

export const HINT: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-muted, #6b7280)',
  marginBottom: '0.5rem',
};

export const SECTION_DIVIDER: CSSProperties = {
  marginTop: '1rem',
  borderTop: '1px solid var(--border, #e5e7eb)',
  paddingTop: '1rem',
};

export const BOLD: CSSProperties = { fontWeight: 600 };

export const SMALL_BTN: CSSProperties = { fontSize: '0.8rem', padding: '0.25rem 0.75rem' };

export const TOGGLE_LABEL: CSSProperties = { fontSize: '0.875rem' };
