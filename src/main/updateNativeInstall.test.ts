import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { linuxPackageInstallCommand, replaceMacAppBundle } from './updateNativeInstall';

describe('replaceMacAppBundle', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const setup = () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-mac-'));
    const bundle = path.join(dir, 'BellePoule Modern.app');
    fs.mkdirSync(path.join(bundle, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(bundle, 'Contents', 'v'), 'old');
    return bundle;
  };

  it('remplace le bundle par celui de l’archive (ditto simulé)', () => {
    const bundle = setup();
    const calls: string[] = [];
    replaceMacAppBundle('/dl/u.zip', bundle, (cmd, args) => {
      calls.push(cmd);
      if (cmd === '/usr/bin/ditto') {
        const app = path.join(args[3], 'BellePoule Modern.app', 'Contents');
        fs.mkdirSync(app, { recursive: true });
        fs.writeFileSync(path.join(app, 'v'), 'new');
      }
    });
    expect(calls).toEqual(['/usr/bin/ditto', '/usr/bin/xattr']);
    expect(fs.readFileSync(path.join(bundle, 'Contents', 'v'), 'utf8')).toBe('new');
    expect(fs.readdirSync(dir)).toEqual(['BellePoule Modern.app']);
  });

  it('archive sans .app → erreur, bundle intact, pas de reste', () => {
    const bundle = setup();
    expect(() => replaceMacAppBundle('/dl/u.zip', bundle, () => {})).toThrow(/\.app/);
    expect(fs.readFileSync(path.join(bundle, 'Contents', 'v'), 'utf8')).toBe('old');
    expect(fs.readdirSync(dir)).toEqual(['BellePoule Modern.app']);
  });

  it('extraction en échec → bundle intact', () => {
    const bundle = setup();
    expect(() =>
      replaceMacAppBundle('/dl/u.zip', bundle, () => {
        throw new Error('ditto');
      })
    ).toThrow('ditto');
    expect(fs.readdirSync(dir)).toEqual(['BellePoule Modern.app']);
  });
});

describe('linuxPackageInstallCommand', () => {
  const has =
    (...l: string[]) =>
    (p: string) =>
      l.includes(p);
  const F = '/home/u/.config/bp/pending/a.deb';

  it('deb : apt-get via pkexec, sinon dpkg', () => {
    expect(
      linuxPackageInstallCommand('deb', F, has('/usr/bin/pkexec', '/usr/bin/apt-get'))
    ).toEqual({ cmd: '/usr/bin/pkexec', args: ['/usr/bin/apt-get', 'install', '-y', F] });
    expect(
      linuxPackageInstallCommand('deb', F, has('/usr/bin/pkexec', '/usr/bin/dpkg'))?.args
    ).toEqual(['/usr/bin/dpkg', '-i', F]);
  });

  it('rpm : dnf, zypper, puis rpm', () => {
    const f = '/tmp/a.rpm';
    expect(
      linuxPackageInstallCommand('rpm', f, has('/usr/bin/pkexec', '/usr/bin/dnf'))?.args[0]
    ).toBe('/usr/bin/dnf');
    expect(
      linuxPackageInstallCommand('rpm', f, has('/usr/bin/pkexec', '/usr/bin/zypper'))?.args[0]
    ).toBe('/usr/bin/zypper');
    expect(
      linuxPackageInstallCommand('rpm', f, has('/usr/bin/pkexec', '/usr/bin/rpm'))?.args
    ).toEqual(['/usr/bin/rpm', '-U', f]);
  });

  it('null sans pkexec ou chemin relatif', () => {
    expect(linuxPackageInstallCommand('deb', F, has('/usr/bin/apt-get'))).toBeNull();
    expect(
      linuxPackageInstallCommand('deb', 'a.deb', has('/usr/bin/pkexec', '/usr/bin/apt-get'))
    ).toBeNull();
  });
});
