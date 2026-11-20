/**
 * BellePoule Modern - Coordonnées Cyrano d'un match d'arène : Phase, PoulTab, Match (#1720)
 * - Poule : PoulTab = numéro de la poule, Match = numéro du match dans la poule.
 * - Tableau : PoulTab = `A<taille>` (A16, A8…), Match = position dans le tour + 1.
 * L'ArenaMatch ne porte pas toujours ces numéros : la base complète ce qui manque.
 * Licensed under GPL-3.0
 */

import type { ArenaMatch } from '../../shared/types/remote';
import { tableauId } from './disp';

export interface CyranoMatchCoords {
  phase: number;
  poulTab: string;
  matchNum: number;
}

/** Lecture en base (DatabaseManager) ; chaque appel peut échouer sans bloquer le DISP. */
export interface MatchCoordsSource {
  getMatch(id: string): { number?: number; round?: number; position?: number } | null | undefined;
  getCompetitionPools(competitionId: string): { id: string; name: string }[];
  /** Nombre de tours de poules de l'épreuve (`settings.poolRounds`) */
  getCompetition?(id: string): { settings?: { poolRounds?: number } } | null | undefined;
  /** État de l'épreuve : tour de poules en cours (`uiState.currentPoolRound`) */
  getSessionState?(competitionId: string): unknown;
}

/**
 * Champ Phase (spéc. Cyrano § 3) : 1er tour de poules = 1, 2e = 2… ; le tableau vaut le dernier
 * tour de poules + 1. Sans base ou sans réglage : un tour de poules (poule = 1, tableau = 2).
 */
export function resolveCyranoPhases(
  competitionId: string | null | undefined,
  db?: MatchCoordsSource
): { pool: number; tableau: number } {
  if (!db || !competitionId) return { pool: 1, tableau: 2 };
  const count = (v: unknown, min: number): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= 98 ? v : undefined;
  const rounds =
    count(safe(() => db.getCompetition?.(competitionId))?.settings?.poolRounds, 0) ?? 1;
  const state = safe(() => db.getSessionState?.(competitionId)) as
    { uiState?: { currentPoolRound?: unknown } } | null | undefined;
  const current = count(state?.uiState?.currentPoolRound, 1) ?? 1;
  return { pool: Math.max(1, Math.min(current, Math.max(rounds, 1))), tableau: rounds + 1 };
}

/** Id d'un match de tableau côté arène : `<taille>-<position>` (ex. `16-3`). */
const TABLEAU_ID = /^(\d+)-(\d+)$/;

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function resolveCyranoCoords(
  match: ArenaMatch,
  competitionId: string | null | undefined,
  db?: MatchCoordsSource
): CyranoMatchCoords {
  const own = match as ArenaMatch & { number?: number; round?: number; position?: number };

  if (match.isTableau || !match.poolId) {
    let round = own.round;
    let position = own.position;
    const m = TABLEAU_ID.exec(match.id);
    if (m) {
      round ??= Number(m[1]);
      position ??= Number(m[2]);
    }
    if ((round === undefined || position === undefined) && db && competitionId) {
      const row = safe(() => db.getMatch(`${competitionId}-${match.id}`) ?? db.getMatch(match.id));
      round ??= row?.round;
      position ??= row?.position;
    }
    return {
      phase: resolveCyranoPhases(competitionId, db).tableau,
      poulTab: round ? tableauId(round) : 'A',
      matchNum: position !== undefined ? position + 1 : 1,
    };
  }

  let poolNumber: number | undefined;
  if (db && competitionId) {
    const pools = safe(() => db.getCompetitionPools(competitionId)) ?? [];
    const pool = pools.find(p => p.id === match.poolId);
    const n = pool ? parseInt(pool.name.replace(/\D+/g, ''), 10) : NaN;
    if (Number.isFinite(n)) poolNumber = n;
  }
  const matchNum = own.number ?? (db ? safe(() => db.getMatch(match.id))?.number : undefined);
  return {
    phase: resolveCyranoPhases(competitionId, db).pool,
    poulTab: String(poolNumber ?? 1),
    matchNum: matchNum ?? 1,
  };
}
