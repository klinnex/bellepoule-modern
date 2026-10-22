import { describe, it, expect, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  getActiveLocale,
  pluralCategory,
  pluralKeys,
  setActiveLanguage,
  toBcp47,
} from './localeFormat';

const date = new Date(2026, 9, 20, 15, 5);

afterEach(() => setActiveLanguage('fr'));

describe('formats selon la langue active (#1160)', () => {
  it('français par défaut', () => {
    expect(getActiveLocale()).toBe('fr-FR');
    expect(formatDate(date)).toBe('20/10/2026');
    expect(formatNumber(1234.5)).toMatch(/^1\s234,5$/);
  });

  it('anglais : date jour/mois, point décimal', () => {
    setActiveLanguage('en');
    expect(getActiveLocale()).toBe('en-GB');
    expect(formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })).toBe(
      '20 October 2026'
    );
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });

  it('allemand : date à points, virgule décimale', () => {
    setActiveLanguage('de');
    expect(formatDate(date)).toBe('20.10.2026');
    expect(formatNumber(1234.5)).toBe('1.234,5');
    expect(formatTime(date, { hour: '2-digit', minute: '2-digit' })).toBe('15:05');
  });

  it('cantonais (zh-HK) : date et heure localisées', () => {
    setActiveLanguage('zh-HK');
    expect(formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' })).toBe(
      '2026年10月20日'
    );
    expect(formatDateTime(date)).toContain('2026');
  });

  it('langue inconnue : étiquette transmise telle quelle', () => {
    expect(toBcp47('it')).toBe('it');
  });
});

describe('pluriels (Intl.PluralRules, #1160)', () => {
  it('0 / 1 / 2 en français (0 est singulier) et en anglais', () => {
    expect([0, 1, 2].map(n => pluralCategory('fr', n))).toEqual(['one', 'one', 'other']);
    expect([0, 1, 2].map(n => pluralCategory('en', n))).toEqual(['other', 'one', 'other']);
  });

  it('cantonais : une seule forme', () => {
    expect([0, 1, 2].map(n => pluralCategory('zh-HK', n))).toEqual(['other', 'other', 'other']);
  });

  it('clés candidates : catégorie, puis _other, puis la clé nue', () => {
    expect(pluralKeys('pools.fencers', 'en', 1)).toEqual([
      'pools.fencers_one',
      'pools.fencers_other',
      'pools.fencers',
    ]);
  });
});
