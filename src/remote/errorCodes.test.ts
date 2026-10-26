/**
 * Codes d'erreur stables du serveur distant (#1159) : chaque code renvoyé dans
 * `{ error: '…' }` par src/main/remote* est traduit dans src/remote/i18n.js (fr, en, zh-HK),
 * et window.errorText() affiche la traduction (paramètres = champs de la réponse).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { buildRemoteI18nSource } from '../main/remote/i18nBundle';

const ROOT = path.join(__dirname, '..', '..');

function sources(): string[] {
  const out: string[] = [path.join(ROOT, 'src/main/remoteScoreServer.ts')];
  const stack = [path.join(ROOT, 'src/main/remote')];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(full);
    }
  }
  return out;
}

function loadI18n(lang: string) {
  const win: Record<string, unknown> = {};
  const sandbox = {
    window: win,
    document: { querySelectorAll: () => [], documentElement: {} },
    fetch: async () => ({ json: async () => ({ lang }) }),
  };
  vm.runInNewContext(buildRemoteI18nSource(path.join(ROOT, 'src/remote'))!, sandbox);
  return win as {
    T: (k: string, p?: Record<string, unknown>) => string;
    errorText: (body: unknown, fallback?: string) => string;
    initRemoteI18n: () => Promise<void>;
  };
}

const codes = new Set<string>();
for (const file of sources()) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/\berror: '([a-z_]+)'/g)) codes.add(m[1]);
}

describe('codes d’erreur du serveur distant (#1159)', () => {
  it('des codes sont bien émis', () => {
    expect(codes.size).toBeGreaterThan(40);
    expect(codes).toContain('auth_required');
  });

  it.each(['fr', 'en', 'zh-HK'])('chaque code est traduit (%s)', async lang => {
    const i18n = loadI18n(lang);
    await i18n.initRemoteI18n();
    const missing = [...codes].filter(c => i18n.T(`error.${c}`) === `error.${c}`);
    expect(missing).toEqual([]);
  });

  it('errorText : traduction paramétrée, texte brut, repli', async () => {
    const i18n = loadI18n('en');
    await i18n.initRemoteI18n();
    expect(i18n.errorText({ error: 'too_many_attempts', retryAfter: 30 })).toBe(
      'Too many attempts. Try again in 30 s.'
    );
    expect(i18n.errorText({ error: 'wrong_password' })).toBe('Incorrect password');
    expect(i18n.errorText({ error: 'Texte libre' })).toBe('Texte libre');
    expect(i18n.errorText(null, 'repli')).toBe('repli');
  });
});
