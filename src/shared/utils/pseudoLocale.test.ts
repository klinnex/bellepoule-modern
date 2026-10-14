import { describe, it, expect } from 'vitest';
import { pseudoLocalize, isPseudoLocaleEnabled, PSEUDO_LOCALE_STORAGE_KEY } from './pseudoLocale';

describe('pseudoLocalize', () => {
  it('accentue les lettres et encadre la chaîne', () => {
    expect(pseudoLocalize('Score')).toBe('[!! Ŝçöŕé !!]');
  });

  it('préserve les paramètres {{nom}}', () => {
    expect(pseudoLocalize('{{present}} / {{total}} ok')).toBe('[!! {{present}} / {{total}} öķ !!]');
  });

  it('laisse intacts chiffres, accents et symboles', () => {
    expect(pseudoLocalize('é 12 ⚔')).toBe('[!! é 12 ⚔ !!]');
  });
});

describe('isPseudoLocaleEnabled', () => {
  it('vrai uniquement si le drapeau vaut "1"', () => {
    expect(
      isPseudoLocaleEnabled({ getItem: k => (k === PSEUDO_LOCALE_STORAGE_KEY ? '1' : null) })
    ).toBe(true);
    expect(isPseudoLocaleEnabled({ getItem: () => '0' })).toBe(false);
    expect(isPseudoLocaleEnabled(undefined)).toBe(false);
  });

  it('faux si le stockage lève une exception', () => {
    expect(
      isPseudoLocaleEnabled({
        getItem: () => {
          throw new Error('blocked');
        },
      })
    ).toBe(false);
  });
});
