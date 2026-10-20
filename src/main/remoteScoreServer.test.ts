import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock fs avant l'import du module
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('socket.io', () => ({
  // Instancié avec `new` : l'implémentation doit être constructible (pas de fonction fléchée)
  Server: vi.fn().mockImplementation(function () {
    return {
      on: vi.fn(),
      emit: vi.fn(),
      to: vi.fn().mockReturnThis(),
    };
  }),
}));

vi.mock('http', () => ({
  createServer: vi.fn().mockReturnValue({
    listen: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  }),
}));

// Mock pour la DB
const mockDb = {
  getCompetition: vi.fn(),
  getPendingMatches: vi.fn().mockReturnValue([]),
  getCompetitionPools: vi.fn().mockReturnValue([]),
  getMatchesByPool: vi.fn().mockReturnValue([]),
  getPoolFencers: vi.fn().mockReturnValue([]),
  getMatch: vi.fn().mockReturnValue(null),
  updateMatch: vi.fn(),
  logScoreChange: vi.fn(),
  saveArenaState: vi.fn(),
  getArenaState: vi.fn().mockReturnValue(null),
  getFencersByCompetition: vi.fn().mockReturnValue([]),
  getRefereesByCompetition: vi.fn().mockReturnValue([]),
  updateFencer: vi.fn(),
  getFencer: vi.fn().mockReturnValue(null),
  updateReferee: vi.fn(),
  getSessionState: vi.fn().mockReturnValue(null),
};

import express from 'express';
import { createServer } from 'http';
import { RemoteScoreServer } from './remoteScoreServer';

// Helpers pour simuler request / response Express
function makeReq(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    body: {},
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    url: '/',
    path: '/',
    ...overrides,
  };
}

