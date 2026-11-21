// @vitest-environment jsdom
/**
 * Saisie d'un score à l'écran par recordScore (#1980, ADR-0005) : écrit, repli local, refus.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRecordScore } from './useRecordScore';
import { BpmClientProvider } from '../api/BpmClientContext';
import { ApiError, type BpmClient } from '../../shared/api/client';

const showToast = vi.fn();
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

let call: ReturnType<typeof vi.fn>;
const flush = vi.fn(async () => {});

const setup = (competitionId: string | undefined = 'c1') => {
  const client = { call } as unknown as BpmClient;
  return renderHook(() => useRecordScore(competitionId, flush), {
    wrapper: ({ children }) => <BpmClientProvider client={client}>{children}</BpmClientProvider>,
  }).result;
};

beforeEach(() => {
  call = vi.fn(async () => ({ dryRun: false, kind: 'pool', revision: 1 }));
  showToast.mockClear();
  flush.mockClear();
});

describe('useRecordScore', () => {
  it('écrit par la commande après la sauvegarde en attente', async () => {
    const r = setup();
    const input = { matchId: 'm1', scoreA: 5, scoreB: 3 };
    expect(await r.current(input)).toBe('recorded');
    expect(flush).toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('recordScore', { competitionId: 'c1', ...input });
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(call.mock.invocationCallOrder[0]);
  });

  it('format hors moteur : saisie locale, sans message', async () => {
    call.mockRejectedValueOnce(new ApiError('unsupported_format', 'équipes'));
    expect(await setup().current({ matchId: 'm1', scoreA: 5, scoreB: 3 })).toBe('local');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('score refusé : message, rien d’appliqué', async () => {
    call.mockRejectedValueOnce(new ApiError('score_above_max', 'Score refusé'));
    expect(await setup().current({ matchId: 'm1', scoreA: 9, scoreB: 3 })).toBe('refused');
    expect(showToast).toHaveBeenCalledWith('scoreAudit.record_failed', 'error');
  });

  it('hors Electron ou sans épreuve : saisie locale', async () => {
    call.mockRejectedValueOnce(new ApiError('unavailable', 'API indisponible'));
    expect(await setup().current({ matchId: 'm1', scoreA: 5, scoreB: 3 })).toBe('local');
    expect(showToast).not.toHaveBeenCalled();
    call.mockClear();
    expect(await setup('').current({ matchId: 'm1', scoreA: 5, scoreB: 3 })).toBe('local');
    expect(call).not.toHaveBeenCalled();
  });
});
