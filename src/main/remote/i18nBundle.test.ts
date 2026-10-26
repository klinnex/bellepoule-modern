import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { buildRemoteI18nSource, readRemoteSharedFiles } from './i18nBundle';

const ROOT = path.resolve(__dirname, '../../..');

describe('i18n des pages distantes découpé par langue (#1213)', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('/i18n.js = langues puis moteur ; T() traduit dans la langue configurée', async () => {
    const src = buildRemoteI18nSource(path.join(ROOT, 'src/remote'))!;
    const win: Record<string, any> = {};
    vm.runInNewContext(src, {
      window: win,
      document: { querySelectorAll: () => [], documentElement: {} },
      fetch: async () => ({ json: async () => ({ lang: 'en' }) }),
    });
    expect(win.T('referee.time_up')).toBe('⏰ Temps écoulé !');
    await win.initRemoteI18n();
    expect(win.T('referee.time_up')).toBe("⏰ Time's up!");
    expect(win.T('referee.wins', { name: 'A', reason: 'coin toss' })).toBe(
      '🏆 A wins the match (coin toss)'
    );
  });

  it('chaque langue a les mêmes clés que le français', () => {
    const win: Record<string, any> = {};
    const langDir = path.join(ROOT, 'src/remote/i18n');
    for (const f of fs.readdirSync(langDir))
      vm.runInNewContext(fs.readFileSync(path.join(langDir, f), 'utf8'), { window: win });
    const fr = Object.keys(win.BP_REMOTE_I18N.fr).sort();
    for (const lang of Object.keys(win.BP_REMOTE_I18N)) {
      expect(Object.keys(win.BP_REMOTE_I18N[lang]).sort(), lang).toEqual(fr);
    }
  });

  it('fichiers communs : absents ignorés, i18n.js concaténé', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-remote-'));
    fs.writeFileSync(path.join(dir, 'common.js'), 'c');
    fs.writeFileSync(path.join(dir, 'i18n.js'), 'engine');
    fs.mkdirSync(path.join(dir, 'i18n'));
    fs.writeFileSync(path.join(dir, 'i18n', 'fr.js'), 'fr');
    fs.writeFileSync(path.join(dir, 'i18n', 'en.js'), 'en');
    expect(readRemoteSharedFiles(dir)).toEqual([
      ['common.js', 'c'],
      ['i18n.js', 'en\nfr\nengine'],
    ]);
  });
});
