/**
 * BellePoule Modern - Lecture de version.json (version, build, canal) (#1326)
 * Partagée par l'IPC `app:getVersionInfo` et le rapport de diagnostic.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export function getVersionInfo(): {
  version: string;
  build: number;
  date: string;
  channel?: 'dev' | 'stable';
} {
  try {
    const versionPaths = [
      path.join(app.getAppPath(), 'version.json'),
      path.join(app.getAppPath(), '..', 'version.json'),
      path.join(__dirname, '..', '..', 'version.json'),
      path.join(process.cwd(), 'version.json'),
    ];

    for (const versionPath of versionPaths) {
      if (fs.existsSync(versionPath)) {
        const content = fs.readFileSync(versionPath, 'utf-8');
        return JSON.parse(content);
      }
    }
  } catch (e) {
    console.error('Failed to read version.json:', e);
  }

  // Fallback: lire depuis package.json
  try {
    const pkgPath = path.join(app.getAppPath(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const match = pkg.version.match(/(\d+\.\d+\.\d+)(?:-(?:build|dev)\.(\d+))?/);
      if (match) {
        return {
          version: match[1],
          build: parseInt(match[2]) || 0,
          date: new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    console.error('Failed to read package.json:', e);
  }

  return { version: '1.0.0', build: 0, date: 'Unknown' };
}
