// @vitest-environment jsdom
/**
 * Retrait et réintégration à l'écran par le moteur (docs/adr/0016) : écrit, repli local, refus.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFencerWithdrawal } from './useFencerWithdrawal';
import { BpmClientProvider } from '../api/BpmClientContext';
import { ApiError, type BpmClient } from '../../shared/api/client';

const showToast = vi.fn();
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

let call: ReturnType<typeof vi.fn>;
const flush = vi.fn(async () => {});

const setup = () => {
  const client = { call } as unknown as BpmClient;
  return renderHook(() => useFencerWithdrawal('c1', flush), {
    wrapper: ({ children }) => <BpmClientProvider client={client}>{children}</BpmClientProvider>,
  }).result;
};

beforeEach(() => {
  call = vi.fn(async () => ({ forfeitedMatchIds: ['m1', 'm2'] }));
  showToast.mockClear();
  flush.mockClear();
});

describe('useFencerWithdrawal', () => {
  it('retrait par la commande, après la sauvegarde en attente ; matchs perdus annoncés', async () => {
    const r = setup();
    const input = { fencerId: 'f1', reason: 'abandon' as const, matchId: 'm1' };
    expect(await r.current.withdraw(input)).toBe('recorded');
    expect(call).toHaveBeenCalledWith('withdrawFencer', { competitionId: 'c1', ...input });
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(call.mock.invocationCallOrder[0]);
    expect(showToast).toHaveBeenCalledWith('plural.matches_not_played', 'success');
  });

  it('réintégration par la commande', async () => {
    call.mockResolvedValueOnce({ restoredMatchIds: [] });
    expect(await setup().current.reinstate('f1')).toBe('recorded');
    expect(call).toHaveBeenCalledWith('reinstateFencer', { competitionId: 'c1', fencerId: 'f1' });
  });

  it('format hors moteur ou hors Electron : repli local, sans message', async () => {
    call.mockRejectedValueOnce(new ApiError('unsupported_format', 'équipes'));
    expect(await setup().current.withdraw({ fencerId: 'f1', reason: 'forfait' })).toBe('local');
    call.mockRejectedValueOnce(new ApiError('unavailable', 'hors Electron'));
    expect(await setup().current.reinstate('f1')).toBe('local');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('refus du moteur : message, rien d’appliqué', async () => {
    call.mockRejectedValueOnce(new ApiError('tableau_complete', 'Tableau terminé'));
    expect(await setup().current.withdraw({ fencerId: 'f1', reason: 'forfait' })).toBe('refused');
    expect(showToast).toHaveBeenCalledWith('fencerList.withdraw_failed', 'error');
  });
});
