/**
 * BellePoule Modern - Affectation optimale des arbitres (#1959)
 *
 * Problème d'appariement entre les « créneaux » d'un même tour (poules, ou matchs
 * d'un tour de tableau) et les arbitres disponibles :
 * 1. graphe des compatibilités (règles strictes : disponibilité, plafond, neutralité) ;
 * 2. couplage de cardinal maximal et, parmi eux, de coût total minimal
 *    (algorithme hongrois, coût prohibitif pour les paires interdites) ;
 * 3. diagnostic des manques par la condition de Hall : groupe de créneaux qui a
 *    moins d'arbitres compatibles que de créneaux.
 *
 * Module pur : aucune dépendance au renderer ni à la base.
 * Licensed under GPL-3.0
 */

export type NeutralityCriterion = 'club' | 'nationality' | 'region';

export interface NeutralityRules {
  club: boolean;
  nationality: boolean;
  /** Ligue / région */
  region: boolean;
}

export const DEFAULT_NEUTRALITY: NeutralityRules = {
  club: true,
  nationality: false,
  region: false,
};

/** Créneau à arbitrer : une poule, ou un match de tableau */
export interface MatchingSlot {
  id: string;
  /** Clubs, nations et ligues des tireurs du créneau */
  clubs: readonly (string | undefined | null)[];
  nationalities?: readonly (string | undefined | null)[];
  regions?: readonly (string | undefined | null)[];
  /** Force du créneau, 0 (faible) à 1 (relevé) */
  strength?: number;
  /** Piste du créneau (stabilité) */
  strip?: number | null;
  /** Arbitre verrouillé à la main : conservé tel quel */
  lockedRefereeId?: string | null;
}

export interface MatchingReferee {
  id: string;
  club?: string | null;
  nationality?: string | null;
  region?: string | null;
  /** Niveau d'arbitrage, 0 (débutant) à 1 (international) */
  level?: number;
  /** false : non pointé, indisponible, ou occupé dans une autre épreuve */
  available?: boolean;
  /** Matchs déjà arbitrés dans la journée */
  matchesToday?: number;
  maxMatchesPerDay?: number | null;
  /** Piste tenue au tour précédent */
  previousStrip?: number | null;
  /** Affecté trop récemment (repos insuffisant) */
  needsRest?: boolean;
}

export interface MatchingWeights {
  /** Écart niveau d'arbitre ↔ force du créneau */
  level: number;
  /** Par match déjà arbitré dans la journée */
  load: number;
  /** Changement de piste par rapport au tour précédent */
  stability: number;
  /** Repos insuffisant */
  rest: number;
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  level: 10,
  load: 2,
  stability: 1,
  rest: 15,
};

export interface MatchingOptions {
  neutrality?: Partial<NeutralityRules>;
  weights?: Partial<MatchingWeights>;
}

export interface NeutralityConflict {
  refereeId: string;
  slotId: string;
  reasons: NeutralityCriterion[];
}

/** Groupe de créneaux en manque d'arbitres (condition de Hall violée) */
export interface RefereeShortage {
  slotIds: string[];
  /** Arbitres compatibles avec au moins un créneau du groupe */
  compatibleRefereeIds: string[];
  /** Nombre d'arbitres manquants */
  missing: number;
  /** Arbitres libres écartés seulement pour neutralité */
  conflicts: NeutralityConflict[];
}

export interface MatchingResult {
  /** id de créneau → id d'arbitre */
  assignments: Map<string, string>;
  unassignedSlotIds: string[];
  shortages: RefereeShortage[];
  totalCost: number;
}

const norm = (s: string | null | undefined): string => (s ?? '').trim().toUpperCase();

const collect = (values: readonly (string | undefined | null)[] | undefined): Set<string> => {
  const out = new Set<string>();
  for (const v of values ?? []) {
    const n = norm(v);
    if (n) out.add(n);
  }
  return out;
};

/** Critères de neutralité violés par l'arbitre sur ce créneau */
export function neutralityConflicts(
  referee: MatchingReferee,
  slot: MatchingSlot,
  rules: NeutralityRules
): NeutralityCriterion[] {
  const reasons: NeutralityCriterion[] = [];
  const club = norm(referee.club);
  if (rules.club && club && collect(slot.clubs).has(club)) reasons.push('club');
  const nat = norm(referee.nationality);
  if (rules.nationality && nat && collect(slot.nationalities).has(nat)) reasons.push('nationality');
  const region = norm(referee.region);
  if (rules.region && region && collect(slot.regions).has(region)) reasons.push('region');
  return reasons;
}

/** Arbitre utilisable sur ce tour, hors neutralité */
function isFree(referee: MatchingReferee): boolean {
  if (referee.available === false) return false;
  const max = referee.maxMatchesPerDay;
  if (max && max > 0 && (referee.matchesToday ?? 0) >= max) return false;
  return true;
}

