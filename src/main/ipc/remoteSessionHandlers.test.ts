import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...args: any[]) => any) => handlers.set(ch, fn) },
}));

import { registerRemoteSessionHandlers } from './remoteSessionHandlers';

describe('registerRemoteSessionHandlers (#1341)', () => {
  beforeEach(() => {
    handlers.clear();
    registerRemoteSessionHandlers();
  });

  it('enregistre les canaux de session et de réglages', () => {
    for (const ch of [
      'remote:stopSession',
      'remote:launchCompetition',
      'remote:getSession',
      'remote:getArenas',
      'remote:updateStripCount',
      'remote:updateShowPhotos',
      'remote:updateCardAnnounce',
      'remote:updateTheme',
      'remote:updateArenaTheme',
      'remote:clearArenaThemeOverride',
    ]) {
      expect(handlers.has(ch)).toBe(true);
    }
  });

  it('stopSession : serveur absent', async () => {
    const res = await handlers.get('remote:stopSession')!({}, 'inconnu');
    expect(res.success).toBe(false);
  });
});
