import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseSha256Digest,
  isTrustedDownloadUrl,
  sha256File,
  verifyFileSha256,
} from './updateIntegrity';

const HEX = 'a'.repeat(64);

describe('parseSha256Digest', () => {
  it('extrait le hash sha256', () => {
    expect(parseSha256Digest(`sha256:${HEX.toUpperCase()}`)).toBe(HEX);
  });

  it('rejette les formats invalides', () => {
    expect(parseSha256Digest(undefined)).toBeNull();
    expect(parseSha256Digest(null)).toBeNull();
    expect(parseSha256Digest('')).toBeNull();
    expect(parseSha256Digest(HEX)).toBeNull();
    expect(parseSha256Digest(`sha1:${HEX}`)).toBeNull();
    expect(parseSha256Digest('sha256:abc')).toBeNull();
  });
});

describe('isTrustedDownloadUrl', () => {
  it('accepte les hôtes GitHub en HTTPS', () => {
    expect(
      isTrustedDownloadUrl('https://github.com/klinnex/bellepoule-modern/releases/download/x/a.exe')
    ).toBe(true);
    expect(isTrustedDownloadUrl('https://objects.githubusercontent.com/foo')).toBe(true);
    expect(isTrustedDownloadUrl('https://release-assets.githubusercontent.com/foo')).toBe(true);
  });

  it('rejette HTTP, hôtes inconnus et valeurs invalides', () => {
    expect(isTrustedDownloadUrl('http://github.com/a.exe')).toBe(false);
    expect(isTrustedDownloadUrl('https://evil.com/a.exe')).toBe(false);
    expect(isTrustedDownloadUrl('https://github.com.evil.com/a.exe')).toBe(false);
    expect(isTrustedDownloadUrl('not a url')).toBe(false);
    expect(isTrustedDownloadUrl(undefined)).toBe(false);
  });
});

describe('sha256File / verifyFileSha256', () => {
  let dir: string;
  let file: string;
  const content = 'bellepoule-installer';
  const expected = crypto.createHash('sha256').update(content).digest('hex');

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-integrity-'));
    file = path.join(dir, 'installer.bin');
    fs.writeFileSync(file, content);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('calcule le sha256', async () => {
    expect(await sha256File(file)).toBe(expected);
  });

  it('valide un hash correct', async () => {
    expect(await verifyFileSha256(file, expected)).toBe(true);
    expect(await verifyFileSha256(file, expected.toUpperCase())).toBe(true);
  });

  it('rejette un hash incorrect ou invalide', async () => {
    expect(await verifyFileSha256(file, HEX)).toBe(false);
    expect(await verifyFileSha256(file, 'zz')).toBe(false);
  });
});
