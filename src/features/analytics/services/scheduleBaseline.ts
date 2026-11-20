/**
 * BellePoule Modern - Heure de fin planifiée et écart final (onglet Organisation, #1817)
 * Mémorisé par poste (localStorage) : la référence vient de l'assistant de planning,
 * par phase (poules / tableau) ; l'écart final est figé à la fin de la compétition.
 * Licensed under GPL-3.0
 */

export type SchedulePhase = 'pools' | 'tableau';

export interface FinalDeviation {
  /** Écart en minutes (positif = retard) */
  deviationMin: number;
  /** Fin réelle (ms) */
  endAt: number;
  /** Heure de fin planifiée de référence (ms) */
  plannedAt: number;
}

interface Stored {
  pools?: number;
  tableau?: number;
  /** Fin de compétition prévue avant la génération du tableau (poules + tableau projeté) */
  projected?: number;
  final?: FinalDeviation;
}

const key = (competitionId: string) => `bp-org-schedule-${competitionId}`;
/** Ancienne référence : première fin estimée (avant #1817 suite) */
const legacyKey = (competitionId: string) => `bp-org-baseline-${competitionId}`;

function read(competitionId: string): Stored {
  try {
    const raw = localStorage.getItem(key(competitionId));
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Stored) : {};
  } catch {
    return {};
  }
}

function write(competitionId: string, value: Stored): void {
  try {
    localStorage.setItem(key(competitionId), JSON.stringify(value));
  } catch {
    /* stockage indisponible */
  }
}

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Heure de fin planifiée (ms) de la phase, sinon ancienne référence (1re fin estimée). */
export function getPlannedEnd(competitionId: string, phase: SchedulePhase): number | null {
  const v = read(competitionId)[phase];
  if (valid(v)) return v;
  try {
    const legacy = Number(localStorage.getItem(legacyKey(competitionId)));
    return valid(legacy) ? legacy : null;
  } catch {
    return null;
  }
}

/** Fin planifiée enregistrée par l'assistant de planning pour la phase (sans repli). */
export function hasPlannedEnd(competitionId: string, phase: SchedulePhase): boolean {
  return valid(read(competitionId)[phase]);
}

export function setPlannedEnd(competitionId: string, phase: SchedulePhase, at: number): void {
  if (!valid(at)) return;
  write(competitionId, { ...read(competitionId), [phase]: at });
}

/**
 * Fin de compétition prévue (poules + tableau projeté), figée à la génération du tableau :
 * référence de l'écart final quand l'assistant de planning du tableau n'a pas été ouvert (#1817).
 */
export function getProjectedEnd(competitionId: string): number | null {
  const v = read(competitionId).projected;
  return valid(v) ? v : null;
}

export function setProjectedEnd(competitionId: string, at: number): void {
  if (!valid(at) || read(competitionId).projected === at) return;
  write(competitionId, { ...read(competitionId), projected: at });
}

export function getFinalDeviation(competitionId: string): FinalDeviation | null {
  const f = read(competitionId).final;
  return f && valid(f.endAt) && Number.isFinite(f.deviationMin) ? f : null;
}

export function setFinalDeviation(competitionId: string, value: FinalDeviation | null): void {
  const s = read(competitionId);
  if (value) s.final = value;
  else delete s.final;
  write(competitionId, s);
}