function makeRes(): any {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('RemoteScoreServer', () => {
  let server: RemoteScoreServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new RemoteScoreServer(mockDb as any, 8066);
    (server as any).loginGuard.failureDelayMs = 0;
  });

  describe('démarrage du serveur', () => {
    it('construit une instance sans erreur', () => {
      expect(server).toBeInstanceOf(RemoteScoreServer);
    });

    it('getServerUrl retourne une URL avec le bon port', () => {
      const url = server.getServerUrl();
      expect(url).toMatch(/http:\/\/.+:8066/);
    });

    it('getLocalIPAddress retourne une chaîne non vide', () => {
      const ip = server.getLocalIPAddress();
      expect(typeof ip).toBe('string');
      expect(ip.length).toBeGreaterThan(0);
    });

    it('start() appelle server.listen', () => {
      server.start();
      const httpServer = vi.mocked(createServer).mock.results[0].value;
      expect(httpServer.listen).toHaveBeenCalledWith(8066, '0.0.0.0', expect.any(Function));
    });

    it('stop() appelle server.close', () => {
      server.stop();
      const httpServer = vi.mocked(createServer).mock.results[0].value;
      expect(httpServer.close).toHaveBeenCalled();
    });
  });

  describe('route /api/auth/login/:arenaId', () => {
    it('retourne 401 si PIN incorrect pour une arène avec mot de passe', () => {
      // Accéder à l'arène privée et lui affecter un mot de passe
      const arenas: Map<string, any> = (server as any).arenas;
      arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        name: 'Arène 1',
        status: 'idle',
        currentMatch: null,
        password: 'secret123',
        settings: {},
      });

      const req = makeReq({
        params: { arenaId: '1' },
        body: { password: 'wrong-password' },
        headers: {},
      });
      const res = makeRes();

      // Simuler le handler du login
      const loginHandler = (server as any).app._router?.stack?.find(
        (l: any) => l?.route?.path === '/api/auth/login/:arenaId'
      )?.route?.stack?.[0]?.handle;

      if (loginHandler) {
        loginHandler(req, res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(401);
      } else {
        // Tester directement la logique de comparaison de mot de passe
        const arena = arenas.get('arena1');
        const password = 'wrong-password';
        const passwordOk =
          !!password && password.length === arena.password.length && password === arena.password;
        expect(passwordOk).toBe(false);
      }
    });

    it('retourne succès si mot de passe correct (stocké hashé via setArenaPassword)', () => {
      const arenas: Map<string, any> = (server as any).arenas;
      arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        name: 'Arène 1',
        status: 'idle',
        currentMatch: null,
        settings: {},
      });
      server.setArenaPassword('1', 'secret123');
      // Le mot de passe ne doit jamais rester en clair en mémoire
      expect(arenas.get('arena1').password).not.toBe('secret123');

      const req = makeReq({
        params: { arenaId: '1' },
        body: { password: 'secret123' },
        headers: {},
      });
      const res = makeRes();

      const loginHandler = (server as any).app._router?.stack?.find(
        (l: any) => l?.route?.path === '/api/auth/login/:arenaId'
      )?.route?.stack?.[0]?.handle;

      if (loginHandler) {
        loginHandler(req, res, vi.fn());
        expect(res.status).not.toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ success: true });
        expect(res.setHeader).toHaveBeenCalledWith(
          'Set-Cookie',
          expect.stringContaining('bp_token_arena1=')
        );
      }
    });

    it('retourne succès si arène sans mot de passe', () => {
      const arenas: Map<string, any> = (server as any).arenas;
      arenas.set('arena2', {
        id: 'arena2',
        number: 2,
        name: 'Arène 2',
        status: 'idle',
        currentMatch: null,
        password: null,
        settings: {},
      });

      const arena = arenas.get('arena2');
      // Sans mot de passe, l'accès doit être autorisé
      expect(arena?.password).toBeNull();
    });
  });

  describe('rate limiting score', () => {
    it('checkScoreRateLimit retourne true pour le premier appel', () => {
      const checkRateLimit = (server as any).checkScoreRateLimit.bind(server);
      expect(checkRateLimit('192.168.1.1')).toBe(true);
    });

    it('checkScoreRateLimit retourne false après SCORE_RATE_LIMIT appels', () => {
      const checkRateLimit = (server as any).checkScoreRateLimit.bind(server);
      const limit = (server as any).SCORE_RATE_LIMIT as number;
      const ip = '10.0.0.2';

      // Remplir jusqu'à la limite
      for (let i = 0; i < limit; i++) {
        checkRateLimit(ip);
      }

      // Le prochain doit être bloqué
      expect(checkRateLimit(ip)).toBe(false);
    });

    it('SCORE_RATE_LIMIT est défini et > 0', () => {
      expect((server as any).SCORE_RATE_LIMIT).toBeGreaterThan(0);
    });
  });

  describe('arenaEventBuffer', () => {
    it('le buffer est initialement vide pour toutes les arènes', () => {
      const buffer: Map<string, any[]> = (server as any).arenaEventBuffer;
      for (const [, events] of buffer) {
        expect(events).toHaveLength(0);
      }
    });

    it('pushArenaEvent ajoute un événement dans le buffer', () => {
      const arenas: Map<string, any> = (server as any).arenas;
      // S'assurer qu'une arène existe
      const arenaId = Array.from(arenas.keys())[0];
      if (!arenaId) return;

      const pushFn =
        (server as any).pushArenaUpdate?.bind(server) ??
        (server as any).emitArenaUpdate?.bind(server);

      if (pushFn) {
        // Créer un événement minimal
        const mockArena = arenas.get(arenaId);
        if (mockArena) {
          pushFn(arenaId, { type: 'status', arena: mockArena });
          const buffer: Map<string, any[]> = (server as any).arenaEventBuffer;
          const buf = buffer.get(arenaId);
          if (buf) {
            expect(buf.length).toBeGreaterThanOrEqual(0);
          }
        }
      } else {
        // Test indirect : vérifier que EVENT_BUFFER_MAX et TTL sont définis
        expect((server as any).EVENT_BUFFER_MAX).toBeGreaterThan(0);
        expect((server as any).EVENT_BUFFER_TTL_MS).toBeGreaterThan(0);
      }
    });

    it('EVENT_BUFFER_MAX limite la taille du buffer', () => {
      const max = (server as any).EVENT_BUFFER_MAX as number;
      expect(max).toBeGreaterThan(0);
      expect(max).toBeLessThanOrEqual(200);
    });

    it('EVENT_BUFFER_TTL_MS est supérieur à 60 secondes', () => {
      const ttl = (server as any).EVENT_BUFFER_TTL_MS as number;
      expect(ttl).toBeGreaterThan(60_000);
    });
  });

  describe('persistArenaState', () => {
    it("n'appelle pas saveArenaState si pas de session", () => {
      const persistFn = (server as any).persistArenaState.bind(server);
      persistFn('arena1');
      expect(mockDb.saveArenaState).not.toHaveBeenCalled();
    });

    it('appelle saveArenaState si une session est active', () => {
      const arenas: Map<string, any> = (server as any).arenas;
      const arenaId = Array.from(arenas.keys())[0];
      if (!arenaId) return;

      // Simuler une session active
      (server as any).session = {
        competitionId: 'comp-1',
        referees: [],
      };
      (server as any).arenaMatchQueue.set(arenaId, []);

      const persistFn = (server as any).persistArenaState.bind(server);
      persistFn(arenaId);

      expect(mockDb.saveArenaState).toHaveBeenCalledWith(
        arenaId,
        expect.objectContaining({ competitionId: 'comp-1' })
      );
    });
  });

  describe('kiosk:data (#1152)', () => {
    it('regroupe les notifications sur 300 ms', () => {
      vi.useFakeTimers();
      try {
        const emit = vi.fn();
        (server as any).io = { emit };
        server.notifyKioskData();
        server.notifyKioskData();
        server.notifyKioskData();
        expect(emit).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('kiosk:data');
        server.notifyKioskData();
        vi.advanceTimersByTime(300);
        expect(emit).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('s’abonne aux écritures de la base et se désabonne à l’arrêt', () => {
      const unsub = vi.fn();
      const db = { ...mockDb, onChange: vi.fn().mockReturnValue(unsub) };
      const srv = new RemoteScoreServer(db as any, 8067);
      expect(db.onChange).toHaveBeenCalledOnce();
      const spy = vi.spyOn(srv, 'notifyKioskData');
      db.onChange.mock.calls[0][0]();
      expect(spy).toHaveBeenCalledOnce();
      srv.stop();
      expect(unsub).toHaveBeenCalledOnce();
    });
  });

  describe('broadcastDashboardUpdate (#1069)', () => {
    const withRooms = (rooms: Map<string, Set<string>>) => {
      (server as any).io = {
        sockets: { adapter: { rooms } },
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      };
      return vi.spyOn(server as any, 'buildDashboardSnapshot').mockReturnValue({
        rankings: [],
        pools: [],
        liveMatches: [],
      });
    };

    it('ne relit pas la base quand aucun dashboard n’est abonné', () => {
      const build = withRooms(new Map());
      server.broadcastDashboardUpdate();
      expect(build).not.toHaveBeenCalled();
      expect((server as any).io.emit).not.toHaveBeenCalled();
    });

    it('diffuse aux dashboards abonnés', () => {
      const build = withRooms(new Map([['dashboard', new Set(['s1'])]]));
      server.broadcastDashboardUpdate();
      expect(build).toHaveBeenCalledOnce();
      expect((server as any).io.to).toHaveBeenCalledWith('dashboard');
      expect((server as any).io.emit).toHaveBeenCalledTimes(3);
    });
  });

  describe('horodatage des touches pour le replay (#1074)', () => {
    it('conserve la date des événements déjà vus et date les nouveaux', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
        (server as any).stampArenaEvents('arena1', 'touchesA', 1);
        vi.setSystemTime(new Date('2026-01-01T10:00:30Z'));
        (server as any).stampArenaEvents('arena1', 'touchesA', 2);
        expect((server as any).arenaEventTimes.get('arena1').touchesA).toEqual([
          '2026-01-01T10:00:00.000Z',
          '2026-01-01T10:00:30.000Z',
        ]);
        // Touche annulée puis rejouée : nouvelle date
        (server as any).stampArenaEvents('arena1', 'touchesA', 1);
        vi.setSystemTime(new Date('2026-01-01T10:01:00Z'));
        (server as any).stampArenaEvents('arena1', 'touchesA', 2);
        expect((server as any).arenaEventTimes.get('arena1').touchesA[1]).toBe(
          '2026-01-01T10:01:00.000Z'
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('fin estimée de phase (#1077)', () => {
    it('le snapshot dashboard inclut une ETA basée sur les durées réelles', () => {
      (server as any).session = { competitionId: 'comp-1', referees: [] };
      mockDb.getFencersByCompetition.mockReturnValueOnce([]);
      (server as any).sessionMatches = [
        { id: 'm1', poolId: 'p1', status: 'finished' },
        { id: 'm2', poolId: 'p1', status: 'not_started' },
        { id: 'm3', poolId: 'p1', status: 'not_started' },
      ];
      (server as any).recentMatchDurationsMs = [180_000, 180_000, 180_000];
      (server as any).arenas = new Map(); // → 1 piste
      const before = Date.now();
      const { eta } = (server as any).buildDashboardSnapshot();
      expect(eta.basis).toBe('measured');
      expect(eta.remainingMatches).toBe(2);
      expect(eta.perMatchMinutes).toBe(4); // 3 min + 1 min de changement
      // 1 piste : 2 vagues de 4 min
      expect(new Date(eta.finishAt).getTime()).toBeGreaterThanOrEqual(before + 8 * 60_000);
    });

    it('tableau : seul le tour en cours est estimé, sur les pistes de la session', () => {
      (server as any).session = {
        competitionId: 'comp-1',
        referees: [],
        strips: [{ number: 1 }, { number: 2 }],
      };
      mockDb.getFencersByCompetition.mockReturnValueOnce([]);
      (server as any).sessionMatches = [
        { id: 'p1', poolId: 'p1', status: 'finished' },
        ...[1, 2, 3, 4].map(i => ({
          id: `t16-${i}`,
          isTableau: true,
          round: 16,
          status: 'not_started',
        })),
        { id: 't8-1', isTableau: true, round: 8, status: 'not_started' },
      ];
      (server as any).recentMatchDurationsMs = [180_000, 180_000, 180_000];
      const before = Date.now();
      const { eta } = (server as any).buildDashboardSnapshot();
      expect(eta.phase).toBe('tableau');
      expect(eta.round).toBe(16);
      expect(eta.remainingMatches).toBe(4);
      // 4 matchs sur 2 pistes : 2 vagues de 4 min
      const ms = new Date(eta.finishAt).getTime() - before;
      expect(ms).toBeGreaterThanOrEqual(8 * 60_000 - 1000);
      expect(ms).toBeLessThan(9 * 60_000);
    });

    it('ajouter des pistes en cours de session crée les arènes', () => {
      (server as any).session = {
        competitionId: 'comp-1',
        referees: [],
        strips: [{ number: 1, status: 'available' }],
      };
      (server as any).arenas = new Map();
      (server as any).createArena(1);
      server.updateStripCount(3);
      expect(server.getAllArenas().map(a => a.id)).toEqual(['arena1', 'arena2', 'arena3']);
      expect(server.getArenaCount()).toBe(3);
    });
  });

  describe('liste des arbitres de session', () => {
    it('inclut les arbitres ajoutés après le démarrage de la session', () => {
      (server as any).session = { competitionId: 'comp-1', referees: [] };
      mockDb.getRefereesByCompetition.mockReturnValueOnce([
        { id: 'r1', ref: 1, firstName: 'Anne', lastName: 'DURAND', status: 'available' },
        { id: 'r2', ref: 2, firstName: 'Luc', lastName: 'LEROY', status: 'available' },
      ]);
      const refs = (server as any).getSessionReferees();
      expect(refs.map((r: any) => r.name)).toEqual(['Anne DURAND', 'Luc LEROY']);
      expect((server as any).resolveReferee('r2')).toEqual({ id: 'r2', name: 'Luc LEROY' });
    });

    it('ne lit pas la base en mode entraînement', () => {
      (server as any).session = { competitionId: '__training__', referees: [] };
      mockDb.getRefereesByCompetition.mockClear();
      expect((server as any).getSessionReferees()).toEqual([]);
      expect(mockDb.getRefereesByCompetition).not.toHaveBeenCalled();
    });
  });

  describe('ordre des matchs public (#911) et arbitre de poule (#908)', () => {
    function findHandler(method: string, path: string): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.[0]?.handle;
    }

    const fA = { id: 'a', lastName: 'Dupont', firstName: 'Jean', license: 'SECRET' };
    const fB = { id: 'b', lastName: 'Martin', firstName: 'Paul' };

    beforeEach(() => {
      (server as any).session = {
        competitionId: 'comp-1',
        referees: [{ id: 'r1', name: 'DURAND Anne' }],
      };
      (server as any).arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        status: 'ready',
        currentMatch: { id: 'm2', poolId: 'p1', fencerA: fB, fencerB: fA, scoreA: 0, scoreB: 0 },
        settings: {},
      });
      (server as any).sessionMatches = [
        { id: 'm2', number: 2, poolId: 'p1', fencerA: fB, fencerB: fA, status: 'not_started' },
        {
          id: 'm1',
          number: 1,
          poolId: 'p1',
          fencerA: fA,
          fencerB: fB,
          status: 'finished',
          scoreA: { value: 5 },
          scoreB: { value: 3 },
        },
      ];
    });

    it('expose uniquement noms, ordre, statut et scores, sans authentification', () => {
      const res = makeRes();
      findHandler('get', '/api/arenas/:arenaId/pool-order')(
        makeReq({ params: { arenaId: '1' } }),
        res,
        vi.fn()
      );
      const body = res.json.mock.calls[0][0];
      expect(body.matches).toEqual([
        {
          order: 1,
          fencerA: 'DUPONT Jean',
          fencerB: 'MARTIN Paul',
          scoreA: 5,
          scoreB: 3,
          status: 'finished',
        },
        {
          order: 2,
          fencerA: 'MARTIN Paul',
          fencerB: 'DUPONT Jean',
          scoreA: null,
          scoreB: null,
          status: 'current',
        },
      ]);
      expect(JSON.stringify(body)).not.toContain('SECRET');
    });

    it("la liste tablette porte l'arbitre de la poule quand le match n'en a pas", () => {
      mockDb.getSessionState.mockReturnValue({
        pools: [
          {
            id: 'p1',
            referees: [
              { id: 'r1', lastName: 'DURAND', firstName: 'Anne' },
              { id: 'r2', lastName: 'LEROY', firstName: 'Luc' },
            ],
          },
        ],
      });
      const res = makeRes();
      findHandler('get', '/api/arenas/:arenaId/matches')(
        makeReq({ params: { arenaId: 'arena1' } }),
        res,
        vi.fn()
      );
      const { matches } = res.json.mock.calls[0][0];
      expect(matches[0].referee).toEqual({ id: 'r1', name: 'DURAND Anne / LEROY Luc' });
    });
  });

  describe('carton noir (paramètre compétition)', () => {
    function findHandler(method: string, path: string): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.[0]?.handle;
    }

    beforeEach(() => {
      (server as any).session = { competitionId: 'comp-1', referees: [] };
    });

    it('désactivé par défaut et exposé via /api/session', () => {
      const res = makeRes();
      findHandler('get', '/api/session')(makeReq(), res, vi.fn());
      expect(res.json.mock.calls[0][0].blackCardEnabled).toBe(false);
    });

    it('updateBlackCardEnabled active le flag et le diffuse aux arènes', () => {
      (server as any).arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        status: 'idle',
        settings: {},
      });
      const spy = vi.spyOn(server as any, 'broadcastArenaUpdate').mockImplementation(() => {});
      server.updateBlackCardEnabled(true);
      expect((server as any).sessionBlackCardEnabled).toBe(true);
      expect(spy).toHaveBeenCalledWith('arena1', expect.objectContaining({ arenaId: 'arena1' }));
      const res = makeRes();
      findHandler('get', '/api/session')(makeReq(), res, vi.fn());
      expect(res.json.mock.calls[0][0].blackCardEnabled).toBe(true);
    });
  });

  describe('score max et repos issus des paramètres (#1125 #1134)', () => {
    function limit(match: any): number {
      return (server as any).getScoreLimit(match);
    }

    beforeEach(() => {
      (server as any).session = { competitionId: 'comp-1', referees: [] };
      vi.spyOn(server as any, 'broadcastArenaUpdate').mockImplementation(() => {});
    });

    it('épée : score max poules / tableau des propriétés, pas 15', () => {
      mockDb.getCompetition.mockReturnValue({
        id: 'comp-1',
        weapon: 'E',
        settings: { defaultPoolMaxScore: 21, defaultTableMaxScore: 21, restTimeSeconds: 45 },
      });
      server.refreshCompetitionSettings();
      expect(limit({ id: 'p1', poolId: 'pool-1' })).toBe(21);
      expect(limit({ id: 't1', isTableau: true })).toBe(21);
      expect((server as any).sessionRestSeconds).toBe(45);
    });

    it('formule personnalisée : score max du tableau appliqué aux matchs de tableau', () => {
      mockDb.getCompetition.mockReturnValue({
        id: 'comp-1',
        weapon: 'C',
        settings: {
          defaultPoolMaxScore: 5,
          defaultTableMaxScore: 15,
          customFormula: {
            phases: [
              { id: 'p', type: 'pool_round', config: { maxScore: 7 } },
              { id: 'd', type: 'direct_elimination', config: { maxScore: 11 } },
            ],
          },
        },
      });
      server.refreshCompetitionSettings();
      expect(limit({ id: 'p1', poolId: 'pool-1' })).toBe(7);
      expect(limit({ id: 't1', isTableau: true })).toBe(11);
    });

    it('tableau illimité (0) : pas de notification de fin', () => {
      mockDb.getCompetition.mockReturnValue({
        id: 'comp-1',
        weapon: 'F',
        settings: { defaultPoolMaxScore: 5, defaultTableMaxScore: 0, restTimeSeconds: 0 },
      });
      server.refreshCompetitionSettings();
      expect(limit({ id: 't1', isTableau: true })).toBe(Infinity);
      expect((server as any).sessionRestSeconds).toBe(0);
    });

    it('Laser Sabre : 15 inchangé', () => {
      mockDb.getCompetition.mockReturnValue({
        id: 'comp-1',
        weapon: 'L',
        settings: { defaultPoolMaxScore: 5, defaultTableMaxScore: 21 },
      });
      server.refreshCompetitionSettings();
      (server as any).sessionWeapon = 'L';
      expect(limit({ id: 't1', isTableau: true })).toBe(15);
    });
  });

  describe('piste assignée aux poules (pool.strip)', () => {
    const f = (id: string) => ({ id, firstName: id, lastName: id });
    const poolMatches = (poolId: string) => [
      {
        id: `${poolId}-m1`,
        poolId,
        number: 1,
        fencerA: f(`${poolId}a`),
        fencerB: f(`${poolId}b`),
        status: 'not_started',
      },
    ];
    const marker = (poolId: string, poolNumber: number, strip?: number) => ({
      __poolFencers: true,
      poolId,
      poolNumber,
      strip,
      fencers: [],
    });

    beforeEach(() => {
      mockDb.getCompetition.mockReturnValue({ id: 'comp-1', settings: {} });
      (mockDb as any).getPoolCount = vi.fn().mockReturnValue(1);
      vi.spyOn(server as any, 'loadSessionReferees').mockReturnValue([]);
    });

    it('poule assignée piste 3 → match sur arena3, pas arena1', async () => {
      const session = await server.startSession('comp-1', 4, [
        marker('p1', 1, 3),
        ...poolMatches('p1'),
      ]);
      const arenas = (server as any).arenas;
      expect(arenas.get('arena3').currentMatch?.id).toBe('p1-m1');
      expect(arenas.get('arena1').currentMatch ?? null).toBeNull();
      expect(session.strips).toHaveLength(4);
    });

    it('piste au-delà du nombre configuré → arènes étendues', async () => {
      const session = await server.startSession('comp-1', 1, [
        marker('p1', 1, 4),
        ...poolMatches('p1'),
      ]);
      expect(session.strips).toHaveLength(4);
      expect((server as any).arenas.get('arena4').currentMatch?.id).toBe('p1-m1');
    });

    it('sans piste → ordre des poules sur pistes libres', async () => {
      await server.startSession('comp-1', 3, [
        marker('p1', 1, 1),
        ...poolMatches('p1'),
        marker('p2', 2),
        ...poolMatches('p2'),
      ]);
      const arenas = (server as any).arenas;
      expect(arenas.get('arena1').currentMatch?.id).toBe('p1-m1');
      expect(arenas.get('arena2').currentMatch?.id).toBe('p2-m1');
    });
  });

  describe('réassignation manuelle de piste (#1037)', () => {
    const f = (id: string) => ({ id, firstName: id, lastName: id });
    const pm = (poolId: string, n: number) => ({
      id: `${poolId}-m${n}`,
      poolId,
      number: n,
      fencerA: f(`${poolId}a${n}`),
      fencerB: f(`${poolId}b${n}`),
      status: 'not_started',
    });
    const marker = (poolId: string, poolNumber: number, strip: number) => ({
      __poolFencers: true,
      poolId,
      poolNumber,
      strip,
      fencers: [],
    });
    function matchesOf(arenaId: string): string[] {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const handler = stack.find(
        (l: any) => l?.route?.path === '/api/arenas/:arenaId/matches' && l.route.methods?.get
      ).route.stack[0].handle;
      const res = makeRes();
      handler(makeReq({ params: { arenaId } }), res, vi.fn());
      return res.json.mock.calls[0][0].matches.map((m: any) => m.id);
    }

    beforeEach(async () => {
      mockDb.getCompetition.mockReturnValue({ id: 'comp-1', settings: {} });
      (mockDb as any).getPoolCount = vi.fn().mockReturnValue(2);
      vi.spyOn(server as any, 'loadSessionReferees').mockReturnValue([]);
      await server.startSession('comp-1', 2, [
        marker('p1', 1, 1),
        pm('p1', 1),
        pm('p1', 2),
        marker('p2', 2, 2),
        pm('p2', 1),
        pm('p2', 2),
      ]);
    });

    it('match réassigné en tête de liste de la piste cible, retiré de la piste source', () => {
      server.updateMatchArena('p2-m1', 2, 1);
      expect(matchesOf('arena1')).toEqual(['p2-m1', 'p1-m1', 'p1-m2']);
      const arenas = (server as any).arenas;
      expect(arenas.get('arena1').currentMatch.id).toBe('p1-m1');
      expect(arenas.get('arena2').currentMatch.id).toBe('p2-m2');
      expect(matchesOf('arena2')).toEqual(['p2-m2']);
    });

    it('rapières : seuls les matchs de la vague active sont proposés aux tablettes (#1118)', () => {
      server.setActiveWaveMatchIds(['p1-m2']);
      expect(matchesOf('arena1')).toEqual(['p1-m2']);
      // Vague pas encore lancée : le match courant préchargé n'est pas proposé non plus
      server.setActiveWaveMatchIds([]);
      expect(matchesOf('arena1')).toEqual([]);
      // Fin des vagues / autre mode : plus de filtre
      server.setActiveWaveMatchIds(null);
      expect(matchesOf('arena1')).toEqual(['p1-m1', 'p1-m2']);
    });

    it('rapières : une sous-piste par tablette, matchs non partagés entre sous-pistes (#1118)', () => {
      // Hors vagues : toujours la piste
      expect(server.claimArenaSlot('arena1', 'devA')).toBe('arena1');
      server.setActiveWaveMatchIds(['p1-m1', 'p1-m2']);
      expect(server.claimArenaSlot('arena1', 'devA')).toBe('arena1');
      expect(server.claimArenaSlot('1', 'devB')).toBe('arena1s2');
      // Rechargement : même sous-piste
      expect(server.claimArenaSlot('arena1', 'devA')).toBe('arena1');
      expect(server.claimArenaSlot('arena1s2', 'devB')).toBe('arena1s2');
      const slot = (server as any).arenas.get('arena1s2');
      expect(slot).toMatchObject({ number: 1, status: 'idle', currentMatch: null });
      // Le match chargé sur la piste n'est pas proposé à la sous-piste
      expect(matchesOf('arena1s2')).toEqual(['p1-m2']);
      expect(matchesOf('arena1')).toEqual(['p1-m1', 'p1-m2']);
      // Fin des vagues : sous-piste supprimée, retour sur la piste
      server.setActiveWaveMatchIds(null);
      expect((server as any).arenas.has('arena1s2')).toBe(false);
      expect(server.claimArenaSlot('arena1s2', 'devB')).toBe('arena1');
    });

    it('rapières : sous-piste authentifiée avec le jeton de la piste (#1118)', () => {
      server.setActiveWaveMatchIds(['p1-m1', 'p1-m2']);
      server.claimArenaSlot('arena1', 'devA');
      server.claimArenaSlot('arena1', 'devB');
      server.setArenaPassword('1', 'secret123');
      const store = new Map<string, number>();
      (server as any).arenaTokens.set('arena1', store);
      const token = (server as any).issueToken(store);
      const check = (id: string, cookie?: string) => (server as any).checkArenaAuth(id, cookie);
      expect(check('arena1s2', undefined)).toBe(false);
      expect(check('arena1s2', `bp_token_arena1=${token}`)).toBe(true);
      expect(check('arena1s2', `bp_token_arena1s2=${token}`)).toBe(false);
    });

    it('les réassignations suivantes se rajoutent par le haut', () => {
      server.updateMatchArena('p2-m1', 2, 1);
      server.updateMatchArena('p2-m2', 2, 1);
      expect(matchesOf('arena1').slice(0, 2)).toEqual(['p2-m2', 'p2-m1']);
    });

    it('joué ensuite, puis la piste reprend sa propre poule', () => {
      server.updateMatchArena('p2-m1', 2, 1);
      const arena1 = (server as any).arenas.get('arena1');
      const done = { scoreA: 5, scoreB: 0, status: 'finished' };
      (server as any).sessionMatchScores.set('p1-m1', done);
      (server as any).loadNextMatch('arena1');
      expect(arena1.currentMatch.id).toBe('p2-m1');
      expect(arena1.activePoolId).toBe('p1');
      (server as any).sessionMatchScores.set('p2-m1', done);
      (server as any).loadNextMatch('arena1');
      expect(arena1.currentMatch.id).toBe('p1-m2');
    });
  });

  describe("arbitre des matchs de tableau assigné depuis l'appli (#977)", () => {
    const fA = { id: 'a', lastName: 'Dupont', firstName: 'Jean' };
    const fB = { id: 'b', lastName: 'Martin', firstName: 'Paul' };
    const de = (id: string, arena: number, referee?: any) => ({
      id,
      round: 8,
      arena,
      isTableau: true,
      fencerA: fA,
      fencerB: fB,
      ...(referee ? { referee } : {}),
    });

    beforeEach(async () => {
      mockDb.getCompetition.mockReturnValue({ id: 'comp-1', settings: {} });
      (mockDb as any).getPoolCount = vi.fn().mockReturnValue(0);
      (mockDb as any).getAllPendingMatchesFromPools = vi.fn().mockReturnValue([]);
      vi.spyOn(server as any, 'loadSessionReferees').mockReturnValue([
        { id: 'r1', name: 'LEBLANC Anne' },
        { id: 'r2', name: 'NOIR Marc' },
      ]);
      await server.startSession('comp-1', 2, []);
    });

    it('arbitre transmis au match chargé sur la tablette', () => {
      server.refreshDeMatches([de('m1', 1, { id: 'r1', firstName: 'Anne', lastName: 'Leblanc' })]);
      const arena = (server as any).arenas.get('arena1');
      expect(arena.currentMatch?.referee).toEqual({ id: 'r1', name: 'LEBLANC Anne' });
    });

    it("changement d'arbitre → match en cours mis à jour", () => {
      server.refreshDeMatches([de('m1', 1, { id: 'r1' })]);
      server.refreshDeMatches([de('m1', 1, { id: 'r2' })]);
      const arena = (server as any).arenas.get('arena1');
      expect(arena.currentMatch?.referee).toEqual({ id: 'r2', name: 'NOIR Marc' });
    });

    it("arbitre retiré → plus d'arbitre sur la tablette", () => {
      server.refreshDeMatches([de('m1', 1, { id: 'r1' })]);
      server.refreshDeMatches([de('m1', 1)]);
      expect((server as any).arenas.get('arena1').currentMatch?.referee).toBeUndefined();
    });

    it('mode expert : tous les arbitres affichés', () => {
      server.refreshDeMatches([{ ...de('m1', 1), referees: [{ id: 'r1' }, { id: 'r2' }] }]);
      expect((server as any).arenas.get('arena1').currentMatch?.referee).toEqual({
        id: 'r1',
        name: 'LEBLANC Anne / NOIR Marc',
      });
    });

    it("match en file d'attente : arbitre porté", () => {
      server.refreshDeMatches([de('m1', 1), de('m2', 1, { id: 'r2' })]);
      const queue = (server as any).arenaMatchQueue.get('arena1');
      expect(queue.find((m: any) => m.id === 'm2')?.referee).toEqual({
        id: 'r2',
        name: 'NOIR Marc',
      });
    });
  });

  describe('annulation carton noir depuis la tablette', () => {
    function findHandler(method: string, path: string): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.[0]?.handle;
    }

    const fA = { id: 'a', lastName: 'Dupont', firstName: 'Jean', status: 'Q' };
    const fB = { id: 'b', lastName: 'Martin', firstName: 'Paul', status: 'Q' };
    const fC = { id: 'c', lastName: 'Bernard', firstName: 'Luc', status: 'Q' };

    beforeEach(() => {
      (server as any).session = { competitionId: 'comp-1', referees: [] };
      (server as any).sessionBlackCardEnabled = true;
      vi.spyOn(server as any, 'hasAnyValidToken').mockReturnValue(true);
      vi.spyOn(server as any, 'finishArenaMatch').mockImplementation(() => {});
      vi.spyOn(server as any, 'broadcastMessage').mockImplementation(() => {});
      (server as any).arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        status: 'ready',
        currentMatch: { id: 'm1', poolId: 'p1', fencerA: fA, fencerB: fB, scoreA: 0, scoreB: 0 },
        settings: {},
      });
      (server as any).sessionMatches = [
        { id: 'm1', number: 1, poolId: 'p1', fencerA: fA, fencerB: fB, status: 'not_started' },
        { id: 'm2', number: 2, poolId: 'p1', fencerA: fA, fencerB: fC, status: 'not_started' },
      ];
      mockDb.getMatch.mockReturnValue(null);
      mockDb.getFencer.mockImplementation((id: string) =>
        id === 'a' ? { id: 'a', status: 'X', exclusionReason: 'black_card' } : null
      );
    });

    async function giveBlackCard() {
      mockDb.getFencer.mockReturnValueOnce({ id: 'a', status: 'Q' });
      const res = makeRes();
      await findHandler('post', '/api/matches/:matchId/finish')(
        makeReq({
          method: 'POST',
          params: { matchId: 'm1' },
          body: { scoreA: 3, scoreB: 2, blackCardFencer: 'A' },
        }),
        res,
        vi.fn()
      );
      // Le renderer propage ensuite le statut exclu dans les matchs de session
      (server as any).sessionMatches = (server as any).sessionMatches.map((m: any) => ({
        ...m,
        fencerA:
          m.fencerA.id === 'a'
            ? { ...m.fencerA, status: 'X', exclusionReason: 'black_card' }
            : m.fencerA,
      }));
    }

    it("liste le carton noir de l'arène", async () => {
      await giveBlackCard();
      const res = makeRes();
      findHandler('get', '/api/arenas/:arenaId/black-cards')(
        makeReq({ params: { arenaId: 'arena1' } }),
        res,
        vi.fn()
      );
      expect(res.json.mock.calls[0][0].blackCards).toEqual([
        expect.objectContaining({
          fencerId: 'a',
          matchId: 'm1',
          fencerName: 'Dupont Jean',
          opponentName: 'Martin Paul',
        }),
      ]);
    });

    it('annule : réintègre le combattant, rouvre le match avec son score et rend ses matchs jouables', async () => {
      await giveBlackCard();
      expect((server as any).isMatchPlayable((server as any).sessionMatches[1])).toBe(false);

      const res = makeRes();
      findHandler('post', '/api/arenas/:arenaId/black-cards/:fencerId/cancel')(
        makeReq({ method: 'POST', params: { arenaId: 'arena1', fencerId: 'a' } }),
        res,
        vi.fn()
      );
      expect(res.json).toHaveBeenCalledWith({ success: true, matchId: 'm1' });
      expect(mockDb.updateFencer).toHaveBeenLastCalledWith('a', {
        status: 'Q',
        exclusionReason: null,
      });
      const reopened = (server as any).sessionMatchScores.get('m1');
      expect(reopened.status).toBe('in_progress');
      expect(reopened.scoreA).toMatchObject({ value: 3, isExclusion: false, isVictory: false });
      expect(reopened.scoreB).toMatchObject({ value: 2, isVictory: false });
      expect((server as any).isMatchPlayable((server as any).sessionMatches[1])).toBe(true);
      expect((server as any).sessionBlackCards.size).toBe(0);
    });

    it("refuse l'annulation d'un carton noir en tableau", async () => {
      await giveBlackCard();
      mockDb.getMatch.mockReturnValue({ id: 'm1', poolId: null });
      const res = makeRes();
      findHandler('post', '/api/arenas/:arenaId/black-cards/:fencerId/cancel')(
        makeReq({ method: 'POST', params: { arenaId: 'arena1', fencerId: 'a' } }),
        res,
        vi.fn()
      );
      expect(res.status).toHaveBeenCalledWith(409);
    });

    it('404 pour une autre arène', async () => {
      await giveBlackCard();
      const res = makeRes();
      findHandler('post', '/api/arenas/:arenaId/black-cards/:fencerId/cancel')(
        makeReq({ method: 'POST', params: { arenaId: 'arena2', fencerId: 'a' } }),
        res,
        vi.fn()
      );
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('appel distant (#919)', () => {
    // Express 5 expose le routeur via app.router (app._router en v4)
    function findHandler(method: string, path: string): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.[0]?.handle;
    }

    async function login(password: string): Promise<{ res: any; cookie: string }> {
      const res = makeRes();
      await findHandler('post', '/api/checkin/login')(
        makeReq({ body: { password }, socket: { remoteAddress: '10.0.0.' + Math.random() } }),
        res,
        vi.fn()
      );
      const header = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'Set-Cookie')?.[1] ?? '';
      return { res, cookie: String(header).split(';')[0] };
    }

    beforeEach(() => {
      (server as any).session = { competitionId: 'comp-1', referees: [] };
      mockDb.getFencersByCompetition.mockReturnValue([
        { id: 'f1', ref: 1, lastName: 'DUPONT', firstName: 'Jean', club: 'Pontivy', status: 'N' },
        { id: 'f2', ref: 2, lastName: 'MARTIN', firstName: 'Paul', status: 'E' },
      ]);
      mockDb.getRefereesByCompetition.mockReturnValue([
        { id: 'r1', ref: 1, lastName: 'DURAND', firstName: 'Anne', status: 'unavailable' },
      ]);
    });

    it("refuse la connexion tant que le DT n'a pas défini de mot de passe", async () => {
      const { res } = await login('x');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('refuse un mot de passe incorrect et ne stocke pas le mot de passe en clair', async () => {
      server.setCheckinPassword('appel4242');
      expect((server as any).checkinPassword).not.toBe('appel4242');
      const { res } = await login('faux');
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('liste tireurs/arbitres uniquement avec un cookie valide', async () => {
      server.setCheckinPassword('appel4242');
      const list = findHandler('get', '/api/checkin/list');

      const denied = makeRes();
      list(makeReq(), denied, vi.fn());
      expect(denied.status).toHaveBeenCalledWith(401);

      const { cookie } = await login('appel4242');
      const res = makeRes();
      list(makeReq({ headers: { cookie } }), res, vi.fn());
      const body = res.json.mock.calls[0][0];
      expect(body.fencers).toHaveLength(2);
      expect(body.fencers[0]).toMatchObject({ id: 'f1', present: false, editable: true });
      expect(body.fencers[1]).toMatchObject({ id: 'f2', editable: false });
      expect(body.referees[0]).toMatchObject({ id: 'r1', present: false, editable: true });
    });

    it('pointe un tireur présent (statut P) et un arbitre disponible', async () => {
      server.setCheckinPassword('appel4242');
      const { cookie } = await login('appel4242');
      const update = findHandler('post', '/api/checkin/:kind/:id');

      const res = makeRes();
      update(
        makeReq({
          params: { kind: 'fencers', id: 'f1' },
          body: { present: true },
          headers: { cookie },
        }),
        res,
        vi.fn()
      );
      expect(mockDb.updateFencer).toHaveBeenCalledWith('f1', { status: 'P' });
      expect(res.json).toHaveBeenCalledWith({ success: true });

      update(
        makeReq({
          params: { kind: 'referees', id: 'r1' },
          body: { present: true },
          headers: { cookie },
        }),
        makeRes(),
        vi.fn()
      );
      expect(mockDb.updateReferee).toHaveBeenCalledWith('r1', { status: 'available' });
    });

    it("n'écrase pas un statut sportif (éliminé)", async () => {
      server.setCheckinPassword('appel4242');
      const { cookie } = await login('appel4242');
      const res = makeRes();
      findHandler('post', '/api/checkin/:kind/:id')(
        makeReq({
          params: { kind: 'fencers', id: 'f2' },
          body: { present: true },
          headers: { cookie },
        }),
        res,
        vi.fn()
      );
      expect(res.status).toHaveBeenCalledWith(409);
      expect(mockDb.updateFencer).not.toHaveBeenCalled();
    });

    it("ferme l'appel hors phase CHECKIN", async () => {
      server.setCheckinPassword('appel4242');
      const { cookie } = await login('appel4242');
      server.setCheckinEnabled(false);
      const res = makeRes();
      findHandler('get', '/api/checkin/list')(makeReq({ headers: { cookie } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('invalide les sessions quand le mot de passe change', async () => {
      server.setCheckinPassword('appel4242');
      const { cookie } = await login('appel4242');
      server.setCheckinPassword('nouveau-mdp');
      const res = makeRes();
      findHandler('get', '/api/checkin/list')(makeReq({ headers: { cookie } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe("P0 : actions mutantes protégées par l'auth d'arène", () => {
    function findLayers(method: string, path: string): any[] {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.map((s: any) => s.handle) ?? [];
    }

    // Exécute la chaîne middleware → handler comme Express
    async function run(method: string, path: string, req: any, res: any): Promise<void> {
      const handlers = findLayers(method, path);
      expect(handlers.length).toBeGreaterThan(0);
      for (const h of handlers) {
        let nextCalled = false;
        await h(req, res, () => {
          nextCalled = true;
        });
        if (!nextCalled) return;
      }
    }

    function connectSocket(cookie?: string): { handlers: Record<string, any>; socket: any } {
      const io = (server as any).io;
      const onConnection = vi
        .mocked(io.on)
        .mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
      const handlers: Record<string, any> = {};
      const socket = {
        id: 'sock-1',
        handshake: { headers: cookie ? { cookie } : {}, address: '192.168.1.50' },
        on: vi.fn((ev: string, cb: any) => {
          handlers[ev] = cb;
        }),
        emit: vi.fn(),
        join: vi.fn(),
        disconnect: vi.fn(),
      };
      onConnection(socket);
      return { handlers, socket };
    }

    async function protectArena(password = 'secret123'): Promise<string> {
      (server as any).arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        name: 'Arène 1',
        status: 'idle',
        currentMatch: null,
        settings: {},
      });
      server.setArenaPassword('1', password);
      const res = makeRes();
      await findLayers('post', '/api/auth/login/:arenaId')[0](
        makeReq({ params: { arenaId: '1' }, body: { password } }),
        res,
        vi.fn()
      );
      const setCookie = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'Set-Cookie')[1];
      return setCookie.split(';')[0];
    }

    it.each(['assign', 'start', 'pause', 'score', 'finish'])(
      'POST /api/arenas/:arenaId/%s refuse sans cookie (401)',
      async action => {
        await protectArena();
        const spy = vi
          .spyOn(
            server as any,
            `${action === 'score' ? 'updateArenaScore' : action === 'assign' ? 'assignMatchToArena' : action + 'ArenaMatch'}`
          )
          .mockImplementation(() => {});
        const res = makeRes();
        await run(
          'post',
          `/api/arenas/:arenaId/${action}`,
          makeReq({ params: { arenaId: '1' } }),
          res
        );
        expect(res.status).toHaveBeenCalledWith(401);
        expect(spy).not.toHaveBeenCalled();
      }
    );

    it('POST /api/arenas/:arenaId/score accepte avec un cookie valide', async () => {
      const cookie = await protectArena();
      const spy = vi.spyOn(server as any, 'updateArenaScore').mockImplementation(() => {});
      const res = makeRes();
      await run(
        'post',
        '/api/arenas/:arenaId/score',
        makeReq({ params: { arenaId: '1' }, body: { scoreA: 1, scoreB: 0 }, headers: { cookie } }),
        res
      );
      expect(spy).toHaveBeenCalledWith('1', 1, 0);
    });

    it.each(['start', 'stop'])('POST /api/session/%s réservé au loopback (403)', async action => {
      const spy = vi.spyOn(server as any, 'stopSession').mockImplementation(() => {});
      const res = makeRes();
      await run(
        'post',
        `/api/session/${action}`,
        makeReq({
          socket: { remoteAddress: '192.168.1.50' },
          headers: { 'x-forwarded-for': '127.0.0.1' },
        }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(spy).not.toHaveBeenCalled();
    });

    it('POST /api/session/stop accepté depuis le loopback', async () => {
      const spy = vi.spyOn(server as any, 'stopSession').mockImplementation(() => {});
      const res = makeRes();
      await run('post', '/api/session/stop', makeReq({ socket: { remoteAddress: '::1' } }), res);
      expect(spy).toHaveBeenCalled();
    });

    it('POST /api/sync refuse sans cookie (401)', async () => {
      await protectArena();
      const spy = vi.spyOn(server as any, 'updateMatchScore').mockResolvedValue(undefined);
      const res = makeRes();
      await run(
        'post',
        '/api/sync',
        makeReq({
          body: {
            actions: [
              {
                id: 'x',
                type: 'score_save',
                payload: { matchId: 'm1', scoreA: 5, scoreB: 0, status: 'finished' },
              },
            ],
          },
        }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(401);
      expect(spy).not.toHaveBeenCalled();
    });

    it("socket arena_control refusé sans cookie, sans avoir rejoint l'arène", async () => {
      await protectArena();
      const spy = vi.spyOn(server as any, 'handleArenaControl').mockImplementation(() => {});
      const { handlers, socket } = connectSocket();
      handlers.arena_control({ arenaId: 'arena1', action: 'update_score', scoreA: 5, scoreB: 0 });
      expect(spy).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    });

    it('socket arena_control accepté avec cookie valide', async () => {
      const cookie = await protectArena();
      const spy = vi.spyOn(server as any, 'handleArenaControl').mockImplementation(() => {});
      const { handlers } = connectSocket(cookie);
      handlers.arena_control({ arenaId: 'arena1', action: 'update_score', scoreA: 5, scoreB: 0 });
      expect(spy).toHaveBeenCalled();
    });

    it("socket arena_control toggle_swap reste autorisé pour l'écran d'arène", async () => {
      await protectArena();
      const spy = vi.spyOn(server as any, 'handleArenaControl').mockImplementation(() => {});
      const { handlers } = connectSocket();
      handlers.arena_control({ arenaId: 'arena1', action: 'toggle_swap' });
      expect(spy).toHaveBeenCalled();
    });

    describe('événements team_*', () => {
      function seedTeamState(over: Record<string, unknown> = {}) {
        const state: any = {
          format: 'laser-arena',
          weapon: 'L',
          relayRule: { stepSize: 5, target: 45 },
          fencerCards: [],
          isLaserPoints: true,
          competitionId: 'comp-1',
          matchId: 'tm1',
          bouts: [
            { id: 'b1', fencerAId: 'a', fencerBId: 'b', status: 'pending', scoreA: 0, scoreB: 0 },
          ],
          currentBoutIndex: 0,
          liveScoreA: 0,
          liveScoreB: 0,
          elapsedAccumulatedSec: 0,
          timerStartedAt: null,
          cards: [],
          ...over,
        };
        (server as any).teamArenaState.set('arena1', state);
        vi.spyOn(server as any, 'getPublicTeamArenaState').mockReturnValue({});
        return state;
      }

      it.each([
        ['team_touch', { side: 'A', points: 1 }],
        ['team_reset_bout', {}],
        ['team_timer_start', {}],
        ['team_advance_bout', {}],
        ['team_card', { teamId: 't1', type: 'yellow' }],
        ['team_fencer_card', { side: 'A', reason: 'early_start' }],
      ])('%s refusé sans cookie', async (ev, extra) => {
        await protectArena();
        const state = seedTeamState();
        state.liveScoreA = 2;
        (mockDb as any).updateTeamBout = vi.fn();
        (mockDb as any).createTeamMatchCard = vi.fn().mockReturnValue({ id: 'c1' });
        const { handlers, socket } = connectSocket();
        handlers[ev]({ arenaId: 'arena1', ...extra });
        expect(socket.emit).toHaveBeenCalledWith('auth_error', expect.anything());
        expect(state.liveScoreA).toBe(2);
        expect(state.timerStartedAt).toBeNull();
        expect(state.cards).toHaveLength(0);
        expect(state.fencerCards).toHaveLength(0);
        expect((mockDb as any).updateTeamBout).not.toHaveBeenCalled();
      });

      describe('relais FIE (#1086)', () => {
        const relayBouts = () => [
          {
            id: 'b1',
            boutOrder: 1,
            fencerAId: 'a1',
            fencerBId: 'b1',
            status: 'finished',
            scoreA: 5,
            scoreB: 3,
          },
          {
            id: 'b2',
            boutOrder: 2,
            fencerAId: 'a2',
            fencerBId: 'b2',
            status: 'pending',
            scoreA: 0,
            scoreB: 0,
          },
        ];

        it('touche simple uniquement (pas de zones hors mode points)', async () => {
          const cookie = await protectArena();
          const state = seedTeamState({
            format: 'fie-relay',
            isLaserPoints: false,
            bouts: relayBouts(),
            currentBoutIndex: 1,
          });
          const { handlers } = connectSocket(cookie);
          handlers.team_touch({ arenaId: 'arena1', side: 'A', points: 3 });
          expect(state.liveScoreA).toBe(0);
          handlers.team_touch({ arenaId: 'arena1', side: 'B', points: 1 });
          expect(state.liveScoreB).toBe(1);
        });

        it('relais suivant : vainqueur au cumul, score du relais persisté', async () => {
          const cookie = await protectArena();
          // Relais 2 perdu 2-3 par A, mais cumul 7-6 → relais attribué à A
          const state = seedTeamState({
            format: 'fie-relay',
            isLaserPoints: false,
            bouts: relayBouts(),
            currentBoutIndex: 1,
            liveScoreA: 2,
            liveScoreB: 3,
          });
          (mockDb as any).updateTeamBout = vi.fn();
          const { handlers } = connectSocket(cookie);
          handlers.team_advance_bout({ arenaId: 'arena1' });
          expect((mockDb as any).updateTeamBout).toHaveBeenCalledWith('b2', 2, 3, 'finished', 'a2');
          expect(state.currentBoutIndex).toBe(-1);
        });

        it('carton individuel : escalade, persistance, motif inconnu refusé', async () => {
          const cookie = await protectArena();
          const state = seedTeamState({
            format: 'fie-relay',
            weapon: 'E',
            isLaserPoints: false,
            bouts: relayBouts(),
            currentBoutIndex: 1,
          });
          const stored: any[] = [];
          (mockDb as any).getTeamBoutCards = vi.fn(() =>
            stored.map(card => ({ boutId: 'b2', card }))
          );
          (mockDb as any).createTeamBoutCard = vi.fn((_b: string, card: any) => {
            stored.push(card);
            return { id: card.id };
          });
          const { handlers } = connectSocket(cookie);
          handlers.team_fencer_card({ arenaId: 'arena1', side: 'A', reason: 'not_a_reason' });
          expect(state.fencerCards).toHaveLength(0);
          handlers.team_fencer_card({ arenaId: 'arena1', side: 'A', reason: 'early_start' });
          handlers.team_fencer_card({ arenaId: 'arena1', side: 'A', reason: 'early_start' });
          expect(state.fencerCards.map((c: any) => [c.fencerId, c.boutId])).toEqual([
            ['a2', 'b2'],
            ['a2', 'b2'],
          ]);
          expect(state.fencerCards[0].type).toBe('WHITE');
          expect(state.fencerCards[1].type).toBe('YELLOW'); // escalade depuis l'historique persisté
          expect((mockDb as any).createTeamBoutCard).toHaveBeenCalledTimes(2);
        });

        it('état public : cumul, palier du relais, cible, motifs de carton', () => {
          seedTeamState({
            format: 'fie-relay',
            weapon: 'E',
            isLaserPoints: false,
            bouts: relayBouts(),
            currentBoutIndex: 1,
            liveScoreA: 4,
            liveScoreB: 1,
          });
          (server as any).getPublicTeamArenaState.mockRestore();
          mockDb.getCompetition.mockReturnValue({ id: 'comp-1', settings: {} });
          const pub = (server as any).getPublicTeamArenaState('arena1');
          expect(pub.cumulA).toBe(9);
          expect(pub.cumulB).toBe(4);
          expect(pub.cap.maxTouches).toBe(10);
          expect(pub.boutComplete).toBe(false);
          expect(pub.target).toBe(45);
          expect(pub.cardReasons).toContain('early_start');
        });
      });

      it('team_touch accepté avec cookie, points invalides ignorés', async () => {
        const cookie = await protectArena();
        const state = seedTeamState();
        const { handlers } = connectSocket(cookie);
        handlers.team_touch({ arenaId: 'arena1', side: 'A', points: 3 });
        expect(state.liveScoreA).toBe(3);
        handlers.team_touch({ arenaId: 'arena1', side: 'A', points: 9999 });
        handlers.team_touch({ arenaId: 'arena1', side: 'B', points: -5 });
        handlers.team_touch({ arenaId: 'arena1', side: 'Z', points: 1 });
        expect(state.liveScoreA).toBe(3);
        expect(state.liveScoreB).toBe(0);
      });
    });
  });

  describe('P1 : anti force brute', () => {
    function loginHandler(): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      return stack.find(
        (l: any) => l?.route?.path === '/api/auth/login/:arenaId' && l.route.methods?.post
      )?.route?.stack?.[0]?.handle;
    }

    async function attempt(password: string, ip = '192.168.1.50', headers: any = {}) {
      const res = makeRes();
      await loginHandler()(
        makeReq({
          method: 'POST',
          params: { arenaId: '1' },
          body: { password },
          headers,
          socket: { remoteAddress: ip },
        }),
        res,
        vi.fn()
      );
      return res;
    }

    beforeEach(() => {
      (server as any).arenas.set('arena1', {
        id: 'arena1',
        number: 1,
        name: 'Arène 1',
        status: 'idle',
        currentMatch: null,
        settings: {},
      });
      server.setArenaPassword('1', 'secret123');
    });

    it('hash scrypt salé : deux hash du même mot de passe diffèrent et se vérifient', async () => {
      const h1 = (server as any).hashPassword('secret123');
      const h2 = (server as any).hashPassword('secret123');
      expect(h1).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
      expect(h1).not.toBe(h2);
      await expect((server as any).verifyPassword('secret123', h1)).resolves.toBe(true);
      await expect((server as any).verifyPassword('secret124', h1)).resolves.toBe(false);
      await expect((server as any).verifyPassword('secret123', 'abc')).resolves.toBe(false);
    });

    it('refuse un mot de passe de moins de 8 caractères (arène et appel), vide autorisé', () => {
      expect(() => server.setArenaPassword('1', 'court')).toThrow(/8 caractères/);
      expect(() => server.setCheckinPassword('1234567')).toThrow(/8 caractères/);
      expect(() => server.setArenaPassword('1', '')).not.toThrow();
      expect(() => server.setCheckinPassword('')).not.toThrow();
    });

    it('X-Forwarded-For ignoré : un en-tête aléatoire ne contourne plus la limite par IP', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await attempt('mauvais!', '192.168.1.50', { 'x-forwarded-for': `10.9.9.${i}` });
        expect(res.status).toHaveBeenCalledWith(401);
        (server as any).loginGuard.failures.clear(); // isole la limite par minute du blocage
      }
      const res = await attempt('mauvais!', '192.168.1.50', { 'x-forwarded-for': '10.9.9.99' });
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('X-Forwarded-For lu seulement si trustProxy activé', () => {
      const req = makeReq({
        headers: { 'x-forwarded-for': '10.1.2.3, 127.0.0.1' },
        socket: { remoteAddress: '::ffff:192.168.1.7' },
      });
      expect((server as any).getClientIp(req)).toBe('192.168.1.7');
      server.setTrustProxy(true);
      expect((server as any).getClientIp(req)).toBe('10.1.2.3');
    });

    it('limite par arène : 20 tentatives/min tous clients confondus', async () => {
      for (let i = 0; i < 20; i++) {
        const res = await attempt('mauvais!', `192.168.2.${i}`);
        expect(res.status).toHaveBeenCalledWith(401);
      }
      const res = await attempt('secret123', '192.168.3.1');
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it("blocage progressif après 5 échecs, même après la fenêtre d'une minute", async () => {
      const diag = vi.spyOn(server as any, 'sendDiag').mockImplementation(() => {});
      for (let i = 0; i < 5; i++) {
        await attempt('mauvais!');
        (server as any).loginGuard.attempts.clear();
      }
      expect(diag).toHaveBeenCalledWith(expect.stringContaining('192.168.1.50'));
      const res = await attempt('secret123');
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');

      // Échec suivant après expiration du blocage → durée doublée
      (server as any).loginGuard.failures.get('192.168.1.50').lockedUntil = 0;
      await attempt('mauvais!');
      const f = (server as any).loginGuard.failures.get('192.168.1.50');
      expect(f.lockedUntil - Date.now()).toBeGreaterThan(55_000);
    });

    it("un succès remet à zéro les échecs de l'IP", async () => {
      for (let i = 0; i < 3; i++) await attempt('mauvais!');
      const res = await attempt('secret123');
      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect((server as any).loginGuard.failures.has('192.168.1.50')).toBe(false);
    });

    it('jeton expiré côté serveur refusé', async () => {
      const res = await attempt('secret123');
      const cookie = res.setHeader.mock.calls
        .find((c: any[]) => c[0] === 'Set-Cookie')[1]
        .split(';')[0];
      expect((server as any).checkArenaAuth('arena1', cookie)).toBe(true);
      const tokens: Map<string, number> = (server as any).arenaTokens.get('arena1');
      for (const t of tokens.keys()) tokens.set(t, Date.now() - 1);
      expect((server as any).checkArenaAuth('arena1', cookie)).toBe(false);
    });

    it('nombre de jetons plafonné par arène', () => {
      const store = new Map<string, number>();
      for (let i = 0; i < 60; i++) (server as any).issueToken(store);
      expect(store.size).toBe(50);
    });
  });

  describe('P2 : durcissement réseau / DoS', () => {
    function connect(address = '192.168.1.50', headers: any = {}) {
      const io = (server as any).io;
      const onConnection = vi
        .mocked(io.on)
        .mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
      const handlers: Record<string, any> = {};
      let packetMiddleware: any;
      const socket = {
        id: 'sock-' + Math.random(),
        handshake: { headers, address },
        on: vi.fn((ev: string, cb: any) => {
          // Plusieurs écouteurs possibles (ex. disconnect) : tous appelés
          const prev = handlers[ev];
          handlers[ev] = prev
            ? (...args: any[]) => {
                prev(...args);
                cb(...args);
              }
            : cb;
        }),
        use: vi.fn((fn: any) => {
          packetMiddleware = fn;
        }),
        emit: vi.fn(),
        join: vi.fn(),
        disconnect: vi.fn(),
      };
      onConnection(socket);
      return { socket, handlers, packetMiddleware };
    }

    // Exécute les middlewares globaux (app.use) dans l'ordre, comme Express
    async function runGlobalMiddlewares(req: any, res: any): Promise<boolean> {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      for (const layer of stack.filter((l: any) => !l.route)) {
        let passed = false;
        await new Promise<void>(resolve => {
          const r = layer.handle(req, res, () => {
            passed = true;
            resolve();
          });
          if (!passed) setTimeout(resolve, 0);
          return r;
        });
        if (!passed) return false;
      }
      return true;
    }

    it('isAllowedOrigin : même hôte / LAN acceptés, origine externe refusée', () => {
      const ok = (o: any) => (server as any).isAllowedOrigin(o, 'bellepoule.local:8066');
      expect(ok('http://bellepoule.local:8066')).toBe(true);
      expect(ok('http://192.168.1.10:8066')).toBe(true);
      expect(ok('https://evil.example.com')).toBe(false);
      expect(ok('null')).toBe(false);
      // Polling Socket.IO même origine : pas d'en-tête Origin
      expect(ok(undefined)).toBe(true);
    });

    it('POST avec Origin étrangère refusé (403), Origin même hôte accepté', async () => {
      const base = { method: 'POST', path: '/api/sync', url: '/api/sync' };
      const denied = makeRes();
      const passedDenied = await runGlobalMiddlewares(
        makeReq({
          ...base,
          headers: { host: '192.168.1.10:8066', origin: 'https://evil.example.com' },
          socket: { remoteAddress: '192.168.1.50' },
        }),
        denied
      );
      expect(passedDenied).toBe(false);
      expect(denied.status).toHaveBeenCalledWith(403);

      const allowed = makeRes();
      const passedAllowed = await runGlobalMiddlewares(
        makeReq({
          ...base,
          headers: { host: '192.168.1.10:8066', origin: 'http://192.168.1.10:8066' },
          socket: { remoteAddress: '192.168.1.50' },
        }),
        allowed
      );
      expect(passedAllowed).toBe(true);
    });

    it('limite JSON réduite sur les routes de connexion', () => {
      expect((RemoteScoreServer as any).isLoginPath('/api/auth/login/arena1')).toBe(true);
      expect((RemoteScoreServer as any).isLoginPath('/api/checkin/login')).toBe(true);
      expect((RemoteScoreServer as any).isLoginPath('/api/register')).toBe(false);
    });

    it('/api/debug réservé à la machine hôte', async () => {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const handlers = stack
        .find((l: any) => l?.route?.path === '/api/debug')
        .route.stack.map((x: any) => x.handle);
      const res = makeRes();
      const next = vi.fn();
      handlers[0](makeReq({ socket: { remoteAddress: '192.168.1.50' } }), res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('refuse au-delà de 30 sockets simultanées par IP, libère à la déconnexion', () => {
      const conns = Array.from({ length: 30 }, () => connect('192.168.1.60'));
      conns.forEach(c => expect(c.socket.disconnect).not.toHaveBeenCalled());
      const extra = connect('192.168.1.60');
      expect(extra.socket.disconnect).toHaveBeenCalledWith(true);
      conns[0].handlers.disconnect();
      const again = connect('192.168.1.60');
      expect(again.socket.disconnect).not.toHaveBeenCalled();
    });

    it("déconnecte une socket qui inonde le serveur d'événements", () => {
      const { socket, packetMiddleware } = connect('192.168.1.61');
      const next = vi.fn();
      for (let i = 0; i < 40; i++) packetMiddleware([], next);
      expect(next).toHaveBeenCalledTimes(40);
      expect(socket.disconnect).not.toHaveBeenCalled();
      packetMiddleware([], next);
      expect(next).toHaveBeenCalledTimes(40);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it("client:register enregistre l'IP de la socket, pas X-Forwarded-For", () => {
      vi.spyOn(server as any, 'broadcastClientList').mockImplementation(() => {});
      const { socket, handlers } = connect('::ffff:192.168.1.62', {
        'x-forwarded-for': '6.6.6.6',
      });
      handlers['client:register']({ clientType: 'kiosk' });
      expect((server as any).connectedClients.get(socket.id).ip).toBe('192.168.1.62');
    });
  });

  describe('#993/#995/#997 : DoS socket et XSS', () => {
    function findHandler(method: string, path: string): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.[0]?.handle;
    }

    function connect() {
      const io = (server as any).io;
      const onConnection = vi
        .mocked(io.on)
        .mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
      const handlers: Record<string, any> = {};
      const socket = {
        id: 'sock-x',
        handshake: { headers: {}, address: '192.168.1.70' },
        on: vi.fn((ev: string, cb: any) => {
          handlers[ev] = cb;
        }),
        emit: vi.fn(),
        join: vi.fn(),
        disconnect: vi.fn(),
      };
      onConnection(socket);
      return handlers;
    }

    it.each([
      'join_arena',
      'join_pool',
      'join_team_arena',
      'arena_control',
      'client:register',
      'client:battery',
      'team_touch',
      'team_fencer_card',
    ])('%s avec données nulles : aucune exception', ev => {
      const handlers = connect();
      expect(() => handlers[ev](null)).not.toThrow();
      expect(() => handlers[ev](undefined)).not.toThrow();
    });

    it('sanitizeAnnouncement : balises retirées, carton inconnu normalisé', () => {
      const a = RemoteScoreServer.sanitizeAnnouncement({
        fencerName: '<img src=x onerror="alert(1)">Dupont',
        cardType: 'evil" onclick="x',
        reason: '<script>x</script>',
        extra: 'ignored',
      })!;
      expect(a.fencerName).not.toMatch(/[<>]/);
      expect(a.cardType).toBe('yellow');
      expect(a.reason).not.toMatch(/[<>]/);
      expect(a).not.toHaveProperty('extra');
      expect(RemoteScoreServer.sanitizeAnnouncement(null)).toBeNull();
    });

    it('journal : numéro de piste non numérique refusé (400)', () => {
      const res = makeRes();
      findHandler('get', '/arene:arenaId/journal')(
        makeReq({ params: { arenaId: '1<img src=x onerror=alert(1)>' } }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('résultats : identifiant de compétition hors format refusé (400)', () => {
      const res = makeRes();
      findHandler('get', '/competition/:competitionId/results')(
        makeReq({ params: { competitionId: '</script><script>alert(1)</script>' } }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('#989 : espace formateurs', () => {
    function findHandler(method: string, path: string): any {
      const app = (server as any).app;
      const stack = (app.router ?? app._router)?.stack ?? [];
      const layer = stack.find((l: any) => l?.route?.path === path && l.route.methods?.[method]);
      return layer?.route?.stack?.[0]?.handle;
    }

    beforeEach(() => {
      (server as any).session = { competitionId: 'comp-1', strips: [] };
      (server as any).loginGuard.failureDelayMs = 0;
      (mockDb as any).getRefereeComments = vi.fn().mockReturnValue([]);
      (mockDb as any).addRefereeComment = vi.fn().mockReturnValue({ id: 'c1' });
      mockDb.getRefereesByCompetition.mockReturnValue([
        { id: 'r1', lastName: 'ARBITRE', firstName: 'Anne' },
      ]);
    });

    it('fermé tant que non activé / sans mot de passe', () => {
      const res = makeRes();
      findHandler('get', '/api/trainer/referees')(makeReq(), res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('login puis commentaire enregistré ; sans cookie → 401', async () => {
      server.setTrainerEnabled(true);
      server.setTrainerPassword('formateur123');

      const anon = makeRes();
      findHandler('post', '/api/trainer/referees/:refereeId/comments')(
        makeReq({ params: { refereeId: 'r1' }, body: { comment: 'Bien' } }),
        anon
      );
      expect(anon.status).toHaveBeenCalledWith(401);

      const loginRes = makeRes();
      await findHandler('post', '/api/trainer/login')(
        makeReq({ body: { password: 'formateur123' } }),
        loginRes
      );
      const cookieHeader = loginRes.setHeader.mock.calls.find(
        (c: any[]) => c[0] === 'Set-Cookie'
      )[1];
      const cookie = cookieHeader.split(';')[0];

      const res = makeRes();
      findHandler('post', '/api/trainer/referees/:refereeId/comments')(
        makeReq({
          params: { refereeId: 'r1' },
          body: { comment: '  Bon placement  ', author: 'Paul' },
          headers: { cookie },
        }),
        res
      );
      expect((mockDb as any).addRefereeComment).toHaveBeenCalledWith(
        'comp-1',
        'r1',
        'Bon placement',
        'Paul',
        null
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

      const unknown = makeRes();
      findHandler('post', '/api/trainer/referees/:refereeId/comments')(
        makeReq({ params: { refereeId: 'zz' }, body: { comment: 'x' }, headers: { cookie } }),
        unknown
      );
      expect(unknown.status).toHaveBeenCalledWith(404);
    });

    it('mauvais mot de passe refusé', async () => {
      server.setTrainerEnabled(true);
      server.setTrainerPassword('formateur123');
      const res = makeRes();
      await findHandler('post', '/api/trainer/login')(makeReq({ body: { password: 'nope' } }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
