import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  normalizeBypass,
  normalizeProxyServer,
  readProxySettings,
  sanitizeProxySettings,
  toElectronProxyConfig,
  writeProxySettings,
} from './proxySettings';

describe('normalizeProxyServer', () => {
  it('hôte:port → http implicite', () => {
    expect(normalizeProxyServer(' proxy.club.fr:3128 ')).toBe('http://proxy.club.fr:3128');
    expect(normalizeProxyServer('10.0.0.1:8080')).toBe('http://10.0.0.1:8080');
  });

  it('schémas acceptés', () => {
    expect(normalizeProxyServer('socks5://127.0.0.1:1080')).toBe('socks5://127.0.0.1:1080');
    expect(normalizeProxyServer('HTTPS://Proxy:443')).toBe('https://proxy:443');
  });

  it('refuse identifiants, chemin, port absent/invalide, schéma inconnu', () => {
    for (const bad of [
      '',
      'proxy',
      'proxy:0',
      'proxy:70000',
      'user:pw@proxy:8080',
      'http://proxy:8080/path',
      'ftp://proxy:21',
      'proxy :8080',
      42,
    ]) {
      expect(normalizeProxyServer(bad)).toBeNull();
    }
  });
});

describe('normalizeBypass', () => {
  it('nettoie la liste', () => {
    expect(normalizeBypass(' *.local ; 192.168.0.0/16\nintranet ,, ')).toBe(
      '*.local,192.168.0.0/16,intranet'
    );
    expect(normalizeBypass('bad host')).toBe('');
  });
});

describe('sanitizeProxySettings / toElectronProxyConfig', () => {
  it('modes système et direct', () => {
    expect(toElectronProxyConfig(sanitizeProxySettings({ mode: 'system' })!)).toEqual({
      mode: 'system',
    });
    expect(toElectronProxyConfig(sanitizeProxySettings({ mode: 'direct' })!)).toEqual({
      mode: 'direct',
    });
  });

  it('manuel : serveur + exclusions, machine locale toujours en direct', () => {
    const s = sanitizeProxySettings({ mode: 'manual', server: 'proxy:3128', bypass: '*.club' });
    expect(s).toEqual({ mode: 'manual', server: 'http://proxy:3128', bypass: '*.club' });
    expect(toElectronProxyConfig(s!)).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http://proxy:3128',
      proxyBypassRules: '<local>,*.club',
    });
  });

  it('manuel sans serveur valide ou mode inconnu → null', () => {
    expect(sanitizeProxySettings({ mode: 'manual', server: 'nope' })).toBeNull();
    expect(sanitizeProxySettings({ mode: 'pac' })).toBeNull();
  });
});

describe('persistance', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('défaut système ; relit ce qui est écrit ; fichier corrompu → défaut', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-proxy-'));
    expect(readProxySettings(dir)).toEqual({ mode: 'system' });
    writeProxySettings(dir, { mode: 'manual', server: 'http://p:8080' });
    expect(readProxySettings(dir)).toEqual({ mode: 'manual', server: 'http://p:8080' });
    fs.writeFileSync(path.join(dir, 'proxy-settings.json'), '{"mode":"manual"}');
    expect(readProxySettings(dir)).toEqual({ mode: 'system' });
  });
});
