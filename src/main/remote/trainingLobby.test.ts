import { describe, it, expect, vi } from 'vitest';
import { TrainingLobby, LOBBY_IDLE_MS } from './trainingLobby';
import type { RouteContext } from './routes/context';
import { registerTrainingLobbyRoutes } from './routes/trainingLobbyRoutes';

describe('TrainingLobby (#1500)', () => {
  it('occupe une piste : un autre client est refusé', () => {
    const l = new TrainingLobby();
    expect(l.claim(1, 'client-aaaa', 0)).toBe(true);
    expect(l.claim(1, 'client-bbbb', 1)).toBe(false);
    expect(l.claim(1, 'client-aaaa', 2)).toBe(true); // rafraîchissement
  });

  it('liste : occupée pour les autres, « mine » pour le propriétaire', () => {
    const l = new TrainingLobby();
    l.claim(2, 'client-aaaa', 0);
    expect(l.list([3, 2, 1], 'client-bbbb', 1)).toEqual([
      { number: 1, occupied: false, mine: false },
      { number: 2, occupied: true, mine: false },
      { number: 3, occupied: false, mine: false },
    ]);
    expect(l.list([2], 'client-aaaa', 1)[0].mine).toBe(true);
  });

  it('libération après 3 minutes sans activité', () => {
    const l = new TrainingLobby();
    l.claim(1, 'client-aaaa', 0);
    expect(l.list([1], 'x', LOBBY_IDLE_MS - 1)[0].occupied).toBe(true);
    expect(l.list([1], 'x', LOBBY_IDLE_MS)[0].occupied).toBe(false);
    expect(l.claim(1, 'client-bbbb', LOBBY_IDLE_MS)).toBe(true);
  });

  it("l'activité repousse l'expiration", () => {
    const l = new TrainingLobby();
    l.claim(1, 'client-aaaa', 0);
    l.claim(1, 'client-aaaa', LOBBY_IDLE_MS - 10);
    expect(l.list([1], 'x', LOBBY_IDLE_MS + 100)[0].occupied).toBe(true);
  });

  it('release : seulement par le propriétaire ; releaseAll libère tout', () => {
    const l = new TrainingLobby();
    l.claim(1, 'client-aaaa', 0);
    l.release(1, 'client-bbbb');
    expect(l.list([1], 'x', 1)[0].occupied).toBe(true);
    l.release(1, 'client-aaaa');
    expect(l.list([1], 'x', 1)[0].occupied).toBe(false);
    l.claim(2, 'client-aaaa', 2);
    l.releaseAll('client-aaaa');
    expect(l.list([2], 'x', 3)[0].occupied).toBe(false);
  });

  it('changer de piste libère la précédente', () => {
    const l = new TrainingLobby();
    l.claim(1, 'client-aaaa', 0);
    l.claim(2, 'client-aaaa', 1);
    expect(l.list([1, 2], 'x', 2).map(a => a.occupied)).toEqual([false, true]);
  });
});

type Handler = (req: unknown, res: unknown) => unknown;

function makeRoutes(overrides: Partial<RouteContext> = {}) {
  const routes = new Map<string, Handler>();
  const ctx = {
    app: {
      get: (p: string, h: Handler) => routes.set(`GET ${p}`, h),
      post: (p: string, h: Handler) => routes.set(`POST ${p}`, h),
    },
    session: { competitionId: '__training__' },
    isTrainingMode: true,
    arenas: new Map([
      ['arena1', {}],
      ['arena2', {}],
      ['arena2s2', {}],
    ]),
    sendHtmlFromMemory: vi.fn(),
    ...overrides,
  } as unknown as RouteContext;
  registerTrainingLobbyRoutes(ctx, new TrainingLobby());
  return { routes, ctx };
}

function res() {
  const r = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      r.statusCode = c;
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
    set() {
      return r;
    },
  };
  return r;
}

const A = 'client-aaaa';
const B = 'client-bbbb';

describe('routes du lobby entraînement (#1500)', () => {
  it('sert la page /entrainement-lobby', () => {
    const { routes, ctx } = makeRoutes();
    const r = res();
    routes.get('GET /entrainement-lobby')!({}, r);
    expect(ctx.sendHtmlFromMemory).toHaveBeenCalledWith('trainingLobby.html', r);
  });

  it('hors entraînement : état vide, occupation refusée', () => {
    const { routes } = makeRoutes({ isTrainingMode: false });
    const r = res();
    routes.get('GET /api/training/lobby')!({ query: {} }, r);
    expect(r.body).toMatchObject({ training: false, arenas: [] });
    const c = res();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: A } }, c);
    expect(c.statusCode).toBe(409);
  });

  it('liste les pistes principales (sans sous-pistes) avec leur occupation', () => {
    const { routes } = makeRoutes();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 2, clientId: A } }, res());
    const r = res();
    routes.get('GET /api/training/lobby')!({ query: { client: B } }, r);
    expect((r.body as { arenas: unknown[] }).arenas).toEqual([
      { number: 1, occupied: false, mine: false },
      { number: 2, occupied: true, mine: false },
    ]);
  });

  it('piste occupée : 409 arena_occupied pour un autre client', () => {
    const { routes } = makeRoutes();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: A } }, res());
    const r = res();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: B } }, r);
    expect(r.statusCode).toBe(409);
    expect(r.body).toEqual({ error: 'arena_occupied' });
  });

  it('validation : piste inconnue 404, client invalide 400', () => {
    const { routes } = makeRoutes();
    const r1 = res();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 9, clientId: A } }, r1);
    expect(r1.statusCode).toBe(404);
    const r2 = res();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: '../x' } }, r2);
    expect(r2.statusCode).toBe(400);
  });

  it('release libère la piste (ou toutes sans numéro)', () => {
    const { routes } = makeRoutes();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: A } }, res());
    routes.get('POST /api/training/lobby/release')!({ body: { arena: 1, clientId: A } }, res());
    const ok = res();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: B } }, ok);
    expect(ok.statusCode).toBe(200);
    routes.get('POST /api/training/lobby/release')!({ body: { clientId: B } }, res());
    const again = res();
    routes.get('POST /api/training/lobby/claim')!({ body: { arena: 1, clientId: A } }, again);
    expect(again.statusCode).toBe(200);
  });
});