function edgeCost(referee: MatchingReferee, slot: MatchingSlot, w: MatchingWeights): number {
  const level = clamp01(referee.level ?? 0);
  const strength = clamp01(slot.strength ?? 0);
  let cost = Math.abs(level - strength) * w.level;
  cost += Math.max(0, referee.matchesToday ?? 0) * w.load;
  if (slot.strip != null && referee.previousStrip != null && referee.previousStrip !== slot.strip) {
    cost += w.stability;
  }
  if (referee.needsRest) cost += w.rest;
  return cost;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

/**
 * Algorithme hongrois (affectation de coût minimal, matrice carrée n×n).
 * Retourne, pour chaque ligne, la colonne affectée.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0); // p[col] = ligne
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const rowToCol = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/**
 * Affecte un arbitre à chaque créneau : couverture maximale, puis coût minimal.
 * Les créneaux verrouillés gardent leur arbitre ; ce dernier sort du jeu.
 */
export function solveRefereeMatching(
  slots: readonly MatchingSlot[],
  referees: readonly MatchingReferee[],
  options: MatchingOptions = {}
): MatchingResult {
  const rules: NeutralityRules = { ...DEFAULT_NEUTRALITY, ...options.neutrality };
  const weights: MatchingWeights = { ...DEFAULT_MATCHING_WEIGHTS, ...options.weights };
  const assignments = new Map<string, string>();

  // Verrous manuels
  const refById = new Map(referees.map(r => [r.id, r]));
  const lockedRefs = new Set<string>();
  const openSlots: MatchingSlot[] = [];
  for (const slot of slots) {
    const locked = slot.lockedRefereeId;
    if (locked && refById.has(locked) && !lockedRefs.has(locked)) {
      assignments.set(slot.id, locked);
      lockedRefs.add(locked);
    } else {
      openSlots.push(slot);
    }
  }
  const pool = referees.filter(r => !lockedRefs.has(r.id) && isFree(r));

  // Graphe des compatibilités
  const nS = openSlots.length;
  const nR = pool.length;
  const adj: number[][] = openSlots.map(() => []);
  const edge: (number | null)[][] = openSlots.map(() => new Array<number | null>(nR).fill(null));
  let maxEdge = 0;
  openSlots.forEach((slot, s) => {
    pool.forEach((ref, r) => {
      if (neutralityConflicts(ref, slot, rules).length > 0) return;
      const c = edgeCost(ref, slot, weights);
      edge[s][r] = c;
      adj[s].push(r);
      if (c > maxEdge) maxEdge = c;
    });
  });

  // Coût prohibitif > somme de tous les coûts réels : maximise d'abord la couverture
  const BIG = (maxEdge + 1) * (Math.min(nS, nR) + 1);
  const N = Math.max(nS, nR);
  const matrix: number[][] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      const c = i < nS && j < nR ? edge[i][j] : null;
      row.push(c ?? BIG);
    }
    matrix.push(row);
  }
  const rowToCol = hungarian(matrix);

  const slotToRef = new Array<number>(nS).fill(-1);
  const refToSlot = new Array<number>(nR).fill(-1);
  let totalCost = 0;
  for (let s = 0; s < nS; s++) {
    const r = rowToCol[s];
    if (r >= 0 && r < nR && edge[s][r] !== null) {
      slotToRef[s] = r;
      refToSlot[r] = s;
      totalCost += edge[s][r] as number;
      assignments.set(openSlots[s].id, pool[r].id);
    }
  }

  const unassignedIdx = openSlots.map((_, s) => s).filter(s => slotToRef[s] < 0);
  const shortages = diagnoseShortages(unassignedIdx, adj, refToSlot, openSlots, pool, rules);

  return {
    assignments,
    unassignedSlotIds: unassignedIdx.map(s => openSlots[s].id),
    shortages,
    totalCost,
  };
}

/**
 * Condition de Hall : depuis chaque créneau non couvert, chemins alternés
 * (créneau → arbitre compatible → créneau tenu par cet arbitre). L'ensemble Z
 * atteint a exactement |Z| − 1 voisins (couplage maximal) : c'est le groupe en manque.
 */
function diagnoseShortages(
  unassigned: number[],
  adj: number[][],
  refToSlot: number[],
  slots: MatchingSlot[],
  pool: MatchingReferee[],
  rules: NeutralityRules
): RefereeShortage[] {
  const groups: { slots: Set<number>; refs: Set<number> }[] = [];
  for (const start of unassigned) {
    const zS = new Set<number>([start]);
    const zR = new Set<number>();
    const queue = [start];
    while (queue.length) {
      const s = queue.shift() as number;
      for (const r of adj[s]) {
        if (zR.has(r)) continue;
        zR.add(r);
        const next = refToSlot[r];
        if (next >= 0 && !zS.has(next)) {
          zS.add(next);
          queue.push(next);
        }
      }
    }
    // Fusion des groupes qui partagent un créneau ou un arbitre
    const merged = { slots: zS, refs: zR };
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      const overlaps =
        [...g.slots].some(x => merged.slots.has(x)) || [...g.refs].some(x => merged.refs.has(x));
      if (overlaps) {
        g.slots.forEach(x => merged.slots.add(x));
        g.refs.forEach(x => merged.refs.add(x));
        groups.splice(i, 1);
      }
    }
    groups.push(merged);
  }

  return groups.map(g => {
    const slotIdx = [...g.slots].sort((a, b) => a - b);
    const conflicts: NeutralityConflict[] = [];
    pool.forEach((ref, r) => {
      if (g.refs.has(r)) return;
      // Arbitre libre (non retenu ailleurs) écarté pour neutralité
      if (refToSlot[r] >= 0) return;
      for (const s of slotIdx) {
        const reasons = neutralityConflicts(ref, slots[s], rules);
        if (reasons.length > 0) conflicts.push({ refereeId: ref.id, slotId: slots[s].id, reasons });
      }
    });
    return {
      slotIds: slotIdx.map(s => slots[s].id),
      compatibleRefereeIds: [...g.refs].sort((a, b) => a - b).map(r => pool[r].id),
      missing: g.slots.size - g.refs.size,
      conflicts,
    };
  });
}

/** Niveau 0..1 à partir de la catégorie d'arbitrage saisie */
export function refereeLevelFromCategory(category: string | null | undefined): number {
  const c = norm(category);
  if (!c) return 0;
  if (c.startsWith('INT')) return 1;
  if (c.startsWith('NAT')) return 0.66;
  if (c.startsWith('REG') || c.startsWith('RÉG') || c.startsWith('LIG')) return 0.33;
  return 0;
}
