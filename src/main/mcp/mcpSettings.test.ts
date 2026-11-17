import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getMcpToken,
  readMcpSettings,
  regenerateMcpToken,
  writeMcpSettings,
  type SecretBox,
} from './mcpSettings';

const box = (available: boolean): SecretBox => ({
  isEncryptionAvailable: () => available,
  encryptString: s => Buffer.from(s.split('').reverse().join('')),
  decryptString: b => b.toString().split('').reverse().join(''),
});

describe('mcpSettings (#1880)', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'));

  it('désactivé par défaut, port validé', () => {
    const d = dir();
    expect(readMcpSettings(d)).toEqual({ enabled: false, port: 8067, allowWrite: false });
    writeMcpSettings(d, { enabled: true, port: 80, allowWrite: true });
    expect(readMcpSettings(d)).toEqual({ enabled: true, port: 8067, allowWrite: true });
  });

  it('jeton chiffré, stable, renouvelable', () => {
    const d = dir();
    const t1 = getMcpToken(d, box(true));
    expect(t1.length).toBeGreaterThanOrEqual(40);
    expect(fs.readFileSync(path.join(d, 'mcp-token.bin')).toString()).not.toContain(t1);
    expect(getMcpToken(d, box(true))).toBe(t1);
    const t2 = regenerateMcpToken(d, box(true));
    expect(t2).not.toBe(t1);
    expect(getMcpToken(d, box(true))).toBe(t2);
  });
});

describe('jeton illisible (#1880)', () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'));

  it('autre trousseau : jamais remplacé en silence, régénération explicite', () => {
    const d = dir();
    const t1 = getMcpToken(d, box(true));
    const file = path.join(d, 'mcp-token.bin');
    const before = fs.readFileSync(file);
    // Contexte sans trousseau (service, SSH) ou déchiffrement refusé
    expect(() => getMcpToken(d, box(false))).toThrow(/illisible/);
    const broken: SecretBox = {
      ...box(true),
      decryptString: () => {
        throw new Error('Error while decrypting the ciphertext');
      },
    };
    expect(() => getMcpToken(d, broken)).toThrow(/illisible/);
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    const t2 = regenerateMcpToken(d, box(false));
    expect(t2).not.toBe(t1);
    expect(getMcpToken(d, box(false))).toBe(t2);
  });

  it('fichier corrompu : erreur, pas de nouveau jeton', () => {
    const d = dir();
    fs.writeFileSync(path.join(d, 'mcp-token.bin'), 'contenu inattendu');
    expect(() => getMcpToken(d, box(true))).toThrow(/illisible/);
  });
});
