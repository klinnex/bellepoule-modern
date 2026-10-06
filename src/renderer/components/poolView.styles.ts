/**
 * BellePoule Modern - Styles statiques de PoolView
 * Constantes de style définies au niveau module (références stables, pas de
 * recréation à chaque rendu) + fabriques pour les variantes dynamiques.
 * Licensed under GPL-3.0
 */

import type { CSSProperties } from 'react';

// Base commune des boutons de la barre d'outils (fond/couleur fournis à l'usage)
export const TOOLBAR_BTN: CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.75rem',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
};

// Base des boutons icône undo/redo (border-radius/cursor variables)
export const ICON_BTN: CSSProperties = {
  padding: '0.375rem 0.6rem',
  fontSize: '0.8rem',
  border: 'none',
  borderRadius: '4px',
};

// Boutons compacts icône seule (libellé affiché en info-bulle au survol via `title`)
export const ICON_ONLY_BTN: CSSProperties = {
  width: '2rem',
  height: '2rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.95rem',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  flexShrink: 0,
};

// Boutons de statut spécial (abandon/forfait/exclusion/annuler)
export const SPECIAL_BTN: CSSProperties = { fontSize: '0.8rem', padding: '0.4rem 0.75rem' };

export const ROW_BETWEEN: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export const MATCH_LABEL: CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  opacity: 0.8,
};

export const MATCH_CENTER: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flex: 1,
  justifyContent: 'center',
};

export const COL_GAP: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.5rem' };

export const REF_EMPTY: CSSProperties = {
  color: '#9ca3af',
  fontSize: '0.875rem',
  textAlign: 'center',
};

export const REF_BTN: CSSProperties = { padding: '0.75rem', fontSize: '0.875rem' };

export const FENCER_NAME: CSSProperties = { fontWeight: '600' };

// Conteneur du bloc « prochain match » (le fond varie selon l'état)
export const NEXT_MATCH_BOX: CSSProperties = {
  borderRadius: '8px',
  padding: '1rem',
  marginTop: '1rem',
  color: 'white',
};

// ── Modal de saisie rapide ────────────────────────────────────────────────
export const SCORE_ROW: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1.5rem',
  marginBottom: '1.5rem',
};

export const nameCol = (align: 'flex-start' | 'flex-end'): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: align,
  flex: 1,
  minWidth: '200px',
  maxWidth: '100%',
  overflow: 'hidden',
});

export const nameLast = (align: 'left' | 'right'): CSSProperties => ({
  fontSize: '1.5rem',
  fontWeight: 600,
  textAlign: align,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const nameFirst = (align: 'left' | 'right'): CSSProperties => ({
  fontSize: '1rem',
  color: '#6b7280',
  textAlign: align,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const victoryBtn = (active: boolean): CSSProperties => ({
  padding: '0.75rem 1rem',
  background: active ? '#22c55e' : '#e5e7eb',
  color: active ? 'white' : '#374151',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '1.1rem',
});

export const SCORE_SEP: CSSProperties = { fontSize: '3rem', fontWeight: 'bold', color: '#9ca3af' };

export const SPECIAL_ROW: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'center',
  borderTop: '1px solid #e5e7eb',
  paddingTop: '1rem',
  marginTop: '0.5rem',
};

export const FOOTER_RIGHT: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  justifyContent: 'flex-end',
};

// ── Modal de statut spécial ───────────────────────────────────────────────
export const MUTED_HINT: CSSProperties = { marginTop: 0, color: '#6b7280', fontSize: '0.875rem' };
export const STATUS_BTN: CSSProperties = { width: '100%', padding: '0.75rem', fontWeight: 600 };

// ── Journal des matchs terminés ───────────────────────────────────────────
export const LOG_TOGGLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.8rem',
  color: '#6b7280',
  fontWeight: 600,
  marginBottom: '0.25rem',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
};

export const LOG_WRAP: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' };

export const LOG_ITEM: CSSProperties = {
  padding: '0.2rem 0.5rem',
  fontSize: '0.75rem',
  background: 'rgba(139,92,246,0.08)',
  border: '1px solid rgba(139,92,246,0.25)',
  borderRadius: '4px',
  cursor: 'pointer',
  color: '#7c3aed',
};

// ── En-tête de carte + bandeau verrouillage ───────────────────────────────
export const LOCKED_BANNER: CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: '6px',
  padding: '0.5rem 1rem',
  marginBottom: '0.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  color: '#991b1b',
  fontWeight: 600,
  fontSize: '0.875rem',
};

export const HEADER_LEFT: CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.75rem' };
export const TOOLBAR_GROUP: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};
export const VIEW_GROUP: CSSProperties = { display: 'flex', gap: '0.25rem' };
export const RELATIVE: CSSProperties = { position: 'relative' };
export const VS: CSSProperties = { opacity: 0.7 };

// Pastille (badge) en-tête : base commune signatures/arbitre
export const BADGE_PILL: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.2rem 0.5rem',
  borderRadius: '12px',
  fontSize: '0.75rem',
  fontWeight: 600,
};

// ── Menu de colonnes ──────────────────────────────────────────────────────
export const COL_MENU: CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '0.25rem',
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  zIndex: 100,
  minWidth: '180px',
  padding: '0.5rem',
};

export const COL_MENU_HEADER: CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.25rem 0.5rem',
  borderBottom: '1px solid #e5e7eb',
  marginBottom: '0.25rem',
};

export const COL_MENU_LABEL: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.375rem 0.5rem',
  cursor: 'pointer',
  borderRadius: '4px',
  fontSize: '0.8rem',
};

// Bouton « Saisir » du bloc prochain match
export const NEXT_MATCH_SUBMIT: CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'rgba(255,255,255,0.2)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '6px',
  color: 'white',
  cursor: 'pointer',
  fontWeight: '500',
  fontSize: '0.875rem',
};

// Nom de tireur dans le bloc « match non disputé » (barré si abandon)
export const abandonName = (struck: boolean): CSSProperties => ({
  fontWeight: '600',
  textDecoration: struck ? 'line-through' : 'none',
});

// Input de score (bordure rouge si dépassement du score max)
export const scoreInput = (overflow: boolean): CSSProperties => ({
  width: '120px',
  textAlign: 'center',
  fontSize: '3rem',
  padding: '0.75rem',
  borderColor: overflow ? '#ef4444' : undefined,
  borderWidth: overflow ? '2px' : undefined,
});
