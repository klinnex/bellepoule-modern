import { describe, it, expect, vi } from 'vitest';
import type { RouteContext } from './context';
import { registerPageRoutes } from './pageRoutes';

type Handler = (req: unknown, res: unknown) => unknown;

/** Faux app Express : mémorise les handlers GET par chemin. */
function makeCtx(overrides: Partial<RouteContext> = {}) {
  const routes = new Map<string, Handler>();
  const app = { get: (path: string, h: Handler) => routes.set(path, h) };
  const ctx = {
    app,
    db: {},
    session: { competitionId: 'c1' },
    isTrainingMode: false,
    arenas: new Map([['arena1', { number: 1, activePoolId: 'p1', status: 'idle' }]]),
    sessionMatches: [
      {
        id: 'm1',
        number: 1,
        poolId: 'p1',
        fencerA: { id: 'a', lastName: 'Alpha' },
        fencerB: { id: 'b', lastName: 'Bravo' },
        status: 'not_started',
      },
    ],
    sessionMatchScores: new Map(),
    trainingHistory: [],
    sendHtmlFromMemory: vi.fn(),
    checkArenaAuth: vi.fn(() => true),
    hasAnyValidToken: vi.fn(() => true),
    computePhaseEta: vi.fn(() => ({
      finishAt: 'x',
      basis: 'measured',
      remainingMatches: 1,
      perMatchMinutes: 4,
    })),
    ...overrides,
  } as unknown as RouteContext;
  registerPageRoutes(ctx);
  return { routes, ctx };
}

/** Fausse réponse Express chaînable. */
function res() {
  const r = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    json(body: unknown) {
      r.body = body;
      return r;
    },
    send(body: unknown) {
      r.body = body;
      return r;
    },
    set(key: string, value: string) {
      r.headers[key] = value;
      return r;
    },
  };
  return r;
}

describe('registerPageRoutes (#1065)', () => {
  it('planning tireur : données de session via le contexte', () => {
    const { routes } = makeCtx();
    const r = res();
    routes.get('/api/public/fencers/:fencerId/schedule')!({ params: { fencerId: 'a' } }, r);
    expect(r.statusCode).toBe(200);
    expect((r.body as { next: { arena: number } }).next.arena).toBe(1);
  });

  it('planning tireur : matchs de tableau terminés lus en base', () => {
    const { routes } = makeCtx({
      db: {
        getTableauMatchesForExport: vi.fn(() => [
          {
            id: 'c1-t1',
            round: 8,
            position: 0,
            isBye: false,
            fencerA: { id: 'a', lastName: 'Alpha' },
            fencerB: { id: 'c', lastName: 'Charlie' },
            scoreA: 15,
            scoreB: 9,
            winner: { id: 'a' },
          },
        ]),
      } as unknown as RouteContext['db'],
    });
    const r = res();
    routes.get('/api/public/fencers/:fencerId/schedule')!({ params: { fencerId: 'a' } }, r);
    const body = r.body as { matches: Array<{ phase: string; round: number; victory: boolean }> };
    expect(body.matches.map(m => m.phase)).toEqual(['pool', 'tableau']);
    expect(body.matches[1]).toMatchObject({ round: 8, victory: true });
  });

  it('planning tireur : 404 inconnu, 400 identifiant invalide', () => {
    const { routes } = makeCtx();
    const r1 = res();
    routes.get('/api/public/fencers/:fencerId/schedule')!({ params: { fencerId: 'zz' } }, r1);
    expect(r1.statusCode).toBe(404);
    const r2 = res();
    routes.get('/api/public/fencers/:fencerId/schedule')!({ params: { fencerId: '../x' } }, r2);
    expect(r2.statusCode).toBe(400);
  });

  it('ETA publique : null sans session ou en entraînement', () => {
    const r1 = res();
    makeCtx({ session: null }).routes.get('/api/public/eta')!({}, r1);
    expect(r1.body).toEqual({ eta: null });
    const r2 = res();
    makeCtx().routes.get('/api/public/eta')!({}, r2);
    expect((r2.body as { eta: { remainingMatches: number } }).eta.remainingMatches).toBe(1);
  });
});
