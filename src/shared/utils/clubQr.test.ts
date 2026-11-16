import { describe, it, expect } from 'vitest';
import { arenaQrPayload, memberQrPayload, normalizeCardCode, parseClubQr } from './clubQr';

describe('QR Mode Club (#1872)', () => {
  it('membre : aller-retour, casse tolérée', () => {
    expect(memberQrPayload('a1b2c3d4e5')).toBe('BPC1:M:A1B2C3D4E5');
    expect(parseClubQr(' BPC1:M:a1b2c3d4e5 ')).toEqual({ kind: 'member', code: 'A1B2C3D4E5' });
    expect(() => memberQrPayload('xyz')).toThrow();
  });

  it('piste : aller-retour, bornes 1..99', () => {
    expect(arenaQrPayload(3)).toBe('BPC1:A:3');
    expect(parseClubQr('BPC1:A:12')).toEqual({ kind: 'arena', number: 12 });
    expect(() => arenaQrPayload(0)).toThrow();
    expect(() => arenaQrPayload(100)).toThrow();
    expect(parseClubQr('BPC1:A:0')).toBeNull();
    expect(parseClubQr('BPC1:A:123')).toBeNull();
  });

  it('rejette tout autre contenu', () => {
    for (const t of [
      '',
      'https://x/arene1',
      'BPC2:M:A1B2C3D4E5',
      'BPC1:M:A1B2',
      'BPC1:X:1',
      'BPC1:M:A1B2C3D4E5:x',
      42,
    ]) {
      expect(parseClubQr(t)).toBeNull();
    }
    expect(normalizeCardCode('G1B2C3D4E5')).toBeNull();
  });
});
