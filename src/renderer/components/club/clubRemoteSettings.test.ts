import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CLUB_REMOTE,
  isValidArenaPassword,
  networkChanged,
  parseClubRemoteSettings,
} from './clubRemoteSettings';

describe('clubRemoteSettings (#1872)', () => {
  it('valeurs invalides ou absentes : défauts', () => {
    expect(parseClubRemoteSettings(null)).toEqual(DEFAULT_CLUB_REMOTE);
    expect(parseClubRemoteSettings({ port: 70000, https: 'oui', theme: 'rose' })).toEqual(
      DEFAULT_CLUB_REMOTE
    );
    expect(
      parseClubRemoteSettings({ port: 9000, https: false, theme: 'neon' }, '10.0.0.2')
    ).toEqual({ iface: '10.0.0.2', port: 9000, https: false, theme: 'neon' });
  });

  it('mot de passe : vide ou 8 caractères minimum', () => {
    expect(isValidArenaPassword('')).toBe(true);
    expect(isValidArenaPassword('1234567')).toBe(false);
    expect(isValidArenaPassword('12345678')).toBe(true);
  });

  it('seuls interface, port et HTTPS demandent un redémarrage', () => {
    expect(networkChanged(DEFAULT_CLUB_REMOTE, { ...DEFAULT_CLUB_REMOTE, theme: 'neon' })).toBe(
      false
    );
    expect(networkChanged(DEFAULT_CLUB_REMOTE, { ...DEFAULT_CLUB_REMOTE, port: 9000 })).toBe(true);
  });
});
