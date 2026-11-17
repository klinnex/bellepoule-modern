/**
 * BellePoule Modern - Validation de fin de match unifiée (#1829)
 * Module unique de règles, pur et sans dépendance, utilisé par :
 *  - l'appareil de piste (`main/piste/pisteState.ts`, END → ACK / NAK, tous protocoles) ;
 *  - la tablette arbitre (`main/remote/routes/matchRoutes.ts`, POST /api/matches/:id/finish) ;
 *  - la fin de match d'arène (`main/remote/matchFinish.ts`) et la limite de score
 *    (`main/remote/arenaOps.ts`).
 * Règlement FIE : score limite 5 en poule (t.38), 15 en élimination directe (t.40),
 * 10 chez les vétérans (t.42) — valeurs portées par les réglages de la compétition / formule
 * (`defaultPoolMaxScore`, `defaultTableMaxScore`, `getDefaultMaxScores`), jamais codées ici ;
 * sabre : pause à 8 touches en élimination directe à 15 (t.39.1).
 * Un match validé par erreur se rappelle par PREV (`main/remote/prevMatch.ts`).
 * Licensed under GPL-3.0
 */

export type MatchSide = 'A' | 'B';

/**
 * Statut d'un tireur en fin de match. `victory` / `defeat` : décision explicite de
 * l'appareil (statuts Cyrano V / D) ; `abandon` / `exclusion` : tireur hors combat
 * (statuts Cyrano A / E, carton noir de la tablette).
 */
export type FencerEndStatus = 'normal' | 'victory' | 'defeat' | 'abandon' | 'exclusion';

export interface MatchEndInput {
  /** Scores ; `undefined` = non transmis */
  scoreA?: number;
  scoreB?: number;
  statusA?: FencerEndStatus;
  statusB?: FencerEndStatus;
  /** Tireur ayant la priorité (minute supplémentaire) */
  priority?: MatchSide | null;
}

export type MatchEndRejection = 'missing_scores' | 'tie_without_priority';

export type MatchEndVerdict = { ok: true } | { ok: false; reason: MatchEndRejection };

const isOut = (s: FencerEndStatus | undefined): boolean => s === 'abandon' || s === 'exclusion';

/**
 * Fin de match valide (spécification Cyrano §4) : au moins un tireur en abandon ou exclusion,
 * ou scores différents, ou égalité avec priorité.
 */
export function validateMatchEnd(input: MatchEndInput): MatchEndVerdict {
  if (isOut(input.statusA) || isOut(input.statusB)) return { ok: true };
  if (input.scoreA === undefined || input.scoreB === undefined) {
    return { ok: false, reason: 'missing_scores' };
  }
  if (input.scoreA !== input.scoreB) return { ok: true };
  if (input.priority === 'A' || input.priority === 'B') return { ok: true };
  return { ok: false, reason: 'tie_without_priority' };
}

export type MatchWinReason = 'score' | 'abandon' | 'exclusion' | 'priority' | 'override';

export interface MatchWinner {
  winner: MatchSide | null;
  reason?: MatchWinReason;
}

export interface MatchWinnerInput extends MatchEndInput {
  /** Vainqueur désigné à égalité par la tablette (tirage au sort, P-noir au classement) */
  override?: MatchSide | null;
}

const other = (side: MatchSide): MatchSide => (side === 'A' ? 'B' : 'A');

/**
 * Vainqueur d'un match terminé, dans cet ordre :
 *  1. un seul tireur en abandon / exclusion → son adversaire (deux hors combat : aucun) ;
 *  2. meilleur score ;
 *  3. à égalité : décision de l'appareil (V / D), puis vainqueur désigné par la tablette,
 *     puis priorité.
 */
export function decideMatchWinner(input: MatchWinnerInput): MatchWinner {
  const outA = isOut(input.statusA);
  const outB = isOut(input.statusB);
  if (outA !== outB) {
    const loser: MatchSide = outA ? 'A' : 'B';
    const status = outA ? input.statusA : input.statusB;
    return { winner: other(loser), reason: status === 'abandon' ? 'abandon' : 'exclusion' };
  }
  if (outA) return { winner: null };
  const a = input.scoreA ?? 0;
  const b = input.scoreB ?? 0;
  if (a !== b) return { winner: a > b ? 'A' : 'B', reason: 'score' };
  if (input.statusA === 'victory' || input.statusB === 'defeat') {
    return { winner: 'A', reason: 'priority' };
  }
  if (input.statusB === 'victory' || input.statusA === 'defeat') {
    return { winner: 'B', reason: 'priority' };
  }
  if (input.override === 'A' || input.override === 'B') {
    return { winner: input.override, reason: 'override' };
  }
  if (input.priority === 'A' || input.priority === 'B') {
    return { winner: input.priority, reason: 'priority' };
  }
  return { winner: null };
}

/** Vainqueur au seul score (égalité : aucun) */
export function winnerByScore(scoreA: number, scoreB: number): MatchSide | null {
  return scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : null;
}

