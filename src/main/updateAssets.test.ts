import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cleanupReplacedExecutable,
  detectInstallKind,
  isSafePortableCleanup,
  portableSideBySidePath,
  replaceExecutableInPlace,
  selectUpdateAsset,
} from './updateAssets';

const V = '1.4.2';
const asset = (name: string) => ({ name, size: 1 });
const ASSETS = [
  asset(`BellePoule-Modern-${V}-win-x64-portable.exe`),
  asset(`BellePoule-Modern-${V}-win-x64-setup.exe`),
  asset(`BellePoule-Modern-${V}-mac-x64.dmg`),
  asset(`BellePoule-Modern-${V}-mac-arm64.dmg`),
  asset(`BellePoule-Modern-${V}-mac-arm64.zip`),
  asset(`BellePoule-Modern-${V}-linux-amd64.deb`),
  asset(`BellePoule-Modern-${V}-linux-x86_64.rpm`),
  asset(`BellePoule-Modern-${V}-linux-x86_64.AppImage`),
  asset(`BellePoule-Modern-${V}-linux-arm64.AppImage`),
];

describe('detectInstallKind', () => {
  it('AppImage sous Linux', () => {
    expect(detectInstallKind('linux', { APPIMAGE: '/opt/bp.AppImage' })).toEqual({
      kind: 'appimage',
      target: '/opt/bp.AppImage',
    });
  });

  it('exe portable sous Windows', () => {
    expect(detectInstallKind('win32', { PORTABLE_EXECUTABLE_FILE: 'C:\\bp.exe' }).kind).toBe(
      'portable'
    );
  });

  it('installeur par défaut', () => {
    expect(detectInstallKind('darwin', { APPIMAGE: '/x' })).toEqual({
      kind: 'installer',
      target: null,
    });
  });
});

describe('selectUpdateAsset', () => {
  const pick = (p: NodeJS.Platform, arch: string, kind: 'appimage' | 'portable' | 'installer') =>
    selectUpdateAsset(ASSETS, p, arch, kind)?.name;

  it('Windows installé → setup NSIS, jamais le portable', () => {
    expect(pick('win32', 'x64', 'installer')).toMatch(/-setup\.exe$/);
  });

  it('Windows portable → portable', () => {
    expect(pick('win32', 'x64', 'portable')).toMatch(/-portable\.exe$/);
  });

  it('macOS respecte l’architecture', () => {
    expect(pick('darwin', 'arm64', 'installer')).toMatch(/mac-arm64\.dmg$/);
    expect(pick('darwin', 'x64', 'installer')).toMatch(/mac-x64\.dmg$/);
  });

  it('Linux AppImage → AppImage de la bonne arch', () => {
    expect(pick('linux', 'x64', 'appimage')).toMatch(/x86_64\.AppImage$/);
    expect(pick('linux', 'arm64', 'appimage')).toMatch(/arm64\.AppImage$/);
  });

  it('Linux paquet → deb en priorité', () => {
    expect(pick('linux', 'x64', 'installer')).toMatch(/amd64\.deb$/);
  });

  it('accepte un asset sans arch', () => {
    expect(selectUpdateAsset([asset('bp-setup.exe')], 'win32', 'x64', 'installer')?.name).toBe(
      'bp-setup.exe'
    );
  });

  it('null si rien d’adapté', () => {
    expect(selectUpdateAsset([asset('bp-linux-x64.deb')], 'win32', 'x64', 'installer')).toBeNull();
    expect(selectUpdateAsset(ASSETS, 'linux', 'ia32', 'appimage')).toBeNull();
  });
});

describe('replaceExecutableInPlace', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  for (const platform of ['linux', 'win32'] as const) {
    it(`remplace le fichier cible (${platform})`, () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upd-'));
      const target = path.join(dir, 'app.bin');
      const source = path.join(dir, 'dl.bin');
      fs.writeFileSync(target, 'old');
      fs.writeFileSync(source, 'new');

      expect(replaceExecutableInPlace(source, target, platform)).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe('new');
      expect(fs.existsSync(`${target}.new`)).toBe(false);

      cleanupReplacedExecutable(target);
      expect(fs.existsSync(`${target}.old`)).toBe(false);
    });
  }

  it('false si le dossier n’existe pas', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-upd-'));
    const source = path.join(dir, 'dl.bin');
    fs.writeFileSync(source, 'new');
    expect(replaceExecutableInPlace(source, path.join(dir, 'nope', 'app'), 'linux')).toBe(false);
  });
});

describe('portableSideBySidePath', () => {
  const cur = 'D:\\Escrime\\BellePoule-Modern-1.2.1-win-x64-portable.exe';

  it('nom de l’asset dans le dossier de l’exe courant', () => {
    expect(
      portableSideBySidePath(cur, 'BellePoule-Modern-1.2.2-win-x64-portable.exe', () => false)
    ).toBe('D:\\Escrime\\BellePoule-Modern-1.2.2-win-x64-portable.exe');
  });

  it('même nom que l’exe courant ou fichier existant → suffixe', () => {
    expect(
      portableSideBySidePath(cur, 'BellePoule-Modern-1.2.1-win-x64-portable.exe', () => false)
    ).toBe('D:\\Escrime\\BellePoule-Modern-1.2.1-win-x64-portable-2.exe');
    const taken = new Set(['D:\\Escrime\\x.exe', 'D:\\Escrime\\x-2.exe']);
    expect(portableSideBySidePath(cur, 'x.exe', p => taken.has(p))).toBe('D:\\Escrime\\x-3.exe');
  });

  it('nom d’asset hostile ou absent neutralisé', () => {
    expect(portableSideBySidePath(cur, '..\\..\\Windows\\evil.exe', () => false)).toBe(
      'D:\\Escrime\\evil.exe'
    );
    expect(portableSideBySidePath(cur, undefined, () => false)).toBe(
      'D:\\Escrime\\BellePoule-Modern-portable.exe'
    );
  });
});

describe('isSafePortableCleanup', () => {
  const cur = 'D:\\Escrime\\new.exe';
  it('uniquement un autre .exe du même dossier', () => {
    expect(isSafePortableCleanup('D:\\Escrime\\old.exe', cur)).toBe(true);
    expect(isSafePortableCleanup('d:\\escrime\\NEW.EXE', cur)).toBe(false);
    expect(isSafePortableCleanup('C:\\Windows\\old.exe', cur)).toBe(false);
    expect(isSafePortableCleanup('D:\\Escrime\\data.db', cur)).toBe(false);
    expect(isSafePortableCleanup(42, cur)).toBe(false);
  });
});
