import { it, expect, describe } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseManager } from './index';

// Module natif : recompilé pour Electron en CI (postinstall) → test ignoré si non chargeable
const nativeOk = (() => {
  try {
    const D = require('better-sqlite3-multiple-ciphers');
    new D(':memory:').close();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!nativeOk)('DatabaseManager chiffré (#1882)', () => {
  it('migration en clair puis ouverture chiffrée avec migrations', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-int-'));
    const file = path.join(dir, 'bellepoule.db');
    const SECRET = 'NOM-SECRET-XYZ';
    const plain = new DatabaseManager(file);
    await plain.open();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (plain as any).db
      .prepare(
        "INSERT INTO competitions (id, title, date, weapon, gender, category, created_at, updated_at) VALUES ('c1', ?, '2026-01-01', 'E', 'MALE', 'SENIOR', '2026-01-01', '2026-01-01')"
      )
      .run(SECRET);
    plain.close();
    expect(fs.readFileSync(file).includes(SECRET)).toBe(true);

    const key = Buffer.alloc(32, 4);
    const enc = new DatabaseManager(file);
    await enc.open(file, { encryptionKey: key });
    expect(enc.isEncrypted()).toBe(true);
    expect(enc.getAllCompetitions().map(c => c.title)).toContain(SECRET);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enc as any).db
      .prepare(
        "INSERT INTO competitions (id, title, date, weapon, gender, category, created_at, updated_at) VALUES ('c2', 'AUTRE', '2026-01-02', 'E', 'MALE', 'SENIOR', '2026-01-02', '2026-01-02')"
      )
      .run();
    enc.saveSync();
    enc.close();
    expect(fs.readFileSync(file).includes(SECRET)).toBe(false);
    expect(fs.readdirSync(dir).sort()).toEqual(['bellepoule.db']);

    const bad = new DatabaseManager(file);
    await expect(bad.open(file, { encryptionKey: Buffer.alloc(32, 5) })).rejects.toThrow(
      /déchiffrer/
    );
    const nokey = new DatabaseManager(file);
    await expect(nokey.open(file)).rejects.toThrow(/clé/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
