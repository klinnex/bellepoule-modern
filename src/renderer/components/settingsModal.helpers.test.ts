import { describe, it, expect } from 'vitest';
import { readInputModes, SIMPLIFIED_INPUT_KEY, CHAINED_INPUT_KEY } from './settingsModal.helpers';

const storageOf = (entries: Record<string, string>) => ({
  getItem: (key: string) => (key in entries ? entries[key] : null),
});

describe('readInputModes (saisie simplifiée / enchaînée exclusives)', () => {
  it('défaut : enchaînée active, simplifiée annulée', () => {
    expect(readInputModes(storageOf({}))).toEqual({ simplified: false, chained: true });
  });

  it('simplifiée active → enchaînée désactivée', () => {
    expect(readInputModes(storageOf({ [SIMPLIFIED_INPUT_KEY]: 'true' }))).toEqual({
      simplified: true,
      chained: false,
    });
  });

  it('ne retourne jamais les deux modes actifs, même si les deux clés sont à true', () => {
    const modes = readInputModes(
      storageOf({ [SIMPLIFIED_INPUT_KEY]: 'true', [CHAINED_INPUT_KEY]: 'true' })
    );
    expect(modes.simplified && modes.chained).toBe(false);
  });

  it('exactement un mode actif dans tous les cas', () => {
    for (const s of [undefined, 'true', 'false']) {
      for (const c of [undefined, 'true', 'false']) {
        const entries: Record<string, string> = {};
        if (s !== undefined) entries[SIMPLIFIED_INPUT_KEY] = s;
        if (c !== undefined) entries[CHAINED_INPUT_KEY] = c;
        const modes = readInputModes(storageOf(entries));
        expect(modes.simplified !== modes.chained).toBe(true);
      }
    }
  });
});
