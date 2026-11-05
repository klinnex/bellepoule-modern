import { describe, it, expect } from 'vitest';
import {
  DEMO_FINAL_RANKING_MS,
  DEMO_POOL_COUNT,
  DEMO_POOL_RANKING_MS,
  DEMO_POOL_SIZE,
  DEMO_TABLEAU_SIZE,
  DemoTournament,
  bracketSeedOrder,
} from './demoTournament';
import { createDemoFencer } from './demoMode';
import { createRng } from '../../shared/utils/tournamentSimulator';

const POOL_MATCHES = DEMO_POOL_COUNT * ((DEMO_POOL_SIZE * (DEMO_POOL_SIZE - 1)) / 2);

function setup(seed = 1) {
  let now = 0;
  const t = new DemoTournament(createRng(seed), createDemoFencer, () => now);
  let n = 0;
  /** Joue tous les duels disponibles ; A gagne 5-2 (poules) ou 15-9 (tableau) */
  const playAll = () => {
    let played = 0;
    for (;;) {
      const id = `m${n++}`;
      const p = t.next(id);
      if (!p) return played;
      t.record(id, p.isTableau ? 15 : 5, p.isTableau ? 9 : 2);
      played++;
    }
  };
  return { t, playAll, advance: (ms: number) => (now += ms) };
}

describe('bracketSeedOrder', () => {
  it('place 1 et 2 aux extrémités du tableau', () => {
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3]);
  });
});

describe('DemoTournament', () => {
  it('distribue chaque duel de poule une seule fois, puis passe au classement', () => {
    const { t } = setup();
    const seen = new Set<string>();
    for (let i = 0; i < POOL_MATCHES; i++) {
      const p = t.next(`m${i}`)!;
      expect(p.isTableau).toBe(false);
      const key = [p.fencerA.id, p.fencerB.id].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(t.next('extra')).toBeNull();
    expect(t.currentPhase).toBe('pools');
    for (let i = 0; i < POOL_MATCHES; i++) t.record(`m${i}`, 5, 3);
    expect(t.currentPhase).toBe('pool_ranking');
    const state = t.state();
    expect(state.poolRanking).toHaveLength(DEMO_POOL_COUNT * DEMO_POOL_SIZE);
    expect(
      state.pools.every(p => p.results.length === (DEMO_POOL_SIZE * (DEMO_POOL_SIZE - 1)) / 2)
    ).toBe(true);
    expect(state.remainingMs).toBe(DEMO_POOL_RANKING_MS);
  });

  it('matrice : duels en cours signalés jusqu’au score', () => {
    const { t } = setup();
    const p = t.next('m0')!;
    expect(t.state().pools.flatMap(x => x.playing)).toEqual([`${p.fencerA.id}|${p.fencerB.id}`]);
    t.record('m0', 5, 1);
    const state = t.state();
    expect(state.pools.flatMap(x => x.playing)).toEqual([]);
    expect(state.pools.flatMap(x => x.results)).toEqual([
      { a: p.fencerA.id, b: p.fencerB.id, scoreA: 5, scoreB: 1 },
    ]);
  });

  it('enchaîne classement → tableau → classement final → nouveau tournoi', () => {
    const { t, playAll, advance } = setup(3);
    expect(playAll()).toBe(POOL_MATCHES);
    expect(t.currentPhase).toBe('pool_ranking');
    expect(t.next('x')).toBeNull();

    advance(DEMO_POOL_RANKING_MS - 1);
    expect(t.tick()).toBe(false);
    advance(1);
    expect(t.tick()).toBe(true);
    expect(t.currentPhase).toBe('tableau');

    const first = t.state().tableau[0];
    expect(first).toHaveLength(DEMO_TABLEAU_SIZE / 2);
    expect(first[0].seedA).toBe(1);
    expect(first[0].seedB).toBe(8);

    // Tableau de 8 : 4 + 2 + 1 duels
    expect(playAll()).toBe(DEMO_TABLEAU_SIZE - 1);
    expect(t.currentPhase).toBe('final_ranking');
    const state = t.state();
    expect(state.tableau.map(r => r.length)).toEqual([4, 2, 1]);
    const final = state.finalRanking;
    expect(final).toHaveLength(DEMO_POOL_COUNT * DEMO_POOL_SIZE);
    expect(final.map(r => r.rank)).toEqual([1, 2, 3, 3, 5, 5, 5, 5, 9, 9]);
    // A gagne toujours : la tête de série 1 remporte le tournoi
    expect(final[0].fencer.id).toBe(state.poolRanking[0].fencer.id);
    // Les deux non qualifiés finissent derniers
    expect(final.slice(-2).map(r => r.fencer.id)).toEqual(
      state.poolRanking.slice(-2).map(r => r.fencer.id)
    );

    advance(DEMO_FINAL_RANKING_MS);
    expect(t.tick()).toBe(true);
    expect(t.currentPhase).toBe('pools');
    expect(t.state().cycle).toBe(2);
    expect(t.state().tableau).toEqual([]);
    expect(t.next('nouveau')).not.toBeNull();
  });

  it('ignore un score inconnu', () => {
    const { t } = setup();
    expect(t.record('inconnu', 5, 0)).toBe(false);
    expect(t.state().pools.flatMap(p => p.results)).toEqual([]);
  });

  it('classement de poule : V/M puis indice', () => {
    const { t, playAll } = setup(9);
    playAll();
    for (const pool of t.state().pools) {
      for (let k = 1; k < pool.rankings.length; k++) {
        expect(pool.rankings[k - 1].victories).toBeGreaterThanOrEqual(pool.rankings[k].victories);
      }
    }
  });
});
