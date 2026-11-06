/**
 * BellePoule Modern - Installation native des mises à jour (macOS .app, paquets Linux)
 * Licensed under GPL-3.0
 *
 * Commandes lancées via execFile (sans shell) : chemins absolus, arguments séparés.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export type RunCommand = (cmd: string, args: string[]) => void;

const defaultRun: RunCommand = (cmd, args) => {
  execFileSync(cmd, args, { stdio: 'ignore' });
};

/**
 * Remplace le bundle `.app` courant par celui du .zip téléchargé.
 * - extraction (`ditto`, conserve liens symboliques + signature) dans un dossier
 *   temporaire voisin → renommages atomiques sur le même volume
 * - ancien bundle renommé `<bundle>.old`, restauré si le remplacement échoue
 */
export function replaceMacAppBundle(
  zipPath: string,
  bundle: string,
  run: RunCommand = defaultRun
): void {
  const parent = path.dirname(bundle);
  const staging = fs.mkdtempSync(path.join(parent, '.bp-update-'));
  try {
    run('/usr/bin/ditto', ['-x', '-k', zipPath, staging]);
    const name = fs.readdirSync(staging).find(n => n.endsWith('.app'));
    if (!name) throw new Error('Archive sans application .app');
    const fresh = path.join(staging, name);
    try {
      run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', fresh]);
    } catch {
      // pas d'attribut de quarantaine : rien à faire
    }
    const old = `${bundle}.old`;
    fs.rmSync(old, { recursive: true, force: true });
    fs.renameSync(bundle, old);
    try {
      fs.renameSync(fresh, bundle);
    } catch (e) {
      fs.renameSync(old, bundle);
      throw e;
    }
    try {
      fs.rmSync(old, { recursive: true, force: true });
    } catch {
      // nettoyé au prochain lancement (cleanupReplacedExecutable)
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Commande d'installation d'un paquet Linux avec élévation graphique (pkexec).
 * null si pkexec absent → repli sur le gestionnaire de logiciels du système.
 */
export function linuxPackageInstallCommand(
  kind: 'deb' | 'rpm',
  file: string,
  exists: (p: string) => boolean
): { cmd: string; args: string[] } | null {
  const pkexec = '/usr/bin/pkexec';
  if (!exists(pkexec) || !path.isAbsolute(file)) return null;
  if (kind === 'deb') {
    if (exists('/usr/bin/apt-get')) {
      return { cmd: pkexec, args: ['/usr/bin/apt-get', 'install', '-y', file] };
    }
    return exists('/usr/bin/dpkg') ? { cmd: pkexec, args: ['/usr/bin/dpkg', '-i', file] } : null;
  }
  if (exists('/usr/bin/dnf')) return { cmd: pkexec, args: ['/usr/bin/dnf', 'install', '-y', file] };
  if (exists('/usr/bin/zypper')) {
    return {
      cmd: pkexec,
      args: ['/usr/bin/zypper', '--non-interactive', 'install', '--allow-unsigned-rpm', file],
    };
  }
  return exists('/usr/bin/rpm') ? { cmd: pkexec, args: ['/usr/bin/rpm', '-U', file] } : null;
}
