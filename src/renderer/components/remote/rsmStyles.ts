/**
 * BellePoule Modern - Styles statiques de RemoteScoreManager
 * Licensed under GPL-3.0
 */
import type React from 'react';

export const RSM_STYLES = {
  httpWarning: {
    fontSize: '0.78rem',
    color: 'var(--warning-color, #f59e0b)',
    margin: '0.25rem 0 0',
    lineHeight: 1.4,
  } satisfies React.CSSProperties,
  stripCountControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  } satisfies React.CSSProperties,
  stripCountBtn: { padding: '0.2rem 0.5rem', fontSize: '1rem' } satisfies React.CSSProperties,
  stripCountSave: { padding: '0.2rem 0.6rem' } satisfies React.CSSProperties,
  stripCountPending: {
    color: 'var(--warning-color, orange)',
    fontSize: '0.85rem',
  } satisfies React.CSSProperties,
  stripCountStrong: {
    minWidth: '1.5rem',
    textAlign: 'center' as const,
  } satisfies React.CSSProperties,
  interfaceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0',
  } satisfies React.CSSProperties,
  interfaceLabel: { whiteSpace: 'nowrap' as const } satisfies React.CSSProperties,
  portRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: '0.75rem 0',
  } satisfies React.CSSProperties,
  portInput: { width: '80px' } satisfies React.CSSProperties,
  portHint: { fontSize: '0.8rem', opacity: 0.6 } satisfies React.CSSProperties,
  portActiveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '0.25rem',
  } satisfies React.CSSProperties,
  portActiveLabel: {
    whiteSpace: 'nowrap' as const,
    fontSize: '0.875rem',
  } satisfies React.CSSProperties,
  portActiveInput: { width: '75px' } satisfies React.CSSProperties,
  portActiveBtn: { fontSize: '0.8rem', padding: '0.2rem 0.5rem' } satisfies React.CSSProperties,
  pisteresumeSummary: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'var(--color-bg)',
    borderRadius: '8px',
  } satisfies React.CSSProperties,
  pisteresumeFlex: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  } satisfies React.CSSProperties,
  qrSpinner: {
    width: 220,
    height: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } satisfies React.CSSProperties,
  qrCode: {
    fontSize: '0.75rem',
    wordBreak: 'break-all' as const,
    textAlign: 'center' as const,
  } satisfies React.CSSProperties,
  kioskCard: { marginTop: '1rem' } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
