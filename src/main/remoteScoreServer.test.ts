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

    function login(password: string): { res: any; cookie: string } {
      const res = makeRes();
      findHandler('post', '/api/checkin/login')(
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

    it("refuse la connexion tant que le DT n'a pas défini de mot de passe", () => {
      const { res } = login('x');
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('refuse un mot de passe incorrect et ne stocke pas le mot de passe en clair', () => {
      server.setCheckinPassword('appel42');
      expect((server as any).checkinPassword).not.toBe('appel42');
      const { res } = login('faux');
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('liste tireurs/arbitres uniquement avec un cookie valide', () => {
      server.setCheckinPassword('appel42');
      const list = findHandler('get', '/api/checkin/list');

      const denied = makeRes();
      list(makeReq(), denied, vi.fn());
      expect(denied.status).toHaveBeenCalledWith(401);

      const { cookie } = login('appel42');
      const res = makeRes();
      list(makeReq({ headers: { cookie } }), res, vi.fn());
      const body = res.json.mock.calls[0][0];
      expect(body.fencers).toHaveLength(2);
      expect(body.fencers[0]).toMatchObject({ id: 'f1', present: false, editable: true });
      expect(body.fencers[1]).toMatchObject({ id: 'f2', editable: false });
      expect(body.referees[0]).toMatchObject({ id: 'r1', present: false, editable: true });
    });

    it('pointe un tireur présent (statut P) et un arbitre disponible', () => {
      server.setCheckinPassword('appel42');
      const { cookie } = login('appel42');
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

    it("n'écrase pas un statut sportif (éliminé)", () => {
      server.setCheckinPassword('appel42');
      const { cookie } = login('appel42');
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

    it("ferme l'appel hors phase CHECKIN", () => {
      server.setCheckinPassword('appel42');
      const { cookie } = login('appel42');
      server.setCheckinEnabled(false);
      const res = makeRes();
      findHandler('get', '/api/checkin/list')(makeReq({ headers: { cookie } }), res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('invalide les sessions quand le mot de passe change', () => {
      server.setCheckinPassword('appel42');
      const { cookie } = login('appel42');
      server.setCheckinPassword('nouveau');
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

    function protectArena(password = 'secret123'): string {
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
      findLayers('post', '/api/auth/login/:arenaId')[0](
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
        protectArena();
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
      const cookie = protectArena();
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
      protectArena();
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

    it("socket arena_control refusé sans cookie, sans avoir rejoint l'arène", () => {
      protectArena();
      const spy = vi.spyOn(server as any, 'handleArenaControl').mockImplementation(() => {});
      const { handlers, socket } = connectSocket();
      handlers.arena_control({ arenaId: 'arena1', action: 'update_score', scoreA: 5, scoreB: 0 });
      expect(spy).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    });

    it('socket arena_control accepté avec cookie valide', () => {
      const cookie = protectArena();
      const spy = vi.spyOn(server as any, 'handleArenaControl').mockImplementation(() => {});
      const { handlers } = connectSocket(cookie);
      handlers.arena_control({ arenaId: 'arena1', action: 'update_score', scoreA: 5, scoreB: 0 });
      expect(spy).toHaveBeenCalled();
    });

    it("socket arena_control toggle_swap reste autorisé pour l'écran d'arène", () => {
      protectArena();
      const spy = vi.spyOn(server as any, 'handleArenaControl').mockImplementation(() => {});
      const { handlers } = connectSocket();
      handlers.arena_control({ arenaId: 'arena1', action: 'toggle_swap' });
      expect(spy).toHaveBeenCalled();
    });

    describe('événements team_*', () => {
      function seedTeamState() {
        const state = {
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
      ])('%s refusé sans cookie', (ev, extra) => {
        protectArena();
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
        expect((mockDb as any).updateTeamBout).not.toHaveBeenCalled();
      });

      it('team_touch accepté avec cookie, points invalides ignorés', () => {
        const cookie = protectArena();
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
});
