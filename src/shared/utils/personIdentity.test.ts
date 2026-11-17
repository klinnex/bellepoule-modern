import { describe, it, expect } from 'vitest';
import { identityKey, importIdentityKeys, normalizeIdentity } from './personIdentity';

describe('personIdentity (#1880)', () => {
  it('accents, casse et espaces ignorés', () => {
    expect(normalizeIdentity('  Lefèvre   ÉLISE ')).toBe('lefevre elise');
  });

  it('licence prioritaire, sinon nom + prénom + naissance', () => {
    expect(identityKey({ license: '12 34', lastName: 'A' })).toBe('lic:1234');
    expect(
      identityKey({ lastName: 'Dupont', firstName: 'Léa', birthDate: '2010-05-01T00:00' })
    ).toBe('name:dupont|lea|2010-05-01');
  });

  it('import : doublon par nom + prénom ou par licence', () => {
    const a = importIdentityKeys({ lastName: 'DUPONT', firstName: 'Léa', license: '111' });
    const sameName = importIdentityKeys({ lastName: 'Dupont', firstName: 'Lea' });
    const sameLicense = importIdentityKeys({ lastName: 'Autre', firstName: 'Nom', license: '111' });
    const other = importIdentityKeys({ lastName: 'Martin', firstName: 'Paul', license: '222' });
    const overlap = (x: string[], y: string[]) => x.some(k => y.includes(k));
    expect(overlap(a, sameName)).toBe(true);
    expect(overlap(a, sameLicense)).toBe(true);
    expect(overlap(a, other)).toBe(false);
  });
});
