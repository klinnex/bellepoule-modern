import { describe, it, expect, beforeEach } from 'vitest';
import {
  TournamentFlowManager,
  DEFAULT_TOURNAMENT_CONFIG,
  Arena,
  ArenaSettings,
} from './tournamentFlow';
import {
  Competition,
  Pool,
  Match,
  MatchStatus,
  Gender,
  FencerStatus,
  Weapon,
  Category,
} from '../types';

// ============================================================================
// Helpers
// ============================================================================

const makeArena = (id: string, available = true, usageCount = 0): Arena => ({
  id,
  name: `Piste ${id}`,
  available,
  usageCount,
});

const makeFencer = (id: string, club = 'Club A') => ({
  id,
  ref: 1,
  lastName: 'DUPONT',
  firstName: 'Jean',
  gender: Gender.MALE,
  nationality: 'FRA',
  club,
  status: FencerStatus.NOT_CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeMatch = (id: string, status: MatchStatus = MatchStatus.NOT_STARTED): Match => ({
  id,
  number: 1,
  fencerA: makeFencer('fA'),
  fencerB: makeFencer('fB'),
  scoreA: null,
  scoreB: null,
  maxScore: 5,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makePool = (id: string, matches: Match[]): Pool => ({
  id,
  number: 1,
  phaseId: 'phase-1',
  fencers: [],
  matches,
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeCompetition = (): Competition => ({
  id: 'comp-1',
  title: 'Test',
  weapon: Weapon.EPEE,
  gender: Gender.MALE,
  category: Category.SENIOR,
  date: new Date(),
  color: '#000000',
  fencers: [],
  referees: [],
  phases: [],
  currentPhaseIndex: 0,
  settings: {
    defaultPoolMaxScore: 5,
    defaultTableMaxScore: 10,
    defaultPoolTimerSeconds: 180,
    defaultTableTimerSeconds: 180,
    poolRounds: 1,
    hasDirectElimination: true,
    thirdPlaceMatch: false,
    manualRanking: false,
    defaultRanking: 9999,
    randomScore: false,
    minTeamSize: 3,
  },
  isTeamEvent: false,
  status: 'in_progress',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ============================================================================
// Tests
// ============================================================================

describe('TournamentFlowManager', () => {
  let manager: TournamentFlowManager;

  beforeEach(() => {
    manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
  });

  it('constructeur avec config par défaut crée une instance', () => {
    expect(manager).toBeDefined();
  });

  it('DEFAULT_TOURNAMENT_CONFIG a les valeurs attendues', () => {
    expect(DEFAULT_TOURNAMENT_CONFIG.maxConcurrentMatches).toBe(4);
    expect(DEFAULT_TOURNAMENT_CONFIG.minRestTime).toBe(10);
    expect(DEFAULT_TOURNAMENT_CONFIG.maxWaitTime).toBe(25);
    expect(DEFAULT_TOURNAMENT_CONFIG.balanceStripUsage).toBe(true);
    expect(DEFAULT_TOURNAMENT_CONFIG.optimizeFencerRest).toBe(true);
  });

  it('constructeur avec config personnalisée', () => {
    const config: ArenaSettings = {
      maxConcurrentMatches: 6,
      minRestTime: 5,
      maxWaitTime: 20,
      balanceStripUsage: false,
      optimizeFencerRest: false,
    };
    const customManager = new TournamentFlowManager(config);
    expect(customManager).toBeDefined();
  });

  it('0 matchs → schedule vide', async () => {
    const competition = makeCompetition();
    const pools = [makePool('p1', [])];
    const arenas = [makeArena('a1'), makeArena('a2')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.schedule).toHaveLength(0);
  });

  it('0 matchs → metrics.totalDuration = 0', async () => {
    const competition = makeCompetition();
    const pools = [makePool('p1', [])];
    const arenas = [makeArena('a1')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.metrics.totalDuration).toBe(0);
  });

  it('plusieurs matchs non terminés → schedule non vide', async () => {
    const competition = makeCompetition();
    const matches = [
      makeMatch('m1', MatchStatus.NOT_STARTED),
      makeMatch('m2', MatchStatus.NOT_STARTED),
      makeMatch('m3', MatchStatus.IN_PROGRESS),
    ];
    const pools = [makePool('p1', matches)];
    const arenas = [makeArena('a1'), makeArena('a2')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.schedule.length).toBeGreaterThan(0);
  });

  it('matchs FINISHED exclus du schedule', async () => {
    const competition = makeCompetition();
    const matches = [makeMatch('m1', MatchStatus.FINISHED), makeMatch('m2', MatchStatus.FINISHED)];
    const pools = [makePool('p1', matches)];
    const arenas = [makeArena('a1')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.schedule).toHaveLength(0);
  });

  it('0 arènes disponibles → schedule vide', async () => {
    const competition = makeCompetition();
    const matches = [makeMatch('m1'), makeMatch('m2')];
    const pools = [makePool('p1', matches)];
    const arenas: Arena[] = [];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.schedule).toHaveLength(0);
  });

  it('arène unavailable ignorée', async () => {
    const competition = makeCompetition();
    const matches = [makeMatch('m1'), makeMatch('m2'), makeMatch('m3')];
    const pools = [makePool('p1', matches)];
    const arenas = [makeArena('unavail', false)];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.schedule).toHaveLength(0);
  });

  it('1 arène disponible → schedule contient arenaId correct', async () => {
    const competition = makeCompetition();
    const matches = [makeMatch('m1'), makeMatch('m2')];
    const pools = [makePool('p1', matches)];
    const arenas = [makeArena('piste-1')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    result.schedule.forEach(s => {
      expect(s.arenaId).toBe('piste-1');
    });
  });

  it('résultat contient metrics avec arenaUtilization', async () => {
    const competition = makeCompetition();
    const matches = [makeMatch('m1')];
    const pools = [makePool('p1', matches)];
    const arenas = [makeArena('a1')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    expect(result.metrics).toBeDefined();
    expect(result.metrics.arenaUtilization).toBeDefined();
    expect(result.metrics.fencerRestViolations).toBeDefined();
  });

  it('schedule trié par scheduledTime croissant', async () => {
    const competition = makeCompetition();
    const matches = [makeMatch('m1'), makeMatch('m2'), makeMatch('m3'), makeMatch('m4')];
    const pools = [makePool('p1', matches)];
    const arenas = [makeArena('a1'), makeArena('a2')];

    const result = await manager.optimizeTournamentFlow(competition, pools, arenas);

    for (let i = 1; i < result.schedule.length; i++) {
      expect(result.schedule[i].scheduledTime.getTime()).toBeGreaterThanOrEqual(
        result.schedule[i - 1].scheduledTime.getTime()
      );
    }
  });

  it('updateHistoricalData ne plante pas sur match FINISHED', () => {
    const match = makeMatch('m1', MatchStatus.FINISHED);
    match.createdAt = new Date(Date.now() - 20 * 60 * 1000);
    match.updatedAt = new Date();
    expect(() => manager.updateHistoricalData(match)).not.toThrow();
  });

  it('updateHistoricalData ignoré si match pas FINISHED', () => {
    const match = makeMatch('m1', MatchStatus.IN_PROGRESS);
    expect(() => manager.updateHistoricalData(match)).not.toThrow();
  });
});

describe('TournamentFlowManager — calculs successifs (#1018)', () => {
  it('un second calcul ne plante pas et repart de maintenant', async () => {
    const fencers = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, initialRanking: i + 1 }));
    const matches: any[] = [];
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++)
        matches.push({
          id: `m${i}${j}`,
          poolId: 'p1',
          fencerA: fencers[i],
          fencerB: fencers[j],
          status: MatchStatus.NOT_STARTED,
        });
    const pools: any[] = [{ id: 'p1', matches }];
    const arenas = [{ id: 'a1', name: 'Piste 1', available: true }];
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    for (let k = 0; k < 2; k++) {
      const res = await manager.optimizeTournamentFlow({} as any, pools, arenas);
      expect(res.schedule).toHaveLength(10);
      expect(() => manager.getFlowRecommendations(res.schedule, arenas)).not.toThrow();
    }
  });

  it('planning vide : pas de NaN ni d’exception', async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const arenas = [{ id: 'a1', name: 'Piste 1', available: true }];
    const res = await manager.optimizeTournamentFlow({} as any, [], arenas);
    expect(res.metrics.averageWaitTime).toBe(0);
    expect(manager.getFlowRecommendations(res.schedule, arenas)).toEqual(expect.any(Array));
  });
});

describe('TournamentFlowManager — estimations du planning (#1018)', () => {
  // 10 tireurs, 2 poules de 5 → 20 matchs
  const makePools = (): any[] =>
    [0, 1].map(p => {
      const fencers = Array.from({ length: 5 }, (_, i) => ({ id: `p${p}f${i}` }));
      const matches: any[] = [];
      for (let i = 0; i < 5; i++)
        for (let j = i + 1; j < 5; j++)
          matches.push({
            id: `p${p}m${i}${j}`,
            poolId: `p${p}`,
            fencerA: fencers[i],
            fencerB: fencers[j],
            status: MatchStatus.NOT_STARTED,
          });
      return { id: `p${p}`, matches };
    });
  const makeArenas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Piste ${i + 1}`, available: true }));

  it('fin estimée = fin du dernier match planifié, pas maintenant', async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const pools = makePools();
    const res = await manager.optimizeTournamentFlow({} as any, pools, makeArenas(4));
    const insights = manager.generatePredictiveInsights({} as any, pools, res.schedule);
    const lastEnd = Math.max(
      ...res.schedule.map(s => s.scheduledTime.getTime() + s.estimatedDuration * 60000)
    );
    expect(insights.estimatedFinishTime.getTime()).toBe(lastEnd);
    expect(insights.estimatedFinishTime.getTime()).toBeGreaterThan(Date.now() + 30 * 60000);
  });

  it('pas de « pistes sous-utilisées » quand toutes les pistes servent', async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    // Une piste par poule : 2 poules → 2 pistes
    const arenas = makeArenas(2);
    const res = await manager.optimizeTournamentFlow({} as any, makePools(), arenas);
    const recos = manager.getFlowRecommendations(res.schedule, arenas);
    expect(recos.some(r => r.includes('piste'))).toBe(false);
  });

  it('signale les pistes inutilisées quand il y en a trop', async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const arenas = makeArenas(10);
    const res = await manager.optimizeTournamentFlow({} as any, makePools(), arenas);
    const recos = manager.getFlowRecommendations(res.schedule, arenas);
    expect(recos.some(r => r.includes('inutilisée'))).toBe(true);
  });

  it("calcule l'attente des tireurs entre deux matchs", async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const res = await manager.optimizeTournamentFlow({} as any, makePools(), makeArenas(1));
    // 1 piste pour 20 matchs : attentes longues signalées
    expect(res.metrics.maxFencerWait).toBeGreaterThan(DEFAULT_TOURNAMENT_CONFIG.maxWaitTime);
    expect(res.metrics.fencersOverMaxWait).toBeGreaterThan(0);
    expect(
      manager.getFlowRecommendations(res.schedule, makeArenas(1)).some(r => r.includes('⏰'))
    ).toBe(true);
  });
});

describe('TournamentFlowManager — ordre officiel des poules (#1018)', () => {
  const makePool = (p: number, size: number): any => {
    const fencers = Array.from({ length: size }, (_, i) => ({ id: `p${p}f${i}` }));
    const matches: any[] = [];
    // Ordre volontairement non trié : le planning doit le conserver tel quel
    for (let i = size - 1; i >= 0; i--)
      for (let j = 0; j < i; j++)
        matches.push({
          id: `p${p}m${i}${j}`,
          poolId: `p${p}`,
          fencerA: fencers[i],
          fencerB: fencers[j],
          status: MatchStatus.NOT_STARTED,
        });
    return { id: `p${p}`, fencers, matches };
  };
  const arenas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Piste ${i + 1}`, available: true }));

  it('conserve l’ordre des matchs de chaque poule, une piste par poule', async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const pools = [makePool(0, 5), makePool(1, 4)];
    const res = await manager.optimizeTournamentFlow({} as any, pools, arenas(3));
    for (const pool of pools) {
      const slots = res.schedule.filter(s => s.match.poolId === pool.id);
      expect(slots.map(s => s.match.id)).toEqual(pool.matches.map((m: any) => m.id));
      expect(new Set(slots.map(s => s.arenaId)).size).toBe(1);
    }
    expect(manager.getFlowRecommendations(res.schedule, arenas(3), res.metrics)).toContainEqual(
      expect.stringContaining('1 piste(s) inutilisée(s) : 2 piste(s) suffisent')
    );
  });

  it('attente calculée sur la poule la plus grande, selon son ordre', async () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    // Poule de 3 : A-B, A-C, B-C → A attend 0, B attend 1 match, C attend 0
    const [a, b, c] = ['a', 'b', 'c'].map(id => ({ id }));
    const small: any = {
      id: 'small',
      fencers: [a, b, c],
      matches: [
        { id: 's1', fencerA: a, fencerB: b, status: MatchStatus.NOT_STARTED },
        { id: 's2', fencerA: a, fencerB: c, status: MatchStatus.NOT_STARTED },
        { id: 's3', fencerA: b, fencerB: c, status: MatchStatus.NOT_STARTED },
      ],
    };
    const res = await manager.optimizeTournamentFlow({} as any, [small], arenas(1));
    expect(res.metrics.averageWaitTime).toBe(5); // (0 + 15 + 0) / 3
    expect(res.metrics.maxFencerWait).toBe(15);

    const withLarger = await manager.optimizeTournamentFlow(
      {} as any,
      [small, makePool(1, 6)],
      arenas(2)
    );
    expect(withLarger.metrics.averageWaitTime).not.toBe(5);
  });
});

