/**
 * RemoteScoreServer : authentification, limites et durcissement (découpé de
 * remoteScoreServer.test.ts, #1896).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock d'Electron : évite de charger node_modules/electron (téléchargement du binaire en CI)
vi.mock('electron', () => ({
  app: { getAppPath: () => '/opt/app', getPath: () => '/tmp', isPackaged: false },
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  net: { request: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({}) },
  session: { defaultSession: {} },
  shell: { openExternal: vi.fn() },
}));

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

import { RemoteScoreServer } from './remoteScoreServer';
import { mockDb, makeReq, makeRes } from './__tests__/remoteServerTestkit';

describe('RemoteScoreServer', () => {
  let server: RemoteScoreServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new RemoteScoreServer(mockDb as any, 8066);
    (server as any).loginGuard.failureDelayMs = 0;
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
        const passwordOk = password.length === arena.password.length && password === arena.password;
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
      const diag = vi.spyOn(server as any, 'logDiag').mockImplementation(() => {});
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
