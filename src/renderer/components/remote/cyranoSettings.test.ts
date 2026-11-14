// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  autoStartCyrano,
  formatCyranoLog,
  readOptions,
  writeAutoStart,
  writeHost,
  writePistes,
  writePort,
} from './cyranoSettings';

describe('réglages Cyrano (#1829)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    localStorage.clear();
    api = {
      start: vi.fn().mockResolvedValue({ success: true, port: 50101 }),
      setPistes: vi.fn().mockResolvedValue(undefined),
      setOptions: vi.fn().mockResolvedValue(undefined),
    };
    (window as unknown as { electronAPI: unknown }).electronAPI = { cyrano: api };
  });

  it('démarrage automatique désactivé par défaut', async () => {
    writePistes([{ piste: '1', ip: '10.0.0.1' }]);
    expect(await autoStartCyrano()).toBe(false);
    expect(api.start).not.toHaveBeenCalled();
  });

  it('démarrage automatique : port, interface, pistes complètes et options', async () => {
    writeAutoStart(true);
    writePort(50101);
    writeHost('192.168.1.10');
    writePistes([
      { piste: '1', ip: '10.0.0.1' },
      { piste: '', ip: '10.0.0.2' },
    ]);
    expect(await autoStartCyrano()).toBe(true);
    expect(api.start).toHaveBeenCalledWith({ port: 50101, host: '192.168.1.10' });
    expect(api.setPistes).toHaveBeenCalledWith([{ piste: '1', ip: '10.0.0.1' }]);
    expect(api.setOptions).toHaveBeenCalledWith(readOptions());
  });

  it('démarrage automatique sans piste : rien', async () => {
    writeAutoStart(true);
    expect(await autoStartCyrano()).toBe(false);
  });

  it('journal exportable : une trame par ligne', () => {
    const text = formatCyranoLog([
      { ts: 0, dir: 'in', ip: '10.0.0.1', port: 50100, piste: '1', raw: '|EFP1.1|INFO|1|\r\n' },
      {
        ts: 1000,
        dir: 'out',
        ip: '10.0.0.9',
        port: 50100,
        piste: null,
        raw: '|x|',
        rejected: 'unknown_ip',
      },
    ]);
    expect(text.split('\n')).toEqual([
      '1970-01-01T00:00:00.000Z\tIN\t10.0.0.1:50100\t1\t|EFP1.1|INFO|1|',
      '1970-01-01T00:00:01.000Z\tOUT\t10.0.0.9:50100\t-\t|x|\tunknown_ip',
    ]);
  });
});
