/**
 * BellePoule Modern - Ordre des matchs d'une poule et placement des coéquipiers (#1964)
 * Licensed under GPL-3.0
 *
 * Règlement FIE, Règles d'organisation (décembre 2025) :
 * - o.69 : ordre des matchs des poules de 6 et 7 ;
 * - o.70.1 : des tireurs d'une même appartenance, minoritaires, tirent entre eux avant
 *   de rencontrer les autres ;
 * - o.70.3 / o.70.4 : placements et tables spéciales des poules de 6 et 7.
 * Autres tailles : table standard, coéquipiers placés sur les numéros dont les matchs entre
 * eux viennent le plus tôt (application générale de o.70.1).
 */

import type { Fencer } from '../types';
import {
  generatePoolMatchOrder,
  generateRoundRobinOrder,
  parseBoutTable,
  type SeparationCriterionKey,
} from './poolCalculations';

/** Ordre des matchs : règlement (défaut) ou rondes de Berger sans placement (club, entraînement) */
export type PoolBoutOrderMode = 'fie' | 'free';

export type PoolBoutTable = 'standard' | 'trio6' | 'quartet6' | 'trio7' | 'roundRobin';

export interface PoolBoutGroup {
  criterion: SeparationCriterionKey;
  /** Valeur telle que saisie (club, région, nation) */
  value: string;
  fencerIds: string[];
  /** Numéros dans la poule (base 1), croissants */
  positions: number[];
}

export interface PoolBoutPlan {
  /** Tireurs dans l'ordre des numéros : index 0 = n°1 */
  positions: Fencer[];
  /** Paires de numéros (base 1), dans l'ordre des matchs */
  bouts: [number, number][];
  table: PoolBoutTable;
  groups: PoolBoutGroup[];
}

export interface PlanPoolBoutsOptions {
  mode?: PoolBoutOrderMode;
  /**
   * Garde les numéros tels quels (échange manuel du DT) : seule la table est choisie.
   * Sinon les coéquipiers reçoivent les numéros réservés.
   */
  keepPositions?: boolean;
}

/** Taille maximale des poules où les coéquipiers sont placés */
export const MAX_PLACED_POOL_SIZE = 12;

/** Tables spéciales FIE o.70.3.b, o.70.3.c et o.70.4.b */
export const SPECIAL_BOUT_TABLES: Record<'trio6' | 'quartet6' | 'trio7', [number, number][]> = {
  trio6: parseBoutTable('1-2 4-5 2-3 5-6 3-1 6-4 2-5 1-4 5-3 1-6 4-2 3-6 5-1 3-4 6-2'),
  quartet6: parseBoutTable('3-1 4-2 1-4 2-3 5-6 1-2 3-4 1-6 2-5 3-6 4-5 6-2 5-1 6-4 5-3'),
  trio7: parseBoutTable(
    '1-2 4-5 6-7 3-1 4-7 2-3 5-1 6-2 3-4 7-5 1-6 4-2 7-3 5-6 1-4 2-7 5-3 6-4 7-1 2-5 3-6'
  ),
};

/** Ordre des matchs d'une table pour n tireurs */
export function boutsForTable(table: PoolBoutTable, fencerCount: number): [number, number][] {
  if (table === 'roundRobin') return generateRoundRobinOrder(fencerCount);
  if (table === 'standard') return generatePoolMatchOrder(fencerCount);
  return SPECIAL_BOUT_TABLES[table].map(([a, b]) => [a, b] as [number, number]);
}

const valueOf = (fencer: Fencer, key: SeparationCriterionKey): string | undefined =>
  key === 'byClub' ? fencer.club : key === 'byRegion' ? fencer.region : fencer.nationality;

const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase();

interface DetectedGroup {
  criterion: SeparationCriterionKey;
  value: string;
  members: Fencer[];
}

/**
 * Groupes de coéquipiers (au moins 2) : critères pris dans l'ordre du DT, un tireur
 * appartient au premier groupe trouvé. Tri : taille décroissante, puis premier membre.
 */
export function detectTeammateGroups(
  fencers: Fencer[],
  criteria: SeparationCriterionKey[]
): DetectedGroup[] {
  const assigned = new Set<string>();
  const groups: DetectedGroup[] = [];
  for (const criterion of criteria) {
    const byValue = new Map<string, Fencer[]>();
    for (const f of fencers) {
      if (assigned.has(f.id)) continue;
      const key = norm(valueOf(f, criterion));
      if (!key) continue;
      byValue.set(key, [...(byValue.get(key) ?? []), f]);
    }
    for (const members of byValue.values()) {
      if (members.length < 2) continue;
      members.forEach(m => assigned.add(m.id));
      groups.push({ criterion, value: valueOf(members[0], criterion)!.trim(), members });
    }
  }
  const firstIndex = (g: DetectedGroup) => fencers.indexOf(g.members[0]);
  return groups.sort(
    (a, b) => b.members.length - a.members.length || firstIndex(a) - firstIndex(b)
  );
}

type Layout = { table: PoolBoutTable; slots: number[][] };

