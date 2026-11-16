/**
 * Archives .bpm chiffrées (RGPD, #1882) : aller-retour, mauvais mot de passe, altération.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  decryptBpmBuffer,
  decryptBpmFile,
  encryptBpmBuffer,
  encryptBpmFile,
  isEncryptedBpm,
  isEncryptedBpmBuffer,
} from './bpmCrypto';

const plain = Buffer.from('SQLite format 3\u0000 données de test');

describe('bpmCrypto', () => {
  it('chiffre puis déchiffre à l’identique', async () => {
    const enc = await encryptBpmBuffer(plain, 'motdepasse-solide');
    expect(isEncryptedBpmBuffer(enc)).toBe(true);
    expect(enc.includes(Buffer.from('données'))).toBe(false);
    expect((await decryptBpmBuffer(enc, 'motdepasse-solide')).equals(plain)).toBe(true);
  });

  it('refuse un mauvais mot de passe et un fichier altéré', async () => {
    const enc = await encryptBpmBuffer(plain, 'motdepasse-solide');
    await expect(decryptBpmBuffer(enc, 'autre-motdepasse')).rejects.toThrow('wrong_password');
    const altered = Buffer.from(enc);
    altered[altered.length - 20] ^= 0xff;
    await expect(decryptBpmBuffer(altered, 'motdepasse-solide')).rejects.toThrow('wrong_password');
    await expect(decryptBpmBuffer(plain, 'x')).rejects.toThrow('not_encrypted');
  });

  it('refuse un mot de passe trop court', async () => {
    await expect(encryptBpmBuffer(plain, 'court')).rejects.toThrow('password_too_short');
  });

  it('chiffre un fichier en place et le détecte', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpmenc-'));
    const f = path.join(dir, 'a.bpm');
    const out = path.join(dir, 'b.bpm');
    fs.writeFileSync(f, plain);
    expect(await isEncryptedBpm(f)).toBe(false);
    await encryptBpmFile(f, 'motdepasse-solide');
    expect(await isEncryptedBpm(f)).toBe(true);
    await decryptBpmFile(f, out, 'motdepasse-solide');
    expect(fs.readFileSync(out).equals(plain)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
