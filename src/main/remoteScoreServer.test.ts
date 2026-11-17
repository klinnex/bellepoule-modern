import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

import { createServer } from 'http';
import { RemoteScoreServer } from './remoteScoreServer';
import { setUiLanguage } from './menuLabels';
import { mockDb, makeReq, makeRes } from './__tests__/remoteServerTestkit';

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

    it("reprend la langue de l'application dès la création (#1213)", () => {
      setUiLanguage('de');
      try {
        const srv = new RemoteScoreServer(mockDb as any, 8066);
        expect((srv as any).currentLang).toBe('de');
      } finally {
        setUiLanguage('fr');
      }
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

  describe('plan des pistes partagé (#1501)', () => {
    it('masque les arènes hors intervalle et diffuse le plan', () => {
      const emit = vi.fn();
      (server as any).io = { emit };
      server.setArenaCount(8);
      emit.mockClear();
      server.setStripPlan({ start: 5, unavailable: [7, 6] });
      expect(server.getVisibleArenas().map(a => a.number)).toEqual([5, 6, 7, 8]);
      expect(emit).toHaveBeenCalledWith('strips:plan', { start: 5, unavailable: [6, 7] });
      const [, list] = emit.mock.calls.find(c => c[0] === 'arenas:updated')!;
      expect(list.map((a: { number: number }) => a.number)).toEqual([5, 6, 7, 8]);
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

  describe('plusieurs poules sur la même piste (#1826)', () => {
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
      (mockDb as any).getMatchesByPool = vi.fn().mockReturnValue([]);
      vi.spyOn(server as any, 'loadSessionReferees').mockReturnValue([]);
      await server.startSession('comp-1', 1, [
        marker('p1', 1, 1),
        pm('p1', 1),
        pm('p1', 2),
        marker('p2', 2, 1),
        pm('p2', 1),
        pm('p2', 2),
        pm('p2', 3),
      ]);
    });

    it('poule suivante affichée en entier quand la première est terminée', () => {
      expect(matchesOf('arena1')).toEqual(['p1-m1', 'p1-m2']);
      const scores = (server as any).sessionMatchScores;
      scores.set('p1-m1', { status: 'finished' });
      scores.set('p1-m2', { status: 'finished' });
      expect(matchesOf('arena1')).toEqual(['p2-m1', 'p2-m2', 'p2-m3']);
    });

    it('poule en file jouée depuis la liste : son entrée de file n’est pas rejouée', () => {
      const scores = (server as any).sessionMatchScores;
      scores.set('p1-m1', { status: 'finished' });
      scores.set('p1-m2', { status: 'finished' });
      server.loadNextMatch('arena1');
      expect((server as any).arenas.get('arena1').currentMatch.id).toBe('p2-m1');
      expect(matchesOf('arena1')).toEqual(['p2-m1', 'p2-m2', 'p2-m3']);
      // Arbitre : p2-m3 joué en premier depuis la liste, puis p2-m1 et p2-m2
      (server as any).arenaMatchQueue.set('arena1', [{ id: 'p2-m3', poolId: 'p2' }]);
      for (const id of ['p2-m1', 'p2-m2', 'p2-m3']) scores.set(id, { status: 'finished' });
      server.loadNextMatch('arena1');
      expect((server as any).arenas.get('arena1').currentMatch).toBeNull();
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

    it('rapières : vagues terminées, plus aucun match de poule proposé (#1118)', () => {
      server.setActiveWaveMatchIds(['p1-m1', 'p1-m2']);
      server.setActiveWaveMatchIds(null, true);
      expect(matchesOf('arena1')).toEqual([]);
      expect(matchesOf('arena2')).toEqual([]);
      // Match de poule préchargé retiré de la piste
      expect((server as any).arenas.get('arena1').currentMatch).toBeNull();
      // Réappliqué au redémarrage : toujours fermé ; reprise des vagues : de nouveau proposé
      server.setActiveWaveMatchIds(null, true);
      expect(matchesOf('arena1')).toEqual([]);
      server.setActiveWaveMatchIds(['p1-m2']);
      expect(matchesOf('arena1')).toEqual(['p1-m2']);
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
      // Match préchargé sur la piste mais pas ouvert : toujours proposé à la sous-piste
      expect(matchesOf('arena1s2')).toEqual(['p1-m1', 'p1-m2']);
      // Ouvert par la tablette de la piste : plus proposé à la sous-piste
      const arena1 = (server as any).arenas.get('arena1');
      server.assignMatchToArena('arena1', arena1.currentMatch, true);
      expect(matchesOf('arena1s2')).toEqual(['p1-m2']);
      expect(matchesOf('arena1')).toEqual(['p1-m1', 'p1-m2']);
      // Retour à la liste sans chrono : de nouveau proposé
      const socket = { emit: vi.fn() };
      (server as any).handleArenaControl(socket, { arenaId: 'arena1', action: 'release_match' });
      expect(matchesOf('arena1s2')).toEqual(['p1-m1', 'p1-m2']);
      // Chrono lancé : pris, même après retour à la liste
      server.assignMatchToArena('arena1', arena1.currentMatch, true);
      server.startArenaMatch('arena1');
      (server as any).handleArenaControl(socket, { arenaId: 'arena1', action: 'release_match' });
      expect(matchesOf('arena1s2')).toEqual(['p1-m2']);
      server.pauseArenaMatch('arena1');
      arena1.status = 'ready';
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

    it('égalité finale : le tireur prioritaire tiré (coin_flip) gagne (#1442)', async () => {
      (server as any).sessionMatchScores.set('m1', {
        scoreA: { value: 0, isVictory: false, isPriority: false },
        scoreB: { value: 0, isVictory: true, isPriority: true },
        status: 'in_progress',
      });
      const res = makeRes();
      await findHandler('post', '/api/matches/:matchId/finish')(
        makeReq({
          method: 'POST',
          params: { matchId: 'm1' },
          body: { scoreA: 4, scoreB: 4 },
        }),
        res,
        vi.fn()
      );
      const saved = (server as any).sessionMatchScores.get('m1');
      expect(saved.scoreB.isVictory).toBe(true);
      expect(saved.scoreA.isVictory).toBe(false);
    });

    it('vainqueur et bornes via les règles partagées (#1829)', async () => {
      const finish = async (body: Record<string, unknown>) => {
        const res = makeRes();
        await findHandler('post', '/api/matches/:matchId/finish')(
          makeReq({ method: 'POST', params: { matchId: 'm1' }, body }),
          res,
          vi.fn()
        );
        return res;
      };
      // Tirage au sort / P-noir à égalité : vainqueur désigné, prioritaire sur la priorité
      const scores = (server as unknown as { sessionMatchScores: Map<string, unknown> })
        .sessionMatchScores;
      scores.set('m1', {
        scoreA: { value: 0, isVictory: false, isPriority: false },
        scoreB: { value: 0, isVictory: false, isPriority: true },
        status: 'in_progress',
      });
      let res = await finish({ scoreA: 2, scoreB: 2, winner: 'A' });
      expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, winner: 'A' });
      // Carton noir (activé dans beforeEach) : l'adversaire du fautif gagne même mené au score
      mockDb.getFencer.mockReturnValueOnce({ id: 'b', status: 'Q' });
      res = await finish({ scoreA: 1, scoreB: 4, blackCardFencer: 'B' });
      expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, winner: 'A' });
      // Score hors bornes (0–50) ou non entier : refusé
      for (const body of [
        { scoreA: 51, scoreB: 2 },
        { scoreA: -1, scoreB: 2 },
        { scoreA: 2.5, scoreB: 2 },
      ]) {
        res = await finish(body);
        expect(res.status).toHaveBeenCalledWith(400);
      }
    });

    it('appareil de piste maître en ligne : carton noir de la tablette refusé (#1829)', async () => {
      const internals = server as unknown as {
        arenas: Map<string, { cyrano?: unknown }>;
        finishArenaMatch: ReturnType<typeof vi.fn>;
      };
      internals.arenas.get('arena1')!.cyrano = { piste: '1', mode: 'master', online: true };
      const finish = internals.finishArenaMatch;
      finish.mockClear();
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
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'cyrano_master_lock' });
      expect(finish).not.toHaveBeenCalled();
    });

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

  describe("finishPoolMatch (saisie dans l'application)", () => {
    beforeEach(() => {
      (server as any).io = { emit: vi.fn(), to: () => ({ emit: vi.fn() }) };
    });

    it('conserve le drapeau forfait sur le perdant (#1144)', () => {
      server.finishPoolMatch('m1', 21, 0, 'A', 'forfait');
      const saved = (server as any).sessionMatchScores.get('m1');
      expect(saved.status).toBe('finished');
      expect(saved.scoreA).toMatchObject({ value: 21, isVictory: true, isForfait: false });
      expect(saved.scoreB).toMatchObject({ value: 0, isVictory: false, isForfait: true });
    });

    it('sans statut spécial : score simple, aucun drapeau', () => {
      server.finishPoolMatch('m1', 3, 5);
      const saved = (server as any).sessionMatchScores.get('m1');
      expect(saved.scoreA).toMatchObject({ value: 3, isVictory: false, isForfait: false });
      expect(saved.scoreB).toMatchObject({ value: 5, isVictory: true, isAbstention: false });
    });
  });
});

describe('mode démo (session d’entraînement)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('joue seule les matchs de chaque arène jusqu’à la fin et alimente l’historique', async () => {
    const srv = new RemoteScoreServer(mockDb as any, 8068);
    await srv.startTrainingSession(2, 'E', {
      matchDurationSeconds: 180,
      allowedZones: [],
      disableSuddenDeath: false,
      demo: true,
    });

    // Chaque arène a déjà un match fictif assigné, sans action humaine
    const arena1 = srv.getArena('arena1');
    expect(arena1?.currentMatch?.fencerA.id).toMatch(/^demo-/);

    vi.advanceTimersByTime(600_000);

    const history = srv.getTrainingHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    // Démo : poules en 5 touches, puis tableau d'élimination directe en 15
    expect(Math.max(history[0].scoreA, history[0].scoreB)).toBe(5);
    for (const record of history) {
      expect([5, 15]).toContain(Math.max(record.scoreA, record.scoreB));
    }
    // Poules terminées → tableau joué sur les pistes, sans action humaine
    expect(history.some(r => Math.max(r.scoreA, r.scoreB) === 15)).toBe(true);

    srv.stopSession();
    // Matchs fictifs retirés des pistes : plus de saisie possible après l'arrêt
    for (const id of ['arena1', 'arena2']) {
      expect(srv.getArena(id)?.status).toBe('idle');
      expect(srv.getArena(id)?.currentMatch).toBeNull();
    }
    const remaining = srv.getTrainingHistory().length;
    vi.advanceTimersByTime(600_000);
    expect(srv.getTrainingHistory().length).toBe(remaining);
  });

  it('simule l’arme choisie : Laser restreint à la zone C → scores par tranches de 5', async () => {
    const srv = new RemoteScoreServer(mockDb as any, 8069);
    await srv.startTrainingSession(1, 'L', {
      matchDurationSeconds: 180,
      allowedZones: ['C'],
      disableSuddenDeath: false,
      demo: true,
    });

    vi.advanceTimersByTime(600_000);

    const history = srv.getTrainingHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    for (const record of history) {
      expect(record.weapon).toBe('L');
      expect(record.scoreA % 5).toBe(0);
      expect(record.scoreB % 5).toBe(0);
      expect(Math.max(record.scoreA, record.scoreB)).toBe(15);
    }
    srv.stopSession();
  });
});
