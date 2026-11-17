// @vitest-environment jsdom
/**
 * useTrainingSession (#1897) : lancement, échec, arrêt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
import { useTrainingSession } from './useTrainingSession';

const training = {
  startServer: vi.fn(),
  startSession: vi.fn(),
  stopServer: vi.fn(async () => undefined),
  stopSession: vi.fn(async () => undefined),
};

describe('useTrainingSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as unknown as { electronAPI: unknown }).electronAPI = { training };
  });

  it('lance puis arrête une session', async () => {
    training.startServer.mockResolvedValue({ success: true, serverInfo: { url: 'http://x' } });
    training.startSession.mockResolvedValue({ success: true });
    const toast = vi.fn();
    const { result } = renderHook(() => useTrainingSession(toast));
    let ok = false;
    await act(async () => {
      ok = await result.current.handleLaunchTraining('E', 3);
    });
    expect(ok).toBe(true);
    expect(result.current).toMatchObject({
      trainingActive: true,
      showTrainingPanel: true,
      trainingServerUrl: 'http://x',
      trainingStrips: 3,
      trainingWeapon: 'E',
      trainingLaunching: false,
    });
    await act(async () => {
      await result.current.handleStopTraining();
    });
    expect(training.stopSession).toHaveBeenCalled();
    expect(result.current.trainingActive).toBe(false);
    expect(result.current.showTrainingModal).toBe(true);
  });

  it('session refusée : serveur arrêté, toast d’erreur', async () => {
    training.startServer.mockResolvedValue({ success: true, serverInfo: { url: 'http://x' } });
    training.startSession.mockResolvedValue({ success: false, error: 'boom' });
    const toast = vi.fn();
    const { result } = renderHook(() => useTrainingSession(toast));
    let ok = true;
    await act(async () => {
      ok = await result.current.handleLaunchTraining('E', 1);
    });
    expect(ok).toBe(false);
    expect(training.stopServer).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(result.current.trainingActive).toBe(false);
  });
});
