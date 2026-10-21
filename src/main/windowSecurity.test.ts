import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isAllowedExternalUrl, isAppUrl, isPermissionAllowed } from './windowSecurity';

const prod = { dev: false, rendererDir: '/opt/app/dist/renderer' };
const dev = { dev: true, rendererDir: '/opt/app/dist/renderer' };

describe('isAppUrl (#1148)', () => {
  it('prod : file:// du bundle uniquement', () => {
    expect(isAppUrl('file:///opt/app/dist/renderer/index.html', prod)).toBe(true);
    expect(isAppUrl('file:///etc/passwd', prod)).toBe(false);
    expect(isAppUrl('file:///opt/app/dist/renderer-evil/x.html', prod)).toBe(false);
    expect(isAppUrl('https://evil.example/', prod)).toBe(false);
    expect(isAppUrl('http://localhost:8066/', prod)).toBe(false);
    expect(isAppUrl('not a url', prod)).toBe(false);
  });
  it('dev : serveur webpack uniquement', () => {
    expect(isAppUrl('http://localhost:8066/index.html', dev)).toBe(true);
    expect(isAppUrl('http://localhost:9999/', dev)).toBe(false);
    expect(isAppUrl('http://localhost:8066.evil.com/', dev)).toBe(false);
  });
});

describe('isAllowedExternalUrl', () => {
  it('https oui, http seulement réseau local, autres schémas non', () => {
    expect(isAllowedExternalUrl('https://github.com/klinnex')).toBe(true);
    expect(isAllowedExternalUrl('http://192.168.1.10:8066/arene1')).toBe(true);
    expect(isAllowedExternalUrl('http://localhost:8066/')).toBe(true);
    expect(isAllowedExternalUrl('http://evil.example/')).toBe(false);
    expect(isAllowedExternalUrl('http://localhost.evil.example/')).toBe(false);
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('smb://host/share')).toBe(false);
  });
});

describe('isPermissionAllowed', () => {
  const app = (u: string) => u.startsWith('file:///app/');
  it('caméra depuis l’app uniquement, sans micro', () => {
    expect(isPermissionAllowed('media', 'file:///app/index.html', app, ['video'])).toBe(true);
    expect(isPermissionAllowed('media', 'file:///app/index.html', app, ['video', 'audio'])).toBe(
      false
    );
    expect(isPermissionAllowed('media', 'https://evil.example/', app, ['video'])).toBe(false);
    expect(isPermissionAllowed('geolocation', 'file:///app/index.html', app)).toBe(false);
    expect(isPermissionAllowed('microphone', 'file:///app/index.html', app)).toBe(false);
  });
});

describe('configuration Electron (#1148)', () => {
  const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  it('fenêtre principale en sandbox avec garde-fous', () => {
    expect(main).toMatch(
      /contextIsolation: true,\s+sandbox: true,\s+preload: path\.join\(__dirname, 'preload\.js'\)/
    );
    expect(main).toContain('setWindowOpenHandler');
    expect(main).toContain("'will-navigate'");
    expect(main).toContain('setPermissionCheckHandler');
  });
  it('fuses : RunAsNode off, asar seul', () => {
    expect(pkg.build.electronFuses).toMatchObject({
      runAsNode: false,
      enableNodeCliInspectArguments: false,
      onlyLoadAppFromAsar: true,
    });
  });
  it('meta CSP du renderer sans unsafe-inline pour les scripts', () => {
    const html = readFileSync(join(__dirname, '../renderer/index.html'), 'utf8');
    expect(html).toMatch(/script-src 'self';/);
  });
  it('meta CSP du renderer sans unsafe-inline pour les styles (#1157)', () => {
    const html = readFileSync(join(__dirname, '../renderer/index.html'), 'utf8');
    expect(html).toMatch(/style-src 'self';/);
  });
});
