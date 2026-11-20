/**
 * BellePoule Modern - Vue typée de l'état de session (session_state) lu par le serveur distant (#1775)
 * L'état est un JSON écrit par le renderer : tous les champs sont optionnels, les routes
 * ne lisent que ce qui est décrit ici.
 * Licensed under GPL-3.0
 */
import type { SessionScore } from './types';

export interface FencerView {
  id?: string;
  lastName?: string;
  firstName?: string;
  club?: string;
  status?: string;
}

export interface RankingRowView {
  fencer?: FencerView;
  rank?: number;
  matchesPlayed?: number;
  victories?: number;
  touchesScored?: number;
  touchesReceived?: number;
  index?: number;
}

export interface PoolMatchView {
  id: string;
  number?: number;
  status?: string;
  fencerA?: FencerView | null;
  fencerB?: FencerView | null;
}

export interface PoolView {
  id: string;
  number: number;
  ranking?: RankingRowView[];
  fencers?: FencerView[];
  matches?: PoolMatchView[];
}

export interface TableauMatchView {
  id: string;
  round: number;
  position: number;
  status?: string;
  fencerA?: FencerView | null;
  fencerB?: FencerView | null;
  winner?: FencerView | null;
  isBye?: boolean;
  scoreA?: SessionScore;
  scoreB?: SessionScore;
}

export interface SessionStateView {
  pools?: PoolView[];
  overallRanking?: RankingRowView[];
  tableauMatches?: TableauMatchView[];
  finalResults?: RankingRowView[];
}

/** Valeur numérique d'un score (objet Score ou nombre), null si absent */
export function scoreValue(
  s: number | { value?: number | null } | null | undefined
): number | null {
  if (s == null) return null;
  return typeof s === 'number' ? s : (s.value ?? null);
}
