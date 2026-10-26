/**
 * BellePoule Modern - JS/CSS communs des pages distantes, dont `/i18n.js` (#1213)
 * Traductions découpées par langue (`src/remote/i18n/<langue>.js`) + moteur (`src/remote/i18n.js`),
 * concaténés en un seul script : les pages chargent toujours `/i18n.js`.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';

/** Source de `/i18n.js` : fichiers de langue (ordre alphabétique) puis moteur ; null si moteur absent */
export function buildRemoteI18nSource(remoteDir: string): string | null {
  const engine = path.join(remoteDir, 'i18n.js');
  if (!fs.existsSync(engine)) return null;
  const langDir = path.join(remoteDir, 'i18n');
  const langs = fs.existsSync(langDir)
    ? fs
        .readdirSync(langDir)
        .filter(f => f.endsWith('.js'))
        .sort()
    : [];
  return [...langs.map(f => path.join(langDir, f)), engine]
    .map(f => fs.readFileSync(f, 'utf-8'))
    .join('\n');
}

/** Fichiers communs servis depuis la mémoire : [nom, contenu] (fichiers absents ignorés) */
export function readRemoteSharedFiles(remoteDir: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of ['common.js', 'app.js', 'styles.css']) {
    const filePath = path.join(remoteDir, file);
    if (fs.existsSync(filePath)) out.push([file, fs.readFileSync(filePath, 'utf-8')]);
  }
  const i18n = buildRemoteI18nSource(remoteDir);
  if (i18n) out.push(['i18n.js', i18n]);
  return out;
}
