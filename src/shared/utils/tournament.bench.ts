/**
 * Benchmarks des calculs de compétition (npm run bench).
 * Données générées par le simulateur, déterministes.
 */
import { describe, test } from 'vitest';
import { simulateTournament } from './tournamentSimulator';
import { calculateOverallRanking, calculatePoolRanking } from './poolCalculations';
import {
  calculateTableRanking,
  createDirectEliminationTable,
  generateSeedingChart,
} from './tableCalculations';

const small = simulateTournament({ fencerCount: 7, seed: 1 });
const large = simulateTournament({ fencerCount: 200, seed: 1 });
const seeded = large.table.nodes
  .flatMap(n => [n.fencerA, n.fencerB])
  .filter(
    (f, i, all): f is NonNullable<typeof f> => !!f && all.findIndex(x => x?.id === f.id) === i
  );

describe('poules', () => {
  test('classement poule de 7', async ({ bench }) => {
    await bench('classement poule de 7', () => {
      calculatePoolRanking(small.pools[0]);
    }).run();
  });

  test(`classement général (${large.pools.length} poules, 200 tireurs)`, async ({ bench }) => {
    await bench(`classement général (${large.pools.length} poules, 200 tireurs)`, () => {
      calculateOverallRanking(large.pools);
    }).run();
  });
});

describe('tableau', () => {
  test('placement FIE tableau de 256', async ({ bench }) => {
    await bench('placement FIE tableau de 256', () => {
      generateSeedingChart(256);
    }).run();
  });

  test('création tableau de 256 (200 tireurs)', async ({ bench }) => {
    await bench('création tableau de 256 (200 tireurs)', () => {
      createDirectEliminationTable(seeded, 15);
    }).run();
  });

  test('classement final tableau de 256', async ({ bench }) => {
    await bench('classement final tableau de 256', () => {
      calculateTableRanking(large.table);
    }).run();
  });
});

describe('tournoi complet', () => {
  test('200 tireurs : poules → tableau → classement', async ({ bench }) => {
    await bench('200 tireurs : poules → tableau → classement', () => {
      simulateTournament({ fencerCount: 200, seed: 2 });
    }).run();
  });
});
