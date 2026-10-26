import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// #1213 : libellés envoyés en français par le serveur, traduits côté page
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

function loadLocale(lang: string): Record<string, string> {
  const win: { BP_REMOTE_I18N?: Record<string, Record<string, string>> } = {};
  new Function('window', read(`i18n/${lang}.js`))(win);
  return win.BP_REMOTE_I18N![lang];
}

describe('kiosk.html : noms de poule traduits (#1213)', () => {
  const html = read('kiosk.html');
  it('cartes de poule : nom construit depuis le numéro', () => {
    expect(html).toContain("tk('kiosk.pool_n', { n: pool.number })");
  });
  it('prochains matchs : regroupement par numéro de poule traduit', () => {
    expect(html).toContain("tk('kiosk.pool_n', { n: m.poolNumber })");
  });
});

describe('referee.html : raisons de carton avancé traduites (#1213)', () => {
  const html = read('referee.html');
  const keys = [...html.matchAll(/\{ key: '(referee\.fault_[a-z]+_\d_\d{2})', fr: /g)].map(
    m => m[1]
  );
  const groupKeys = [...html.matchAll(/labelKey: '(referee\.fault_group_[a-z]+_\d)'/g)].map(
    m => m[1]
  );

  it('chaque raison a une clé et la valeur enregistrée reste en français', () => {
    expect(keys.length).toBe(47);
    expect(groupKeys.length).toBe(5);
    expect(html).toContain('btn.textContent = window.T(fault.key)');
    expect(html).toContain('this.confirmReasonSelector(fault.fr, group, fencer)');
  });

  it('le texte français de la clé = valeur enregistrée', () => {
    const fr = loadLocale('fr');
    for (const m of html.matchAll(/\{ key: '([^']+)', fr: (['"])(.*?)\2 \}/g)) {
      expect(fr[m[1]]).toBe(m[3].replace(/\\"/g, '"'));
    }
  });

  it.each(['en', 'de', 'es', 'ca', 'br', 'zh-HK'])('%s : toutes les raisons traduites', lang => {
    const dict = loadLocale(lang);
    const fr = loadLocale('fr');
    for (const k of [...keys, ...groupKeys]) {
      expect(dict[k], k).toBeTruthy();
      expect(dict[k], k).not.toBe(fr[k]);
    }
  });
});
