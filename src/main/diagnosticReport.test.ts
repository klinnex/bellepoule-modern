import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import {
  buildDiagnosticReport,
  diagnosticFileName,
  type DiagnosticInput,
} from './diagnosticReport';
import { exportDiagnosticReport } from './ipc/diagnosticHandlers';

const input: DiagnosticInput = {
  appVersion: '5.9.0',
  build: 1521,
  channel: 'dev',
  platform: 'linux',
  arch: 'x64',
  osRelease: '6.8.0',
  locale: 'fr',
  electronVersion: '45.0.0',
  chromeVersion: '130.0.0',
  nodeVersion: '24.0.0',
  uptimeSeconds: 120,
  memoryRssMb: 210,
  activeRemoteServers: 2,
  generatedAt: new Date('2026-10-30T19:28:00.000Z'),
};

describe('buildDiagnosticReport (#1326)', () => {
  it('ne garde que la liste blanche de champs', () => {
    const report = buildDiagnosticReport({
      ...input,
      // champs parasites : ne doivent jamais sortir dans le rapport
      password: 'secret',
      token: 'jeton',
      dataPath: '/home/user/.config/bellepoule',
      fencerName: 'DUPONT Jean',
    } as DiagnosticInput);
    expect(Object.keys(report).sort()).toEqual([
      'app',
      'generatedAt',
      'runtime',
      'schemaVersion',
      'system',
    ]);
    expect(JSON.stringify(report)).not.toMatch(/secret|jeton|bellepoule|DUPONT/);
  });

  it('sérialise la date en ISO et conserve les versions', () => {
    const report = buildDiagnosticReport(input);
    expect(report.schemaVersion).toBe(1);
    expect(report.generatedAt).toBe('2026-10-30T19:28:00.000Z');
    expect(report.app).toEqual({ version: '5.9.0', build: 1521, channel: 'dev' });
    expect(report.runtime).toEqual({
      electron: '45.0.0',
      chrome: '130.0.0',
      node: '24.0.0',
      uptimeSeconds: 120,
      memoryRssMb: 210,
      activeRemoteServers: 2,
    });
  });
});

describe('diagnosticFileName (#1326)', () => {
  it('produit un nom de fichier horodaté sans caractères interdits', () => {
    expect(diagnosticFileName('2026-10-30T19:28:00.000Z')).toBe(
      'bellepoule-diagnostic-20261030T192800.json'
    );
  });
});

describe('exportDiagnosticReport (#1326)', () => {
  it('écrit le JSON au chemin choisi avec le nom proposé', async () => {
    const writeFile = vi.fn(async () => {});
    const chooseSavePath = vi.fn(async () => '/tmp/rapport.json');
    const result = await exportDiagnosticReport({
      collect: () => input,
      chooseSavePath,
      writeFile,
    });
    expect(result).toEqual({ success: true });
    expect(chooseSavePath).toHaveBeenCalledWith('bellepoule-diagnostic-20261030T192800.json');
    const [path, content] = writeFile.mock.calls[0] as unknown as [string, string];
    expect(path).toBe('/tmp/rapport.json');
    expect(JSON.parse(content).app.build).toBe(1521);
  });

  it('signale une annulation sans rien écrire', async () => {
    const writeFile = vi.fn(async () => {});
    const result = await exportDiagnosticReport({
      collect: () => input,
      chooseSavePath: async () => undefined,
      writeFile,
    });
    expect(result).toEqual({ success: false, cancelled: true });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("renvoie une erreur lisible si l'écriture échoue", async () => {
    const result = await exportDiagnosticReport({
      collect: () => input,
      chooseSavePath: async () => '/tmp/x.json',
      writeFile: async () => {
        throw new Error('disque plein');
      },
    });
    expect(result).toEqual({ success: false, error: 'disque plein' });
  });
});
