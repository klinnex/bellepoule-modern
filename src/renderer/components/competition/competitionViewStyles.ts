/**
 * BellePoule Modern - Styles statiques de CompetitionView (extrait, #1599)
 * Licensed under GPL-3.0
 */
import type React from 'react';

export const CV_STYLES = {
  root: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column' as const,
    overflow: 'hidden',
  } satisfies React.CSSProperties,
  thirdPlaceOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } satisfies React.CSSProperties,
  thirdPlaceModal: {
    backgroundColor: 'var(--color-raised)',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
    maxWidth: '500px',
    width: '90%',
  } satisfies React.CSSProperties,
  thirdPlaceTitle: {
    margin: '0 0 1rem 0',
    color: 'var(--color-text)',
  } satisfies React.CSSProperties,
  thirdPlaceBtnRow: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end' as const,
    marginTop: '1.5rem',
  } satisfies React.CSSProperties,
  poolsExportRow: {
    textAlign: 'center' as const,
    marginBottom: '2rem',
  } satisfies React.CSSProperties,
  questWrapper: { display: 'none' } satisfies React.CSSProperties,
  phaseContent: { flex: 1, overflow: 'auto' as const } satisfies React.CSSProperties,
  roundSelector: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0 1.25rem',
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
