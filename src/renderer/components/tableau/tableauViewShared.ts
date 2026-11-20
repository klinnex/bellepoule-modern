/**
 * BellePoule Modern - Types et styles de TableauView (extrait, #1599)
 * Licensed under GPL-3.0
 */
import React from 'react';
import { Fencer, PoolRanking, Weapon } from '../../../shared/types';
import { TableauMatch, FinalResult, ConsolationBracket } from './tableauTypes';

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  fencerA: Fencer | null;
  fencerB: Fencer | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerId?: string;
  isBye?: boolean;
}

export interface TableauViewProps {
  ranking: PoolRanking[];
  matches: TableauMatch[];
  onMatchesChange: (matches: TableauMatch[]) => void;
  maxScore?: number;
  onComplete?: (results: FinalResult[]) => void;
  /** Exclusion avec carton noir confirmé par le DT (#1418) : le tireur perd son classement */
  onBlackCard?: (fencerId: string) => void;
  thirdPlaceMatch?: boolean;
  playAllPositions?: boolean;
  arenaCount?: number;
  /** Première piste de l'intervalle (1 par défaut) */
  stripStart?: number;
  onMatchArenaChange?: (
    matchId: string,
    oldArena: number | null,
    newArena: number | null,
    fencerA?: any,
    fencerB?: any
  ) => void;
  onMatchRefereeChange?: (matchId: string, refereeId: string | null) => void;
  competitionId?: string;
  /** Arme : zones de touches simulées (Sabre Laser) au remplissage automatique */
  weapon?: Weapon;
  consolationBrackets?: ConsolationBracket[];
  onConsolationBracketsChange?: (brackets: ConsolationBracket[]) => void;
  readOnly?: boolean;
  /** Nombre max d'arbitres par match (mode expert) ; 1 = sélection unique */
  maxRefereesPerMatch?: number;
  /** Arbitres utilisés par le remplissage automatique (gestion des arbitres active) */
  autoFillReferees?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    club?: string;
    status?: string;
  }>;
  /** Sabre Laser : une égalité est tranchée par V (manuel) ou tirage au sort */
  /** Égalité tranchée par V (laser, olympique, rapières) */
  tieBreakByVictory?: boolean;
}

export const TV_STYLES = {
  root: { padding: '1rem' } satisfies React.CSSProperties,
  scrollArea: {
    padding: '1rem',
    background: 'var(--tableau-bg, var(--color-surface-2))',
    borderRadius: '8px',
    maxHeight: '70vh',
    overflowY: 'auto' as const,
  } satisfies React.CSSProperties,
  pendingOrderRow: {
    marginBottom: '0.75rem',
    display: 'flex',
    justifyContent: 'flex-end' as const,
  } satisfies React.CSSProperties,
  pendingOrderBtn: {
    background: 'var(--color-border)',
    border: 'none',
    padding: '0.375rem 0.75rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--color-text)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
  } satisfies React.CSSProperties,
  summaryBox: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'var(--color-bg)',
    borderRadius: '8px',
  } satisfies React.CSSProperties,
  summaryTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
  } satisfies React.CSSProperties,
  summaryFlex: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  } satisfies React.CSSProperties,
  summaryItemBase: {
    padding: '0.5rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    border: '1px solid var(--color-border)',
  } satisfies React.CSSProperties,
  pendingEmpty: {
    padding: '2rem',
    textAlign: 'center' as const,
    color: 'var(--color-text-light)',
  } satisfies React.CSSProperties,
  roundCol: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'flex-start',
    minWidth: '200px',
  } satisfies React.CSSProperties,
  roundHeader: {
    textAlign: 'center' as const,
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: 'var(--tableau-title, var(--color-text))',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    userSelect: 'none' as const,
    width: '100%',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
  } satisfies React.CSSProperties,
  roundHeaderChevron: {
    fontSize: '1rem',
    fontWeight: 'bold',
    marginRight: '0.25rem',
  } satisfies React.CSSProperties,
  fullRoundsRow: {
    display: 'flex',
    gap: '1rem',
    overflowX: 'auto' as const,
  } satisfies React.CSSProperties,
  barragesBox: {
    marginBottom: '1rem',
    padding: '0.75rem',
    background: '#eff6ff',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
  } satisfies React.CSSProperties,
  barragesTitle: {
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: '#1e40af',
  } satisfies React.CSSProperties,
  barragesFlex: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
