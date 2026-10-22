/**
 * Traduction des PDF (#1159) : `pdfT` suit la langue de l'interface, repli sur le texte
 * français du code, identique à `pdf.*` de fr.json ; un PDF anglais ne garde aucun libellé
 * français.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { pdfLang, pdfT, setPdfTranslator } from './core';
import { generateAppelHTML } from './appelPdf';
import { generateRankingHTML } from './rankingPdf';
import { Fencer, FencerStatus, Gender, PoolRanking } from '../../types';
import { pluralKeys } from '../localeFormat';

const LOCALES = path.join(__dirname, '../../../renderer/locales');
const load = (lang: string) =>
  JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), 'utf8')).pdf as Record<
    string,
    string
  >;

/** Traducteur minimal équivalent à celui de TranslationContext (pluriels compris). */
const translatorFor = (lang: string) => {
  const dict = load(lang);
  return (key: string, params?: Record<string, string | number>) => {
    const bare = key.replace(/^pdf\./, '');
    const candidates =
      typeof params?.count === 'number' ? pluralKeys(bare, lang, params.count) : [bare];
    const value = candidates.map(c => dict[c]).find(v => v !== undefined);
    if (value === undefined) return key;
    return value.replace(/\{\{(\w+)\}\}/g, (m, k) =>
      params?.[k] === undefined ? m : String(params[k])
    );
  };
};

/** Appels `pdfT('clé', 'repli')` des modules PDF. */
function sourceCalls(): { key: string; fr: string[] }[] {
  const dir = __dirname;
  const files = [
    ...fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map(f => path.join(dir, f)),
    path.join(dir, '../fencerDetailPdfExport.ts'),
  ];
  const re = /pdfT\(\s*'([a-z0-9_]+)',\s*([^,)]+?(?:'[^']*'|"[^"]*"))\s*[,)]/gs;
  const calls: { key: string; fr: string[] }[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      const fr = [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map(x => x[1] ?? x[2]);
      calls.push({ key: m[1], fr });
    }
  }
  return calls;
}

const fencer = (over: Partial<Fencer> = {}): Fencer => ({
  id: 'f1',
  ref: 1,
  lastName: 'Dupont',
  firstName: 'Léa',
  gender: Gender.FEMALE,
  nationality: 'FRA',
  club: 'CE Lille',
  status: FencerStatus.QUALIFIED,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('pdfT', () => {
  afterEach(() => setPdfTranslator(null));

  it('sans traducteur : texte français, paramètres interpolés, lang fr', () => {
    expect(pdfT('pool_n', 'Poule {{n}}', { n: 3 })).toBe('Poule 3');
    expect(pdfLang()).toBe('fr');
  });

  it('avec traducteur : langue active ; clé absente → repli français', () => {
    setPdfTranslator(translatorFor('en'), 'en');
    expect(pdfT('pool_n', 'Poule {{n}}', { n: 3 })).toBe('Pool 3');
    expect(pdfT('fencers_count', '{{count}} tireur', { count: 1 })).toBe('1 fencer');
    expect(pdfT('fencers_count', '{{count}} tireurs', { count: 2 })).toBe('2 fencers');
    expect(pdfT('cle_inconnue', 'Texte FR')).toBe('Texte FR');
    expect(pdfLang()).toBe('en');
  });

  it('chaque appel du code a sa clé dans fr.json, avec le même texte', () => {
    const fr = load('fr');
    const calls = sourceCalls();
    expect(calls.length).toBeGreaterThan(100);
    for (const { key, fr: fallbacks } of calls) {
      const forms = [fr[key], fr[`${key}_one`], fr[`${key}_other`]].filter(Boolean);
      expect(forms.length, key).toBeGreaterThan(0);
      for (const text of fallbacks) expect(forms, `${key} : « ${text} »`).toContain(text);
    }
  });

  it('PDF en anglais : aucun libellé français dans la liste d’appel et le classement', () => {
    setPdfTranslator(translatorFor('en'), 'en');
    const appel = generateAppelHTML(
      [fencer(), fencer({ id: 'f2', status: FencerStatus.ELIMINATED })],
      ['ref', 'lastName', 'firstName', 'birthDate', 'club', 'ranking', 'status'],
      'Roll call'
    );
    const ranking = generateRankingHTML(
      [
        {
          fencer: fencer(),
          rank: 1,
          victories: 1,
          defeats: 0,
          touchesScored: 5,
          touchesReceived: 2,
          index: 3,
          matchesPlayed: 1,
          ratio: 1,
        } as unknown as PoolRanking,
      ],
      'Ranking',
      false,
      ['rank', 'lastName', 'firstName', 'club', 'victories', 'ratio', 'td', 'tr', 'index']
    );
    for (const html of [appel, ranking]) {
      expect(html).toContain('lang="en"');
      expect(html.match(/Prénom|Qualifié|Éliminé|Statut|Classement|tireur|Indice/g)).toBeNull();
    }
    expect(appel).toContain('2 fencers');
  });
});