/** Placement réglementaire des poules de 6 et 7 (o.70.3, o.70.4) selon les tailles des groupes */
function specialLayout(n: number, sizes: number[]): Layout | null {
  const sig = sizes.join(',');
  if (n === 6) {
    if (sig === '3' || sig === '3,2')
      return {
        table: 'trio6',
        slots: [
          [1, 2, 3],
          [4, 5],
        ],
      };
    if (sig === '3,3')
      return {
        table: 'trio6',
        slots: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      };
    if (sig === '4' || sig === '4,2')
      return {
        table: 'quartet6',
        slots: [
          [1, 2, 3, 4],
          [5, 6],
        ],
      };
  }
  if (n === 7 && (sig === '3' || sig === '3,2' || sig === '3,2,2')) {
    return {
      table: 'trio7',
      slots: [
        [1, 2, 3],
        [4, 5],
        [6, 7],
      ],
    };
  }
  return null;
}

function combinations(pool: number[], k: number): number[][] {
  if (k === 0) return [[]];
  const out: number[][] = [];
  pool.forEach((v, i) => {
    for (const rest of combinations(pool.slice(i + 1), k - 1)) out.push([v, ...rest]);
  });
  return out;
}

/**
 * Numéros libres où les k coéquipiers se rencontrent le plus tôt : on minimise l'indice du
 * dernier de leurs matchs, puis de l'avant-dernier, etc. ; à égalité, les plus petits numéros.
 */
function earliestSlots(free: number[], k: number, bouts: [number, number][]): number[] {
  let best: { slots: number[]; key: number[] } | null = null;
  for (const slots of combinations(free, k)) {
    const set = new Set(slots);
    const key = bouts
      .map(([a, b], i) => (set.has(a) && set.has(b) ? i : -1))
      .filter(i => i >= 0)
      .sort((x, y) => y - x);
    if (!best || compareKeys(key, best.key) < 0) best = { slots, key };
  }
  return best ? best.slots : free.slice(0, k);
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** Positions d'un groupe dans un ordre donné (base 1, croissantes) */
const positionsIn = (order: Fencer[], members: Fencer[]) =>
  members.map(m => order.indexOf(m) + 1).sort((a, b) => a - b);

const sameSlots = (a: number[], b: number[] | undefined) =>
  !!b && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Numéros et ordre des matchs d'une poule (#1964).
 * @param fencers tireurs dans l'ordre du serpentin (ou numéros actuels avec keepPositions)
 * @param criteria critères de regroupement, ceux de la séparation, dans l'ordre du DT
 */
export function planPoolBouts(
  fencers: Fencer[],
  criteria: SeparationCriterionKey[],
  options: PlanPoolBoutsOptions = {}
): PoolBoutPlan {
  const n = fencers.length;
  if (options.mode === 'free') {
    return {
      positions: [...fencers],
      bouts: generateRoundRobinOrder(n),
      table: 'roundRobin',
      groups: [],
    };
  }
  const standard = generatePoolMatchOrder(n);
  // Au-delà de 12 tireurs : ordre de Berger, pas de placement (hors périmètre #1964)
  const detected = n > MAX_PLACED_POOL_SIZE ? [] : detectTeammateGroups(fencers, criteria);
  // o.70.2 : un groupe majoritaire relève d'un ordre fixé par le DT (sauf quatuor de 6, o.70.3.c)
  const minority = detected.filter(
    g => g.members.length * 2 <= n || (n === 6 && g.members.length === 4)
  );
  const special = specialLayout(
    n,
    minority.map(g => g.members.length)
  );

  const finish = (positions: Fencer[], table: PoolBoutTable): PoolBoutPlan => ({
    positions,
    table,
    bouts: boutsForTable(table, n),
    groups: minority.map(g => ({
      criterion: g.criterion,
      value: g.value,
      fencerIds: g.members.map(m => m.id),
      positions: positionsIn(positions, g.members),
    })),
  });

  if (options.keepPositions) {
    const fits =
      special &&
      minority.every((g, i) => sameSlots(positionsIn(fencers, g.members), special.slots[i]));
    return finish([...fencers], fits ? special.table : 'standard');
  }
  if (minority.length === 0) return finish([...fencers], 'standard');

  const slotsOf = new Map<DetectedGroup, number[]>();
  if (special) {
    minority.forEach((g, i) => slotsOf.set(g, special.slots[i]));
  } else {
    let free = Array.from({ length: n }, (_, i) => i + 1);
    for (const g of minority) {
      const slots = earliestSlots(free, g.members.length, standard);
      slotsOf.set(g, slots);
      free = free.filter(s => !slots.includes(s));
    }
  }

  const positions: (Fencer | undefined)[] = new Array(n).fill(undefined);
  for (const [g, slots] of slotsOf) g.members.forEach((m, i) => (positions[slots[i] - 1] = m));
  // Les autres tireurs gardent l'ordre du serpentin sur les numéros restants
  const placed = new Set(positions.filter(Boolean).map(f => f!.id));
  const rest = fencers.filter(f => !placed.has(f.id));
  for (let i = 0; i < n; i++) if (!positions[i]) positions[i] = rest.shift();
  return finish(positions as Fencer[], special ? special.table : 'standard');
}
