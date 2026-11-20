/**
 * Client IPC du contrat d'API (#1981) : enveloppe → donnée ou ApiError, abonnements.
 */
import { describe, it, expect, vi } from 'vitest';
import { IpcClient } from './IpcClient';
import { ApiError } from '../../shared/api/client';
import type { ApiBridge } from '../../shared/types/preload';

function bridge() {
  let listener: ((id: string, e: unknown) => void) | null = null;
  const b = {
    invoke: vi.fn(async (name: string) =>
      name === 'checkIn'
        ? { ok: true, data: { updated: 1 } }
        : { ok: false, error: { code: 'invalid_input', message: 'Entrée invalide' } }
    ),
    subscribe: vi.fn(async () => ({ ok: true, data: null })),
    unsubscribe: vi.fn(),
    onEvent: vi.fn((cb: (id: string, e: unknown) => void) => {
      listener = cb;
      return () => {
        listener = null;
      };
    }),
  };
  return {
    b: b as unknown as ApiBridge & typeof b,
    emit: (id: string, e: unknown) => listener?.(id, e),
  };
}

describe('IpcClient', () => {
  it('commande : donnée de l’enveloppe ; erreur : ApiError avec code', async () => {
    const { b } = bridge();
    const client = new IpcClient(() => b);
    const input = { competitionId: 'c1', fencers: ['f1'], present: true };
    expect(await client.call('checkIn', input)).toEqual({ updated: 1 });
    expect(b.invoke).toHaveBeenCalledWith('checkIn', input);
    await expect(client.query('getMatchCards', { matchId: '' })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('hors Electron : ApiError « unavailable »', async () => {
    const client = new IpcClient(() => undefined);
    await expect(client.query('getMatchCards', { matchId: 'm' })).rejects.toBeInstanceOf(ApiError);
  });

  it('abonnement : événements routés par id, désabonnement', () => {
    const { b, emit } = bridge();
    const client = new IpcClient(() => b);
    const cb = vi.fn();
    const off = client.subscribe('onCompetitionEvents', {}, cb);
    const id = (b.subscribe.mock.calls[0] as unknown[])[0] as string;
    emit(id, { type: 'fencers:changed' });
    emit('autre', { type: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(b.unsubscribe).toHaveBeenCalledWith(id);
    emit(id, { type: 'fencers:changed' });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