describe('TournamentFlowManager — planning du tableau (#1018)', () => {
  const F = (id: string) => ({ id });
  const m = (round: number, position: number, a: any, b: any, winner: any = null): any => ({
    id: `${round}-${position}`,
    round,
    position,
    fencerA: a,
    fencerB: b,
    winner,
    isBye: false,
  });
  const arenas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `Piste ${i + 1}`, available: true }));

  it('compte les duels prêts et en attente, enchaîne les tours', () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const bracket = [
      m(8, 0, F('a'), F('b')),
      m(8, 1, F('c'), F('d')),
      m(8, 2, F('e'), F('f'), F('e')),
      m(8, 3, F('g'), F('h')),
      m(4, 0, null, null),
      m(4, 1, F('e'), null),
      m(2, 0, null, null),
    ];
    const now = new Date('2026-01-01T10:00:00Z');
    const res = manager.optimizeTableauFlow([bracket], arenas(4), now);
    expect(res.readyCount).toBe(3);
    expect(res.waitingCount).toBe(3);
    expect(res.schedule).toHaveLength(6);
    expect(res.maxConcurrent).toBe(3);
    // Quarts 15 min, repos 10, demis 15, repos 10, finale 15
    expect(res.estimatedFinishTime.getTime() - now.getTime()).toBe(65 * 60000);
    expect(res.recommendations.some(r => r.includes('inutilisée'))).toBe(true);
  });

  it('une seule piste : les duels se suivent', () => {
    const manager = new TournamentFlowManager(DEFAULT_TOURNAMENT_CONFIG);
    const bracket = [m(4, 0, F('a'), F('b')), m(4, 1, F('c'), F('d')), m(2, 0, null, null)];
    const now = new Date('2026-01-01T10:00:00Z');
    const res = manager.optimizeTableauFlow([bracket], arenas(1), now);
    // Demis 0-15 et 15-30, repos 10 min, finale 40-55
    expect(res.estimatedFinishTime.getTime() - now.getTime()).toBe(55 * 60000);
  });
});
