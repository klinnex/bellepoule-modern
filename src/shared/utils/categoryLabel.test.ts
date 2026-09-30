import { describe, it, expect } from 'vitest';
import { categoryLabel } from './categoryLabel';

const FR: Record<string, string> = {
  'categories.U11': 'M11', 'categories.senior': 'Seniors', 'categories.V2': 'Vétérans 2',
};
const t = (k: string) => FR[k] ?? k;

describe('categoryLabel (#931)', () => {
  it('traduit les codes en libellés officiels', () => {
    expect(categoryLabel('U11', t)).toBe('M11');
    expect(categoryLabel('SEN', t)).toBe('Seniors');
    expect(categoryLabel('V2', t)).toBe('Vétérans 2');
  });
  it('laisse un code inconnu tel quel', () => {
    expect(categoryLabel('XYZ', t)).toBe('XYZ');
    expect(categoryLabel(undefined, t)).toBe('');
  });
});
