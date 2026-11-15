/**
 * Tests de POST /api/register : bornage et nettoyage des champs (#1193).
 */
import { describe, it, expect, vi } from 'vitest';
import { registerRegistrationRoutes } from './registrationRoutes';

function setup() {
  const handlers: Record<string, (req: any, res: any) => unknown> = {};
  const addFencer = vi.fn(() => ({ id: 'f1', ref: 1 }));
  const ctx: any = {
    app: {
      get: vi.fn(),
      post: (path: string, h: any) => {
        handlers[path] = h;
      },
      put: vi.fn(),
      delete: vi.fn(),
    },
    registrationEnabled: true,
    session: { competitionId: 'c1' },
    db: { addFencer },
    getClientIp: () => '1.1.1.1',
    checkRegistrationRateLimit: () => true,
  };
  registerRegistrationRoutes(ctx);
  const call = (body: Record<string, unknown>) => {
    const res: any = { statusCode: 200, body: undefined };
    res.status = (c: number) => {
      res.statusCode = c;
      return res;
    };
    res.json = (b: unknown) => {
      res.body = b;
      return res;
    };
    handlers['/api/register']({ body }, res);
    return res;
  };
  return { call, addFencer };
}

describe('POST /api/register', () => {
  it('refuse un champ texte de plus de 200 caractères sans le traiter', () => {
    const { call, addFencer } = setup();
    const t0 = Date.now();
    const res = call({ lastName: '<'.repeat(900_000), firstName: 'a', gender: 'M' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'field_too_long' });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(addFencer).not.toHaveBeenCalled();
  });

  it('retire chevrons et caractères de contrôle, garde apostrophes et &', () => {
    const { call, addFencer } = setup();
    const res = call({
      lastName: "d'<b>Artagnan",
      firstName: 'Jean\u0001',
      gender: 'M',
      club: 'AS & Co',
    });
    expect(res.body).toMatchObject({ success: true });
    expect(addFencer).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ lastName: "D'BARTAGNAN", firstName: 'Jean', club: 'AS & Co' })
    );
  });

  it('ignore les champs non textuels sans planter', () => {
    const { call } = setup();
    const res = call({ lastName: 'Dupont', firstName: 'Jo', gender: 'M', club: { a: 1 } });
    expect(res.body).toMatchObject({ success: true });
  });
});

describe('pointage autonome /api/competitions/:id/self-checkin (#1858)', () => {
  function setupSelf(status = 'N') {
    const handlers: Record<string, (req: any, res: any) => unknown> = {};
    const gets: Record<string, (req: any, res: any) => unknown> = {};
    const updateFencer = vi.fn();
    const recordLoginFailure = vi.fn(async () => {});
    const fencer = {
      id: 'f1',
      lastName: 'DUPONT',
      firstName: 'Jean',
      license: '12 345-A',
      birthDate: new Date('2008-03-14'),
      status,
    };
    const ctx: any = {
      app: {
        get: (path: string, h: any) => {
          gets[path] = h;
        },
        post: (path: string, h: any) => {
          handlers[path] = h;
        },
      },
      session: { competitionId: 'c1' },
      db: { getFencersByCompetition: () => [fencer], updateFencer },
      getClientIp: () => '1.1.1.1',
      checkLoginAllowed: () => null,
      sendLoginLimited: vi.fn(),
      recordLoginFailure,
      recordLoginSuccess: vi.fn(),
      sendHtmlFromMemory: vi.fn(),
    };
    registerRegistrationRoutes(ctx);
    const call = async (body: Record<string, unknown>, competitionId = 'c1') => {
      const res: any = { statusCode: 200 };
      res.status = (c: number) => ((res.statusCode = c), res);
      res.json = (b: unknown) => ((res.body = b), res);
      await handlers['/api/competitions/:competitionId/self-checkin'](
        { body, params: { competitionId } },
        res
      );
      return res;
    };
    return { call, updateFencer, recordLoginFailure, gets, ctx };
  }

  it('sert la page /competition/:id/checkin', () => {
    const { gets, ctx } = setupSelf();
    const res: any = { status: vi.fn(() => res), send: vi.fn() };
    gets['/competition/:competitionId/checkin']({ params: { competitionId: 'c1' } }, res);
    expect(ctx.sendHtmlFromMemory).toHaveBeenCalledWith('selfcheckin.html', res);
  });

  it('licence (espaces, tirets, casse ignorés) + date de naissance → pointé présent', async () => {
    const { call, updateFencer } = setupSelf();
    const res = await call({ license: '12345a', birthDate: '2008-03-14' });
    expect(res.body).toMatchObject({ success: true, already: false, lastName: 'DUPONT' });
    expect(updateFencer).toHaveBeenCalledWith('f1', { status: 'P' });
  });

  it('date fausse : refus générique et échec compté', async () => {
    const { call, updateFencer, recordLoginFailure } = setupSelf();
    const res = await call({ license: '12345A', birthDate: '2008-03-15' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'no_match' });
    expect(updateFencer).not.toHaveBeenCalled();
    expect(recordLoginFailure).toHaveBeenCalledWith('1.1.1.1', 'selfcheckin');
  });

  it('statut sportif verrouillé, compétition inactive, saisie invalide', async () => {
    expect(
      (await setupSelf('F').call({ license: '12345A', birthDate: '2008-03-14' })).statusCode
    ).toBe(409);
    expect(
      (await setupSelf().call({ license: '12345A', birthDate: '2008-03-14' }, 'autre')).statusCode
    ).toBe(404);
    expect(
      (await setupSelf().call({ license: '12345A', birthDate: '14/03/2008' })).statusCode
    ).toBe(400);
  });

  it('déjà présent : succès sans réécriture', async () => {
    const { call, updateFencer } = setupSelf('P');
    const res = await call({ license: '12345A', birthDate: '2008-03-14' });
    expect(res.body).toMatchObject({ success: true, already: true });
    expect(updateFencer).not.toHaveBeenCalled();
  });
});
