/**
 * Durées de match de référence par arme, sexe, catégorie et phase, ajustées en
 * direct avec les matchs réellement joués (#1965). Source unique pour toute
 * estimation de durée de match (simulation de formule, fin de phase, indicateurs).
 *
 * Référence : réglage du DT > historique du poste (≥ 30 matchs) > valeurs par défaut.
 * Ajustement : la référence pèse comme k matchs fictifs face à la médiane des
 * n derniers matchs mesurés ; matchs aberrants exclus (< 30 s ou > 3 × référence).
 */

export type DurationPhase = 'pool' | 'tableau' | 'team_relay';

export interface DurationKey {
  /** Code arme : E, F, S, L, C */
  weapon: string;
  gender?: string;
  category?: string;
  phase: DurationPhase;
  maxScore: number;
}

/** Valeur connue pour une clé (réglage du DT ou agrégat d'historique). */
export interface DurationRecord {
  key: DurationKey;
  medianMs: number;
  p80Ms?: number;
  /** Nombre de matchs mesurés (historique) */
  samples?: number;
}

export interface DurationSources {
  settings?: DurationRecord[];
  history?: DurationRecord[];
  /** Changement de piste (ms), défaut 1 min */
  changeoverMs?: number;
  /** Chrono du match (s) : sert aux armes sans valeur par défaut (L, C) */
  timerSeconds?: number;
}

export interface DurationEstimate {
  medianMs: number;
  p80Ms: number;
  changeoverMs: number;
  basis: 'default' | 'history' | 'setting' | 'live';
  samples: number;
}

const MIN = 60_000;
export const DEFAULT_CHANGEOVER_MS = MIN;
/** Matchs d'historique requis pour qu'une clé l'emporte sur la valeur par défaut */
export const MIN_HISTORY_SAMPLES = 30;
const P80_FACTOR = 1.25;
const MIN_VALID_MS = 30_000;
const OUTLIER_FACTOR = 3;

/** Valeurs de départ (à calibrer) : poule en 5 touches, tableau en 15 touches. */
const DEFAULTS: Record<string, { pool: number; tableau: number }> = {
  E: { pool: 3.5 * MIN, tableau: 12 * MIN },
  F: { pool: 3.5 * MIN, tableau: 11 * MIN },
  S: { pool: 2.5 * MIN, tableau: 8 * MIN },
};

/** Arme sans valeur par défaut (L, C) : depuis le score max, plafonné par le chrono. */
function timerScoreMs(maxScore: number, timerSeconds?: number): number {
  const byScore = maxScore <= 5 ? 4 * MIN : maxScore <= 10 ? 8 * MIN : 12 * MIN;
  return timerSeconds && timerSeconds > 0 ? Math.min(timerSeconds * 1000, byScore) : byScore;
}

function defaultMedianMs(key: DurationKey, timerSeconds?: number): number {
  const d = DEFAULTS[key.weapon];
  const score = key.maxScore > 0 ? key.maxScore : key.phase === 'pool' ? 5 : 15;
  if (!d) return timerScoreMs(score, timerSeconds);
  // Durée proportionnelle au score (poule en 10 touches, relais en 45)
  if (key.phase === 'pool') return (d.pool * score) / 5;
  return (d.tableau * score) / 15;
}

/** Clés de la plus précise à la plus large : sans catégorie, puis sans sexe. */
export function widenKey(key: DurationKey): DurationKey[] {
  const keys: DurationKey[] = [key];
  if (key.category != null) keys.push({ ...key, category: undefined });
  if (key.gender != null) keys.push({ ...key, category: undefined, gender: undefined });
  return keys;
}

function sameKey(a: DurationKey, b: DurationKey): boolean {
  return (
    a.weapon === b.weapon &&
    a.phase === b.phase &&
    a.maxScore === b.maxScore &&
    (a.gender ?? null) === (b.gender ?? null) &&
    (a.category ?? null) === (b.category ?? null)
  );
}

