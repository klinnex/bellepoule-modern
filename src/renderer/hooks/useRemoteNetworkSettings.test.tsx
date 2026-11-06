// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRemoteNetworkSettings } from './useRemoteNetworkSettings';

beforeEach(() => {
  localStorage.clear();
  (window as any).electronAPI = {
    remote: {
      getNetworkInterfaces: vi.fn().mockResolvedValue({
        success: true,
        interfaces: [{ name: 'eth0', address: '192.168.1.10' }],
      }),
    },
  };
});

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('useRemoteNetworkSettings', () => {
  it('valeurs par défaut : HTTPS, port 8066, toutes les interfaces', () => {
    const { result } = renderHook(() => useRemoteNetworkSettings('c1'));
    expect(result.current.useHttps).toBe(true);
    expect(result.current.remotePort).toBe(8066);
    expect(result.current.selectedInterface).toBe('0.0.0.0');
  });

  it('relit les réglages enregistrés (port par compétition)', () => {
    localStorage.setItem('bellepoule-remote-https', 'false');
    localStorage.setItem('bellepoule-remote-port-c1', '9000');
    localStorage.setItem('bellepoule-remote-interface', '10.0.0.1');
    const { result } = renderHook(() => useRemoteNetworkSettings('c1'));
    expect(result.current.useHttps).toBe(false);
    expect(result.current.remotePort).toBe(9000);
    expect(result.current.selectedInterface).toBe('10.0.0.1');
  });

  it('charge la liste des interfaces réseau', async () => {
    const { result } = renderHook(() => useRemoteNetworkSettings('c1'));
    await waitFor(() =>
      expect(result.current.networkInterfaces).toEqual([{ name: 'eth0', address: '192.168.1.10' }])
    );
  });
});
