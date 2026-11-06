import { describe, it, expect } from 'vitest';
import { categoryLabel, weaponLabel, genderLabel } from './categoryLabel';

const FR: Record<string, string> = {
  'categories.U9': 'M9',
  'categories.U11': 'M11',
  'categories.senior': 'Seniors',
  'categories.V2': 'Vétérans 2',
  'weapons.laser': 'Sabre Laser',
  'weapons.epee': 'Épée',
  'genders.mixed': 'Mixte',
  'genders.female': 'Féminin',
};
const t = (k: string) => FR[k] ?? k;

describe('categoryLabel (#931)', () => {
  it('traduit les codes en libellés officiels', () => {
    expect(categoryLabel('U9', t)).toBe('M9');
    expect(categoryLabel('U11', t)).toBe('M11');
    expect(categoryLabel('SEN', t)).toBe('Seniors');
    expect(categoryLabel('V2', t)).toBe('Vétérans 2');
  });
  it('laisse un code inconnu tel quel', () => {
    expect(categoryLabel('XYZ', t)).toBe('XYZ');
    expect(categoryLabel(undefined, t)).toBe('');
  });
});

describe('weaponLabel / genderLabel', () => {
  it('traduit les codes arme et genre', () => {
    expect(weaponLabel('L', t)).toBe('Sabre Laser');
    expect(weaponLabel('E', t)).toBe('Épée');
    expect(genderLabel('X', t)).toBe('Mixte');
    expect(genderLabel('F', t)).toBe('Féminin');
  });
  it('laisse un code inconnu tel quel', () => {
    expect(weaponLabel('Z', t)).toBe('Z');
    expect(genderLabel(null, t)).toBe('');
  });
});
