/**
 * Ordre des matchs de poule et placement des coéquipiers (#1964)
 * Données de référence : FIE, Règles d'organisation, décembre 2025, o.69 et o.70.
 */

import { describe, it, expect } from 'vitest';
import { Fencer, FencerStatus, Gender } from '../types';
import { generatePoolMatchOrder, parseBoutTable } from './poolCalculations';
import {
  SPECIAL_BOUT_TABLES,
  boutsForTable,
  detectTeammateGroups,
  planPoolBouts,
} from './poolBoutOrder';

const fencer = (id: string, club?: string, extra: Partial<Fencer> = {}): Fencer => ({
  id,
  ref: Number(id.replace(/\D/g, '')) || 0,
  lastName: id,
  firstName: 'T',
  gender: Gender.MALE,
  nationality: '',
  club,
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...extra,
});

/** Poule : clubs donnés dans l'ordre du serpentin, un club vide = tireur isolé */
const pool = (...clubs: string[]) => clubs.map((c, i) => fencer(`f${i + 1}`, c || `solo${i + 1}`));

const isCompleteRoundRobin = (n: number, bouts: [number, number][]) => {
  const keys = bouts.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`);
  return (
    bouts.length === (n * (n - 1)) / 2 &&
    new Set(keys).size === bouts.length &&
    bouts.every(([a, b]) => a !== b && a >= 1 && b >= 1 && a <= n && b <= n)
  );
};

/** Indice du premier match d'un tireur contre quelqu'un hors de son groupe */
const firstOutsideBout = (bouts: [number, number][], group: number[], pos: number) =>
  bouts.findIndex(
    ([a, b]) => (a === pos && !group.includes(b)) || (b === pos && !group.includes(a))
  );

describe('tables officielles (o.69, o.70)', () => {
  // Lecture en colonnes du texte FIE de décembre 2025
  const FIE_7 =
    '1-4 2-5 3-6 7-1 5-4 2-3 6-7 5-1 4-3 6-2 5-7 3-1 4-6 7-2 3-5 1-6 2-4 7-3 6-5 1-2 4-7';
  const FIE_6 = '1-2 4-3 6-5 3-1 2-6 5-4 1-6 3-5 4-2 5-1 6-4 2-3 1-4 5-2 3-6';
  const FIE_TRIO_6 = '1-2 4-5 2-3 5-6 3-1 6-4 2-5 1-4 5-3 1-6 4-2 3-6 5-1 3-4 6-2';
  const FIE_QUATUOR_6 = '3-1 4-2 1-4 2-3 5-6 1-2 3-4 1-6 2-5 3-6 4-5 6-2 5-1 6-4 5-3';
  const FIE_TRIO_7 =
    '1-2 4-5 6-7 3-1 4-7 2-3 5-1 6-2 3-4 7-5 1-6 4-2 7-3 5-6 1-4 2-7 5-3 6-4 7-1 2-5 3-6';

  it('poules de 6 et 7 : tables o.69', () => {
    expect(generatePoolMatchOrder(6)).toEqual(parseBoutTable(FIE_6));
    expect(generatePoolMatchOrder(7)).toEqual(parseBoutTable(FIE_7));
  });

  it('tables spéciales o.70.3.b, o.70.3.c et o.70.4.b', () => {
    expect(SPECIAL_BOUT_TABLES.trio6).toEqual(parseBoutTable(FIE_TRIO_6));
    expect(SPECIAL_BOUT_TABLES.quartet6).toEqual(parseBoutTable(FIE_QUATUOR_6));
    expect(SPECIAL_BOUT_TABLES.trio7).toEqual(parseBoutTable(FIE_TRIO_7));
  });

  it('tables 3 à 8 inchangées (non-régression)', () => {
    expect(generatePoolMatchOrder(3)).toEqual(parseBoutTable('2-3 1-3 1-2'));
    expect(generatePoolMatchOrder(4)).toEqual(parseBoutTable('1-4 2-3 1-3 2-4 3-4 1-2'));
    expect(generatePoolMatchOrder(5)).toEqual(
      parseBoutTable('1-2 3-4 5-1 2-3 5-4 1-3 2-5 4-1 3-5 4-2')
    );
    expect(generatePoolMatchOrder(8)).toEqual(
      parseBoutTable(
        '2-3 1-5 7-4 6-8 1-2 3-4 5-6 8-7 4-1 5-2 8-3 6-7 4-2 8-1 7-5 3-6 2-8 5-4 6-1 3-7 4-8 2-6 3-5 1-7 4-6 8-5 7-2 1-3'
      )
    );
  });

  it('tables 9 à 12 : première et dernière rencontre de la table d’usage', () => {
    expect(generatePoolMatchOrder(9)[0]).toEqual([1, 9]);
    expect(generatePoolMatchOrder(10)[44]).toEqual([1, 10]);
    expect(generatePoolMatchOrder(11)[54]).toEqual([6, 11]);
    expect(generatePoolMatchOrder(12)[7]).toEqual([11, 12]);
  });

  it('chaque table est un tournoi complet, sans match consécutif dès 5 tireurs', () => {
    for (let n = 3; n <= 14; n++) {
      const bouts = generatePoolMatchOrder(n);
      expect(isCompleteRoundRobin(n, bouts)).toBe(true);
      if (n < 5) continue;
      for (let i = 1; i < bouts.length; i++) {
        const shared = bouts[i].some(p => bouts[i - 1].includes(p));
        expect(shared, `n=${n} match ${i + 1}`).toBe(false);
      }
    }
    for (const [name, bouts] of Object.entries(SPECIAL_BOUT_TABLES)) {
      expect(isCompleteRoundRobin(name.endsWith('7') ? 7 : 6, bouts)).toBe(true);
    }
  });
});

describe('detectTeammateGroups', () => {
  it('suit l’ordre des critères ; un tireur appartient au premier groupe trouvé', () => {
    const fs = [
      fencer('a', 'X', { nationality: 'FRA' }),
      fencer('b', 'Y', { nationality: 'FRA' }),
      fencer('c', 'Y', { nationality: 'ITA' }),
      fencer('d', 'Z', { nationality: 'ITA' }),
    ];
    const groups = detectTeammateGroups(fs, ['byNation', 'byClub']);
    expect(groups.map(g => [g.criterion, g.members.map(m => m.id)])).toEqual([
      ['byNation', ['a', 'b']],
      ['byNation', ['c', 'd']],
    ]);
  });

  it('ignore la casse et les espaces, pas les valeurs vides', () => {
    const fs = [fencer('a', ' Club A'), fencer('b', 'club a '), fencer('c', ''), fencer('d', '')];
    expect(detectTeammateGroups(fs, ['byClub']).map(g => g.members.length)).toEqual([2]);
  });
});

describe('planPoolBouts', () => {
  it('sans coéquipiers : numéros et ordre identiques à aujourd’hui', () => {
    for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const fs = pool(...Array.from({ length: n }, () => ''));
      const plan = planPoolBouts(fs, ['byClub', 'byRegion']);
      expect(plan.positions).toEqual(fs);
      expect(plan.bouts).toEqual(generatePoolMatchOrder(n));
      expect(plan.table).toBe('standard');
      expect(plan.groups).toEqual([]);
    }
  });

  it('poule de 6, deux tireurs du même club : n°1 et 2, premier match, table o.69', () => {
    // Exemple de l'issue : Martin (n°2) et Petit (n°5) du club A dans le serpentin
    const fs = pool('B', 'A', 'C', 'D', 'A', 'E');
    const plan = planPoolBouts(fs, ['byClub']);
    expect(plan.table).toBe('standard');
    expect(plan.positions.slice(0, 2).map(f => f.id)).toEqual(['f2', 'f5']);
    expect(plan.bouts[0]).toEqual([1, 2]);
    // Les autres gardent l'ordre du serpentin
    expect(plan.positions.slice(2).map(f => f.id)).toEqual(['f1', 'f3', 'f4', 'f6']);
    expect(plan.groups[0]).toMatchObject({ criterion: 'byClub', value: 'A', positions: [1, 2] });
  });

  it('poule de 6, trois paires : (1,2) (3,4) (5,6), chacune tire son premier match entre elle', () => {
    const plan = planPoolBouts(pool('A', 'B', 'C', 'A', 'B', 'C'), ['byClub']);
    expect(plan.table).toBe('standard');
    expect(plan.groups.map(g => g.positions)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    expect(plan.bouts.slice(0, 3)).toEqual([
      [1, 2],
      [4, 3],
      [6, 5],
    ]);
  });

  it('poule de 6, trio + paire : trio en 1-2-3, paire en 4-5, table trio de 6', () => {
    const plan = planPoolBouts(pool('A', 'B', 'A', '', 'B', 'A'), ['byClub']);
    expect(plan.table).toBe('trio6');
    expect(plan.groups.map(g => [g.value, g.positions])).toEqual([
      ['A', [1, 2, 3]],
      ['B', [4, 5]],
    ]);
    expect(plan.positions.map(f => f.id)).toEqual(['f1', 'f3', 'f6', 'f2', 'f5', 'f4']);
  });

  it('poule de 6, deux trios : 1-2-3 et 4-5-6', () => {
    const plan = planPoolBouts(pool('A', 'B', 'B', 'A', 'A', 'B'), ['byClub']);
    expect(plan.table).toBe('trio6');
    expect(plan.groups.map(g => g.positions)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('poule de 6, quatuor : 1 à 4, table quatuor de 6', () => {
    const plan = planPoolBouts(pool('A', '', 'A', 'A', '', 'A'), ['byClub']);
    expect(plan.table).toBe('quartet6');
    expect(plan.groups[0].positions).toEqual([1, 2, 3, 4]);
    const group = [1, 2, 3, 4];
    // Les matchs du quatuor ouvrent la poule avant tout match contre un autre
    expect(firstOutsideBout(plan.bouts, group, 1)).toBeGreaterThan(3);
  });

  it('poule de 7, paires : (1,4) (2,5) (3,6), table o.69', () => {
    const plan = planPoolBouts(pool('A', 'B', 'C', '', 'A', 'B', 'C'), ['byClub']);
    expect(plan.table).toBe('standard');
    expect(plan.groups.map(g => g.positions)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
    expect(plan.bouts.slice(0, 3)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  it('poule de 7, trio + deux paires : 1-2-3, 4-5, 6-7, table trio de 7', () => {
    const plan = planPoolBouts(pool('C', 'A', 'B', 'A', 'C', 'B', 'A'), ['byClub']);
    expect(plan.table).toBe('trio7');
    expect(plan.groups.map(g => [g.value, g.positions])).toEqual([
      ['A', [1, 2, 3]],
      ['C', [4, 5]],
      ['B', [6, 7]],
    ]);
    // Leurs trois matchs parmi les six premiers ; chaque paire tire en premier
    const trio = plan.bouts.map((b, i) => (b.every(p => p <= 3) ? i : -1)).filter(i => i >= 0);
    expect(trio.length).toBe(3);
    expect(Math.max(...trio)).toBeLessThan(6);
    expect(plan.bouts.slice(0, 3)).toEqual([
      [1, 2],
      [4, 5],
      [6, 7],
    ]);
  });

  it('autres tailles (o.70.1) : poule de 5, paire en 1-2 ; poule de 8, paire en 2-3', () => {
    const p5 = planPoolBouts(pool('', 'A', '', '', 'A'), ['byClub']);
    expect(p5.groups[0].positions).toEqual([1, 2]);
    expect(p5.bouts[0]).toEqual([1, 2]);
    const p8 = planPoolBouts(pool('A', '', '', '', '', '', '', 'A'), ['byClub']);
    expect(p8.groups[0].positions).toEqual([2, 3]);
    expect(p8.bouts[0]).toEqual([2, 3]);
  });

  it('trio de poule de 8 : trois matchs entre eux le plus tôt possible', () => {
    const plan = planPoolBouts(pool('A', '', 'A', '', '', '', '', 'A'), ['byClub']);
    const g = plan.groups[0].positions;
    const idx = plan.bouts
      .map((b, i) => (b.every(p => g.includes(p)) ? i : -1))
      .filter(i => i >= 0);
    expect(idx.length).toBe(3);
    // Aucun autre trio de numéros ne finit plus tôt ses trois matchs
    const std = generatePoolMatchOrder(8);
    let best = Infinity;
    for (let a = 1; a <= 8; a++)
      for (let b = a + 1; b <= 8; b++)
        for (let c = b + 1; c <= 8; c++) {
          const last = Math.max(
            ...std.map((x, i) => (x.every(p => [a, b, c].includes(p)) ? i : -1))
          );
          best = Math.min(best, last);
        }
    expect(Math.max(...idx)).toBe(best);
  });

  it('groupe majoritaire (o.70.2) : pas de placement automatique', () => {
    const fs = pool('A', 'A', 'A', '', '');
    const plan = planPoolBouts(fs, ['byClub']);
    expect(plan.positions).toEqual(fs);
    expect(plan.groups).toEqual([]);
  });

  it('keepPositions : garde les numéros et ne prend la table spéciale que s’ils conviennent', () => {
    const planned = planPoolBouts(pool('C', 'A', 'B', 'A', 'C', 'B', 'A'), ['byClub']);
    const kept = planPoolBouts(planned.positions, ['byClub'], { keepPositions: true });
    expect(kept.table).toBe('trio7');
    expect(kept.positions).toEqual(planned.positions);
    const swapped = [...planned.positions];
    [swapped[0], swapped[3]] = [swapped[3], swapped[0]];
    const manual = planPoolBouts(swapped, ['byClub'], { keepPositions: true });
    expect(manual.table).toBe('standard');
    expect(manual.positions).toEqual(swapped);
  });

  it('ordre libre : rondes de Berger, numéros du serpentin', () => {
    const fs = pool('A', '', '', 'A', '', '');
    const plan = planPoolBouts(fs, ['byClub'], { mode: 'free' });
    expect(plan.table).toBe('roundRobin');
    expect(plan.positions).toEqual(fs);
    expect(plan.bouts).toEqual(boutsForTable('roundRobin', 6));
    expect(isCompleteRoundRobin(6, plan.bouts)).toBe(true);
  });

  it('au-delà de 12 tireurs : pas de placement', () => {
    const fs = pool(...Array.from({ length: 13 }, (_, i) => (i < 2 ? 'A' : '')));
    expect(planPoolBouts(fs, ['byClub']).groups).toEqual([]);
  });
});
