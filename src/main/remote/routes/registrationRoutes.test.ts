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
