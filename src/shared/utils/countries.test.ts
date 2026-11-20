import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  COUNTRIES,
  countryName,
  findCountryIndex,
  flagEmoji,
  flagIso,
  formatNationality,
  listCountries,
} from './countries';

describe('countries', () => {
  it('codes uniques et bien formés', () => {
    const codes = COUNTRIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.iso2).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('drapeau emoji depuis code CIO ou ISO2', () => {
    expect(flagEmoji('FRA')).toBe('\u{1F1EB}\u{1F1F7}');
    expect(flagEmoji('GER')).toBe('\u{1F1E9}\u{1F1EA}');
    expect(flagEmoji('fr')).toBe('\u{1F1EB}\u{1F1F7}');
    expect(flagEmoji('XXX')).toBe('');
    expect(flagEmoji(undefined)).toBe('');
  });

  it('nom localisé et repli sur le code', () => {
    expect(countryName('FRA', 'fr')).toBe('France');
    expect(countryName('GER', 'en')).toBe('Germany');
    expect(countryName('XXX', 'fr')).toBe('XXX');
  });

  it('liste triée avec drapeaux', () => {
    const list = listCountries('fr');
    expect(list.length).toBe(COUNTRIES.length);
    expect(list.every(c => c.flag !== '')).toBe(true);
  });

  it('formatNationality', () => {
    expect(formatNationality('FRA')).toBe('\u{1F1EB}\u{1F1F7} FRA');
    expect(formatNationality('XXX')).toBe('XXX');
    expect(formatNationality('')).toBe('');
  });
});

describe('countries - drapeaux SVG et recherche', () => {
  it('flagIso depuis CIO ou ISO2', () => {
    expect(flagIso('FRA')).toBe('fr');
    expect(flagIso('de')).toBe('de');
    expect(flagIso('XXX')).toBe('');
  });

  it('un SVG embarqué existe pour chaque pays', () => {
    for (const c of COUNTRIES) {
      const f = path.join(__dirname, '../../renderer/assets/flags', `${c.iso2.toLowerCase()}.svg`);
      expect(fs.existsSync(f), c.code).toBe(true);
    }
  });

  it('findCountryIndex : premier pays commençant par la saisie', () => {
    const list = listCountries('fr');
    const i = findCountryIndex(list, 'b');
    expect(list[i].name.toLowerCase().startsWith('b')).toBe(true);
    expect(list.slice(0, i).some(c => c.name.toLowerCase().startsWith('b'))).toBe(false);
    expect(list[findCountryIndex(list, 'fra')].code).toBe('FRA');
    expect(findCountryIndex(list, '')).toBe(-1);
    expect(findCountryIndex(list, '1')).toBe(-1);
  });
});
