/**
 * Estimation de l'heure de fin d'une phase à partir des durées réelles des
 * matchs déjà terminés (#1077).
 *
 * fin ≈ maintenant + vagues × durée médiane
 *   - sans groupes : vagues = ⌈matchs restants ÷ pistes⌉ (tour de tableau)
 *   - avec groupes (poules) : les matchs d'une poule s'enchaînent sur une seule
 *     piste → vagues = charge de la piste la plus chargée (répartition LPT)
 * La médiane résiste aux matchs anormaux (blessure, appel DT, pause).
 */

export interface PhaseEtaInput {
  /** Durées réelles (début → fin, en ms) des matchs terminés, les plus récentes en dernier. */
  durationsMs: number[];
  remainingMatches: number;
  /**
   * Matchs restants par groupe séquentiel (ex. par poule) : un groupe occupe une
   * seule piste. Absent → tous les matchs restants sont parallélisables.
   */
  sequentialGroups?: number[];
  /** Pistes pouvant jouer en parallèle (au moins 1). */
  activeArenas: number;
  now: number;
  /** Durée supposée tant qu'aucun match n'est mesuré. */
  fallbackMatchMs?: number;
  /** Nombre de durées récentes prises en compte. */
  window?: number;
  /** Temps entre deux matchs sur une piste (appel, installation). */
  changeoverMs?: number;
}

export interface PhaseEta {
  /** Horodatage (ms) de fin estimée ; égal à now si plus rien à jouer. */
  finishAt: number;
  /** Durée par match retenue (ms), changement de piste inclus. */
  perMatchMs: number;
  /** measured = au moins 3 matchs mesurés ; default = estimation par défaut. */
  basis: 'measured' | 'default';
  remainingMatches: number;
}

const MIN_SAMPLES = 3;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Nombre de vagues pour jouer des groupes séquentiels sur `arenas` pistes :
 * plus grand groupe d'abord, chacun sur la piste la moins chargée (LPT).
 */
export function sequentialWaves(groups: number[], arenas: number): number {
  const loads = new Array<number>(Math.max(1, Math.floor(arenas))).fill(0);
  const sorted = groups.filter(g => g > 0).sort((a, b) => b - a);
  for (const g of sorted) {
    let min = 0;
    for (let i = 1; i < loads.length; i++) if (loads[i] < loads[min]) min = i;
    loads[min] += g;
  }
  return Math.max(0, ...loads);
}

export function estimatePhaseEta(input: PhaseEtaInput): PhaseEta {
  const {
    durationsMs,
    remainingMatches,
    sequentialGroups,
    activeArenas,
    now,
    fallbackMatchMs = 4 * 60_000,
    window = 20,
    changeoverMs = 60_000,
  } = input;
  const samples = durationsMs.filter(d => Number.isFinite(d) && d > 0).slice(-window);
  const basis = samples.length >= MIN_SAMPLES ? 'measured' : 'default';
  const perMatchMs = (basis === 'measured' ? median(samples) : fallbackMatchMs) + changeoverMs;
  const remaining = Math.max(0, Math.floor(remainingMatches));
  const arenas = Math.max(1, Math.floor(activeArenas));
  const waves = sequentialGroups
    ? sequentialWaves(sequentialGroups, arenas)
    : Math.ceil(remaining / arenas);
  return {
    finishAt: now + waves * perMatchMs,
    perMatchMs,
    basis,
    remainingMatches: remaining,
  };
}
