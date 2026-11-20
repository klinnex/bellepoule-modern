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
    // clip (et non hidden) : hidden reste défilable par le focus programmatique
    // (cellule de saisie) → la barre de phases remontait hors écran
    overflow: 'clip',
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
