import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const handlers = new Map<string, (...args: any[]) => any>();
const stopSpy = vi.fn();

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));
vi.mock('../remoteScoreServer', () => ({
  RemoteScoreServer: class {
    start = vi.fn().mockResolvedValue(undefined);
    stop = stopSpy;
    setTtsConfig = vi.fn();
    getServerUrl = () => 'http://127.0.0.1:8066';
    getLocalIPAddress = () => '127.0.0.1';
  },
}));
vi.mock('../certManager', () => ({ ensureCert: vi.fn() }));
vi.mock('../mainWindowRef', () => ({ setSharedMainWindow: vi.fn() }));
vi.mock('../demoScreens', () => ({ openDemoScreens: vi.fn(), closeDemoScreens: vi.fn() }));

import { registerTrainingHandlers } from './trainingHandlers';
import { remoteServers, usedPorts } from '../remoteRegistry';

/** Fenêtre principale factice : événements de fenêtre et de webContents */
function fakeWindow() {
  const win = new EventEmitter() as EventEmitter & {
    webContents: EventEmitter;
    isDestroyed(): boolean;
  };
  win.webContents = new EventEmitter();
  win.isDestroyed = () => false;
  return win;
}

describe('registerTrainingHandlers : arrêt du serveur d’entraînement / démo', () => {
  let win: ReturnType<typeof fakeWindow>;

  beforeEach(async () => {
    handlers.clear();
    remoteServers.clear();
    usedPorts.clear();
    stopSpy.mockClear();
    win = fakeWindow();
    registerTrainingHandlers({ db: {} as never, getMainWindow: () => win as never });
    const res = await handlers.get('training:startServer')!({}, 8066, '127.0.0.1');
    expect(res.success).toBe(true);
  });

  it('stopServer libère le port et arrête le serveur', async () => {
    expect(await handlers.get('training:stopServer')!({})).toEqual({ success: true });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(remoteServers.has('__training__')).toBe(false);
    expect(usedPorts.has(8066)).toBe(false);
    // Écouteurs de la fenêtre détachés : pas de second arrêt
    win.emit('closed');
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('fenêtre principale fermée (macOS, app dans le Dock) → serveur arrêté', () => {
    win.emit('closed');
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(remoteServers.has('__training__')).toBe(false);
  });

  it('fenêtre principale rechargée (bouton « Arrêter » perdu) → serveur arrêté', () => {
    win.webContents.emit('did-navigate');
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(usedPorts.has(8066)).toBe(false);
  });
});