function find(records: DurationRecord[] | undefined, key: DurationKey, minSamples = 0) {
  return records?.find(
    r => sameKey(r.key, key) && r.medianMs > 0 && (r.samples ?? 0) >= minSamples
  );
}

export function referenceDuration(
  key: DurationKey,
  sources: DurationSources = {}
): DurationEstimate {
  const changeoverMs = sources.changeoverMs ?? DEFAULT_CHANGEOVER_MS;
  for (const k of widenKey(key)) {
    const setting = find(sources.settings, k);
    if (setting) return estimateFrom(setting, 'setting', changeoverMs);
    const hist = find(sources.history, k, MIN_HISTORY_SAMPLES);
    if (hist) return estimateFrom(hist, 'history', changeoverMs);
  }
  const medianMs = defaultMedianMs(key, sources.timerSeconds);
  return {
    medianMs,
    p80Ms: medianMs * P80_FACTOR,
    changeoverMs,
    basis: 'default',
    samples: 0,
  };
}

function estimateFrom(
  r: DurationRecord,
  basis: 'setting' | 'history',
  changeoverMs: number
): DurationEstimate {
  return {
    medianMs: r.medianMs,
    p80Ms: Math.max(r.medianMs, r.p80Ms ?? r.medianMs * P80_FACTOR),
    changeoverMs,
    basis,
    samples: r.samples ?? 0,
  };
}

function median(values: number[]): number {
  return percentile(values, 50);
}

/** Centile (0–100) par interpolation linéaire. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Durées valides : ni trop courtes (saisie), ni aberrantes (blessure, appel DT, panne). */
export function filterOutliers(measuredMs: number[], ref: DurationEstimate): number[] {
  const max = OUTLIER_FACTOR * ref.medianMs;
  return measuredMs.filter(d => Number.isFinite(d) && d >= MIN_VALID_MS && d <= max);
}

export function adjustedDuration(
  ref: DurationEstimate,
  measuredMs: number[],
  opts: { k?: number; window?: number } = {}
): DurationEstimate {
  const k = Math.max(0, opts.k ?? 5);
  const window = Math.max(1, opts.window ?? 20);
  const samples = filterOutliers(measuredMs, ref).slice(-window);
  const n = samples.length;
  if (n === 0) return ref;
  const blend = (refMs: number, liveMs: number) => (k * refMs + n * liveMs) / (k + n);
  const medianMs = blend(ref.medianMs, median(samples));
  return {
    medianMs,
    p80Ms: Math.max(medianMs, blend(ref.p80Ms, percentile(samples, 80))),
    changeoverMs: ref.changeoverMs,
    basis: 'live',
    samples: n,
  };
}

/** Agrégats par clé à la clôture d'une compétition : aucune donnée personnelle. */
export function aggregateDurations(
  matches: Array<{ key: DurationKey; durationMs: number }>
): DurationRecord[] {
  const groups: Array<{ key: DurationKey; values: number[] }> = [];
  for (const m of matches) {
    if (!Number.isFinite(m.durationMs) || m.durationMs < MIN_VALID_MS) continue;
    const g = groups.find(x => sameKey(x.key, m.key));
    if (g) g.values.push(m.durationMs);
    else groups.push({ key: { ...m.key }, values: [m.durationMs] });
  }
  return groups.map(g => ({
    key: g.key,
    medianMs: median(g.values),
    p80Ms: percentile(g.values, 80),
    samples: g.values.length,
  }));
}

/** Code arme (E, F, S, L, C) depuis un code ou un libellé libre. */
export function weaponCode(weapon: string | undefined | null): string {
  const w = String(weapon ?? '')
    .trim()
    .toUpperCase();
  if (w.startsWith('E') || w.startsWith('É')) return 'E';
  if (w.startsWith('F')) return 'F';
  if (w.startsWith('S')) return w.includes('LASER') ? 'L' : 'S';
  if (w.startsWith('L')) return 'L';
  return 'C';
}