// ── Scores transmis par la tablette ──────────────────────────────────────────

/** Borne de sûreté des scores reçus des tablettes (au-delà : requête rejetée) */
export const MAX_REMOTE_SCORE = 50;

/** Score reçu d'une tablette : entier entre 0 et `MAX_REMOTE_SCORE` */
export function isAcceptableScore(value: unknown): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_REMOTE_SCORE;
}

// ── Score limite ─────────────────────────────────────────────────────────────

/** Score limite du sabre laser (format fixe) */
export const LASER_SCORE_LIMIT = 15;
/** Score limite appliqué faute de réglage */
export const FALLBACK_SCORE_LIMIT = 15;

export interface ScoreLimitInput {
  isLaser?: boolean;
  isTableau?: boolean;
  /** Réglage « score max des poules » de la compétition / formule (null = non défini) */
  poolMaxScore?: number | null;
  /** Réglage « score max du tableau » de la compétition / formule */
  tableMaxScore?: number | null;
  /** Score max porté par le match lui-même (poules), en repli du réglage de poule */
  matchMaxScore?: number | null;
}

/**
 * Score limite d'un match, issu des réglages (5 / 15 / 10 vétérans par défaut, cf.
 * `getDefaultMaxScores`). 0 ou ≥ 999 = sans limite (Infinity) ; laser : toujours 15.
 */
export function resolveScoreLimit(input: ScoreLimitInput): number {
  if (input.isLaser) return LASER_SCORE_LIMIT;
  const max = input.isTableau ? input.tableMaxScore : (input.poolMaxScore ?? input.matchMaxScore);
  if (typeof max !== 'number') return FALLBACK_SCORE_LIMIT;
  return max <= 0 || max >= 999 ? Infinity : max;
}

/** Vrai quand un tireur vient d'atteindre le score limite (franchissement, pas maintien) */
export function crossedScoreLimit(
  previous: { scoreA: number; scoreB: number },
  next: { scoreA: number; scoreB: number },
  limit: number
): boolean {
  return (
    (next.scoreA >= limit && previous.scoreA < limit) ||
    (next.scoreB >= limit && previous.scoreB < limit)
  );
}

// ── Sabre : fin de la première période (t.39.1) ──────────────────────────────

/** Touches marquant la fin de la première période au sabre (élimination directe à 15) */
export const SABRE_BREAK_TOUCHES = 8;

/**
 * Sabre, élimination directe à 15 touches : la première période s'arrête dès qu'un tireur
 * atteint 8 touches. Règle pure, non branchée : les périodes de la tablette sont au temps.
 */
export function crossedSabreBreak(
  isSabre: boolean,
  scoreLimit: number,
  previous: { scoreA: number; scoreB: number },
  next: { scoreA: number; scoreB: number }
): boolean {
  if (!isSabre || scoreLimit !== 15) return false;
  return (
    Math.max(previous.scoreA, previous.scoreB) < SABRE_BREAK_TOUCHES &&
    Math.max(next.scoreA, next.scoreB) >= SABRE_BREAK_TOUCHES
  );
}

// ── Carton P noir (passivité) ────────────────────────────────────────────────

/** Tireur tel que transmis à la tablette (classement initial ou courant) */
export interface RankedFencer {
  initialRanking?: number | string | null;
  ranking?: number | string | null;
}

export type PassivityOutcome =
  | {
      action: 'finish';
      winner: MatchSide;
      reasonKey: 'referee.reason_passivity' | 'referee.reason_passivity_seed';
    }
  | { action: 'tiebreak' };

/**
 * P-noir : vainqueur = score le plus haut ; à égalité, le mieux classé au départ ;
 * sans classement (ou classements égaux), tirage au sort.
 * Copie servie aux tablettes : `src/remote/js/refereeCards.js` (`passivityWinner`), tenue
 * identique par un test de parité.
 */
export function passivityWinner(s: {
  scoreA: number;
  scoreB: number;
  fencerA?: RankedFencer | null;
  fencerB?: RankedFencer | null;
}): PassivityOutcome {
  if (s.scoreA !== s.scoreB) {
    return {
      action: 'finish',
      winner: s.scoreA > s.scoreB ? 'A' : 'B',
      reasonKey: 'referee.reason_passivity',
    };
  }
  const rankOf = (f: RankedFencer | null | undefined): number | null => {
    const r = Number(f?.initialRanking ?? f?.ranking);
    return Number.isFinite(r) && r > 0 ? r : null;
  };
  const rA = rankOf(s.fencerA);
  const rB = rankOf(s.fencerB);
  if (rA !== null || rB !== null) {
    const winner: MatchSide = rB === null || (rA !== null && rA < rB) ? 'A' : 'B';
    if (rA !== rB) return { action: 'finish', winner, reasonKey: 'referee.reason_passivity_seed' };
  }
  return { action: 'tiebreak' };
}
