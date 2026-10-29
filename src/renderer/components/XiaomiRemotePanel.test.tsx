// @vitest-environment jsdom
/**
 * Tests de composant - XiaomiRemotePanel : liste des clients par push, sans polling (#1291, #1292)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }));
import { XiaomiRemotePanel } from './XiaomiRemotePanel';

let remote: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  remote = {
    getConnectedClients: vi.fn().mockResolvedValue({ success: true, clients: [] }),
    onClientListUpdate: vi.fn(() => () => {}),
  };
  (window as any).electronAPI = { remote };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as any).electronAPI;
});

describe('XiaomiRemotePanel', () => {
  it('charge la liste une fois puis ne réinterroge pas le processus principal', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setInterval');
    render(
      <XiaomiRemotePanel
        competitionId="c1"
        serverUrl="http://h:8066"
        arenaCount={2}
        onClose={() => {}}
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(remote.getConnectedClients).toHaveBeenCalledTimes(1);
    expect(remote.onClientListUpdate).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  it('ignore la liste poussée par une autre compétition', async () => {
    let push: (c: any[], id?: string | null) => void = () => {};
    remote.onClientListUpdate.mockImplementation(((cb: typeof push) => {
      push = cb;
      return () => {};
    }) as any);
    const { container } = render(
      <XiaomiRemotePanel
        competitionId="c1"
        serverUrl="http://h:8066"
        arenaCount={2}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(remote.getConnectedClients).toHaveBeenCalled());
    const clientsFor = (label: string, id: string) => [
      {
        socketId: id.repeat(9),
        clientType: 'kiosk',
        label,
        lastSeen: new Date().toISOString(),
        ip: '1.1.1.1',
      },
    ];
    act(() => push(clientsFor('Etranger', 'b'), 'c2'));
    expect(container.textContent).not.toContain('Etranger');
    act(() => push(clientsFor('Propre', 'a'), 'c1'));
    expect(container.textContent).toContain('Propre');
  });
});
