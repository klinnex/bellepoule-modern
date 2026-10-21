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
    activeWaves.set('c1', { ids: [], poolsClosed: false });
    const { server, setActiveWaveMatchIds } = fakeServer();
    applyActiveWave('c1', server);
    expect(setActiveWaveMatchIds).toHaveBeenCalledWith([], false);
    activeWaves.set('c1', { ids: ['m1', 'm2'], poolsClosed: false });
    applyActiveWave('c1', server);
    expect(setActiveWaveMatchIds).toHaveBeenLastCalledWith(['m1', 'm2'], false);
  });

  it('vagues terminées : fermeture des poules réappliquée au redémarrage (#1118)', () => {
    setActiveWave('c4', null, true);
    const { server, setActiveWaveMatchIds } = fakeServer();
    applyActiveWave('c4', server);
    expect(setActiveWaveMatchIds).toHaveBeenCalledWith(null, true);
  });

  it('rien de mémorisé (hors rapières) : serveur laissé sans filtre', () => {
    const { server, setActiveWaveMatchIds } = fakeServer();
    applyActiveWave('c2', server);
    expect(setActiveWaveMatchIds).not.toHaveBeenCalled();
  });

  it('setActiveWave sans serveur : mémorisé ; avec serveur : appliqué ; non-tableau = null', () => {
    setActiveWave('c3', ['m1']);
    expect(activeWaves.get('c3')).toEqual({ ids: ['m1'], poolsClosed: false });
    const { server, setActiveWaveMatchIds } = fakeServer();
    remoteServers.set('c3', { server, port: 1, host: 'h', useHttps: false });
    setActiveWave('c3', 'x');
    expect(setActiveWaveMatchIds).toHaveBeenCalledWith(null, false);
    remoteServers.delete('c3');
  });
});
