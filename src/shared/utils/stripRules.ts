/**
 * BellePoule Modern - Réservation des pistes d'une journée (#1878) : règles pures.
 * Licensed under GPL-3.0
 */
import type { StripCandidate, StripRule } from '../types/eventDay';

export const DEFAULT_STRIP_RULE: StripRule = {
  competitions: null,
  pools: true,
  tableau: true,
  tableauMax: null,
};

/** Tailles de tableau proposées pour la réservation (« tableau de N et moins ») */
export const TABLEAU_LIMITS = [64, 32, 16, 8, 4, 2] as const;

/** Règle lue depuis la base ou l'IPC : valeurs invalides remplacées par le défaut. */
export function normalizeStripRule(input: unknown): StripRule {
  if (!input || typeof input !== 'object') return { ...DEFAULT_STRIP_RULE };
  const r = input as Partial<Record<keyof StripRule, unknown>>;
  const competitions = Array.isArray(r.competitions)
    ? r.competitions.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : null;
  const max = Number(r.tableauMax);
  return {
    competitions,
    pools: r.pools !== false,
    tableau: r.tableau !== false,
    tableauMax: Number.isInteger(max) && max >= 2 ? max : null,
  };
}

/** Règle par défaut : aucune restriction (rien à enregistrer). */
export function isDefaultStripRule(rule: StripRule): boolean {
  return rule.competitions === null && rule.pools && rule.tableau && rule.tableauMax === null;
}

/** Le travail proposé est-il autorisé sur la piste ? */
export function stripAllows(
  rule: StripRule,
  c: Pick<StripCandidate, 'competitionId' | 'kind' | 'tableauSize'>
): boolean {
  if (rule.competitions && !rule.competitions.includes(c.competitionId)) return false;
  if (c.kind === 'pool') return rule.pools;
  if (!rule.tableau) return false;
  if (rule.tableauMax === null) return true;
  // Taille inconnue : refusée sur une piste réservée aux derniers tours
  return c.tableauSize !== null && c.tableauSize <= rule.tableauMax;
}

/**
 * Ordre des propositions : d'abord le travail sans piste, puis les poules, puis les plus
 * petits tableaux (les plus avancés), enfin par épreuve et numéro.
 */
export function sortCandidates<T extends StripCandidate>(list: T[]): T[] {
  const rank = (c: StripCandidate) => (c.fromStrip === null ? 0 : 1);
  return [...list].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.kind === b.kind ? 0 : a.kind === 'pool' ? -1 : 1) ||
      (a.tableauSize ?? 0) - (b.tableauSize ?? 0) ||
      a.competitionTitle.localeCompare(b.competitionTitle) ||
      (a.number ?? 0) - (b.number ?? 0)
  );
}
