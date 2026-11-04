/**
 * Module kiosque /js/kioskBracketUtils.js (#1401) : classement général, ordre des tours,
 * dimensions, mode focus et plans du mode ciné.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskBracketUtils.js');

const rounds = (...r: number[]) => r.map(round => ({ round, matches: [] }));

describe('kioskBracketUtils.js', () => {
  it('buildOverallRanking agrège les poules et trie victoires > indice > touches', () => {
    const pools = [
      {
        rankings: [
          { id: 'a', victories: 2, index: 1, touchesFor: 10 },
          { id: 'b', victories: 3 },
        ],
      },
      {
        rankings: [
          { id: 'a', victories: 1, index: 2, touchesFor: 5 },
          { id: 'c', victories: 3, index: 1 },
        ],
      },
    ];
    const r = K.buildOverallRanking(pools);
    expect(r.map((x: { id: string }) => x.id)).toEqual(['a', 'c', 'b']);
    expect(r[0]).toMatchObject({ victories: 3, index: 3, touchesFor: 15 });
    expect(K.buildOverallRanking(undefined)).toEqual([]);
  });

  it('buildOverallRanking sans id : clé nom_prénom', () => {
    const r = K.buildOverallRanking([
      { rankings: [{ lastName: 'A', firstName: 'B', victories: 1 }] },
      { rankings: [{ lastName: 'A', firstName: 'B', victories: 1 }] },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].victories).toBe(2);
  });

  it('sortBySeed ordonne selon le classement, inconnus en dernier', () => {
    const ranking = [{ fencerId: 'x' }, { fencer: { id: 'y' } }, { id: 'z' }];
    const out = K.sortBySeed([{ id: 'q' }, { id: 'z' }, { id: 'x' }, { id: 'y' }], ranking);
    expect(out.map((f: { id: string }) => f.id)).toEqual(['x', 'y', 'z', 'q']);
  });

  it('getBracketRoundOrder : décroissant, petite finale en dernier', () => {
    const out = K.getBracketRoundOrder(rounds(2, 3, 8, 4));
    expect(out.map((r: { round: number }) => r.round)).toEqual([8, 4, 2, 3]);
    expect(K.getBracketRoundOrder(rounds(2, 4)).map((r: { round: number }) => r.round)).toEqual([
      4, 2,
    ]);
  });

  it('getBracketDims : paliers de taille', () => {
    expect(K.getBracketDims({ rounds: [] }).cardW).toBe(210);
    expect(K.getBracketDims({ rounds: rounds(8) }).cardW).toBe(210);
    expect(K.getBracketDims({ rounds: rounds(16) }).cardW).toBe(188);
    expect(K.getBracketDims({ rounds: rounds(32) }).cardW).toBe(158);
    expect(K.getBracketDims({ rounds: rounds(64) }).cardW).toBe(130);
  });

  it('isFocusMode : forcé, interdit, auto selon le seuil', () => {
    const big = { rounds: rounds(64, 32, 2) };
    const small = { rounds: rounds(32, 16, 2) };
    expect(K.isFocusMode(null, 'focus')).toBe(false);
    expect(K.isFocusMode(small, 'focus')).toBe(true);
    expect(K.isFocusMode(big, 'compact')).toBe(false);
    expect(K.isFocusMode(big, 'cinema')).toBe(false);
    expect(K.isFocusMode(big, 'auto')).toBe(true);
    expect(K.isFocusMode(small, 'auto')).toBe(false); // 32/2 = 16, pas > 16
  });

  it('buildCinemaFrames : ensemble puis plan par tour en cours, scan si trop haut', () => {
    const cinema = { overviewMs: 4000, roundMs: 6000, scanFrac: 0.5 };
    const live = { matches: [{ fencerA: {}, fencerB: {}, status: 'scheduled' }] };
    const done = { matches: [{ fencerA: {}, fencerB: {}, status: 'finished' }] };
    const L = {
      totalW: 1000,
      innerH: 500,
      cardW: 200,
      colX: [0, 300],
      orderedRounds: [done, live],
    };
    const f = K.buildCinemaFrames(L, 1000, 2000, cinema);
    expect(f).toHaveLength(2); // ensemble + 1 tour en cours (tour terminé ignoré)
    expect(f[0].holdMs).toBe(4000);
    expect(f[1].holdMs).toBe(6000);

    const tall = K.buildCinemaFrames({ ...L, innerH: 5000 }, 1000, 2000, cinema);
    expect(tall).toHaveLength(3); // ensemble + scan haut + scan bas
    expect(tall[2].transMs).toBe(3000);
    expect(tall[2].ty).toBeLessThan(0);
  });

  it('buildCinemaFrames : aucun tour en cours -> toutes les colonnes', () => {
    const cinema = { overviewMs: 1, roundMs: 2, scanFrac: 0.5 };
    const L = { totalW: 1000, innerH: 50, cardW: 200, colX: [0, 300, 600], orderedRounds: [] };
    expect(K.buildCinemaFrames(L, 1000, 2000, cinema)).toHaveLength(4);
  });

  it('kiosk.html charge le module et ne redéfinit plus ces calculs', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskBracketUtils.js"></script>');
    expect(html).not.toMatch(/function (buildCinemaFrames|getBracketDims|clampNum)\(/);
  });
});
