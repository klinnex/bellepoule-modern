/**
 * BellePoule Modern - Plan des pistes partagé avec le serveur distant (#1501)
 * Intervalle de pistes (piste de départ) et pistes indisponibles, transmis par le renderer.
 * Les arènes hors intervalle sont masquées des écrans (kiosque, tableau de bord).
 * Licensed under GPL-3.0
 */
import type { Arena } from '../../shared/types/remote';

export interface StripPlan {
  /** Première piste exposée (les arènes inférieures sont masquées). */
  start: number;
  /** Pistes marquées indisponibles (plan des pistes). */
  unavailable: number[];
}

export const DEFAULT_STRIP_PLAN: StripPlan = { start: 1, unavailable: [] };

/** Valide une entrée IPC : entiers positifs, sans doublon, triés. */
export function normalizeStripPlan(input: unknown): StripPlan {
  const raw = (input ?? {}) as Partial<StripPlan>;
  const start =
    Number.isInteger(raw.start) && (raw.start as number) > 0 ? (raw.start as number) : 1;
  const list = Array.isArray(raw.unavailable) ? raw.unavailable : [];
  const unavailable = [...new Set(list.filter(n => Number.isInteger(n) && n > 0))].sort(
    (a, b) => a - b
  );
  return { start, unavailable };
}

/**
 * Première piste libre de l'épreuve pour une poule sans piste : dans son intervalle (≥ piste de
 * départ, ≤ `max`), hors pistes indisponibles et déjà prises. null : la poule attend une piste
 * (jamais placée sur une piste masquée, qui peut être celle d'une autre épreuve de la journée).
 */
export function nextFreeStrip(
  plan: StripPlan,
  used: ReadonlySet<number>,
  max: number
): number | null {
  for (let n = plan.start; n <= max; n++) {
    if (!used.has(n) && !plan.unavailable.includes(n)) return n;
  }
  return null;
}

/** Arènes visibles : celles dont le numéro est dans l'intervalle (≥ piste de départ). */
export function visibleArenas<T extends Pick<Arena, 'number'>>(arenas: T[], plan: StripPlan): T[] {
  return arenas.filter(a => a.number >= plan.start);
}
