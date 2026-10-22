import { describe, it, expect } from 'vitest';
// Outil des traducteurs (scripts/), testé ici car Vitest ne couvre que src/
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { toCsv, parseCsv, applyCsv } = require('../../../scripts/lib/i18nCsv.js');

const fr = { app: { title: 'BellePoule', quit: 'Quitter' }, msg: { hello: 'Bonjour, "{{name}}"' } };
const br = { app: { title: 'BellePoule', quit: 'Kuitaat' }, msg: { hello: '' } };

describe('i18n CSV (#1079)', () => {
  it('exporte key, fr, langue avec échappement CSV et BOM', () => {
    const csv = toCsv(fr, br, 'br');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('key,fr,br\r\n');
    expect(csv).toContain('app.quit,Quitter,Kuitaat\r\n');
    expect(csv).toContain('msg.hello,"Bonjour, ""{{name}}""",\r\n');
  });

  it('aller-retour : parse ce qu’il exporte', () => {
    const rows = parseCsv(toCsv(fr, br, 'br'));
    expect(rows).toEqual([
      ['key', 'fr', 'br'],
      ['app.title', 'BellePoule', 'BellePoule'],
      ['app.quit', 'Quitter', 'Kuitaat'],
      ['msg.hello', 'Bonjour, "{{name}}"', ''],
    ]);
  });

  it('accepte le point-virgule (Excel FR) et les retours à la ligne dans une cellule', () => {
    expect(parseCsv('key;fr;br\r\na;"x\ny";z\r\n')).toEqual([
      ['key', 'fr', 'br'],
      ['a', 'x\ny', 'z'],
    ]);
  });

  it('applique les traductions, garde l’ordre de la référence, ignore cellules vides et clés inconnues', () => {
    const csv = 'key,fr,br\nmsg.hello,x,"Demat, {{name}}"\napp.quit,x,\nnope.key,x,y\n';
    const { lang, locale, changed, unknown } = applyCsv(fr, br, csv);
    expect(lang).toBe('br');
    expect(locale).toEqual({
      app: { title: 'BellePoule', quit: 'Kuitaat' },
      msg: { hello: 'Demat, {{name}}' },
    });
    expect(changed).toEqual(['msg.hello']);
    expect(unknown).toEqual(['nope.key']);
  });

  it('refuse un CSV sans en-tête attendu', () => {
    expect(() => applyCsv(fr, br, 'a,b\n')).toThrow(/En-tête/);
  });
});
