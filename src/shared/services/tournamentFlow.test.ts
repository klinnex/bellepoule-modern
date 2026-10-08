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
    expect(DEFAULT_TOURNAMENT_CONFIG.maxWaitTime).toBe(30);
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
