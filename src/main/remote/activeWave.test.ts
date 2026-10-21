/**
 * Vague active des rapières : mémorisée sans serveur démarré, réappliquée au
 * (re)démarrage du serveur (#1118).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activeWaves, applyActiveWave, setActiveWave } from './activeWave';
import { remoteServers } from '../remoteRegistry';
import type { RemoteScoreServer } from '../remoteScoreServer';

const fakeServer = () => {
  const setActiveWaveMatchIds = vi.fn();
  return {
    server: { setActiveWaveMatchIds } as unknown as RemoteScoreServer,
    setActiveWaveMatchIds,
  };
};

describe('applyActiveWave', () => {
  beforeEach(() => activeWaves.clear());

  it('réapplique la vague mémorisée (y compris aucune vague lancée = liste vide)', () => {
    activeWaves.set('c1', []);
    const { server, setActiveWaveMatchIds } = fakeServer();
    applyActiveWave('c1', server);
    expect(setActiveWaveMatchIds).toHaveBeenCalledWith([]);
    activeWaves.set('c1', ['m1', 'm2']);
    applyActiveWave('c1', server);
    expect(setActiveWaveMatchIds).toHaveBeenLastCalledWith(['m1', 'm2']);
  });

  it('rien de mémorisé (hors rapières) : serveur laissé sans filtre', () => {
    const { server, setActiveWaveMatchIds } = fakeServer();
    applyActiveWave('c2', server);
    expect(setActiveWaveMatchIds).not.toHaveBeenCalled();
  });

  it('setActiveWave sans serveur : mémorisé ; avec serveur : appliqué ; non-tableau = null', () => {
    setActiveWave('c3', ['m1']);
    expect(activeWaves.get('c3')).toEqual(['m1']);
    const { server, setActiveWaveMatchIds } = fakeServer();
    remoteServers.set('c3', { server, port: 1, host: 'h', useHttps: false });
    setActiveWave('c3', 'x');
    expect(setActiveWaveMatchIds).toHaveBeenCalledWith(null);
    remoteServers.delete('c3');
  });
});
