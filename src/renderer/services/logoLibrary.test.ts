import { describe, it, expect } from 'vitest';
import {
  sanitizeLogoLibrary,
  ensureActiveInLibrary,
  addLogo,
  renameLogo,
  removeLogo,
  logoNameFromFile,
  LOGO_LIBRARY_MAX,
  type LogoEntry,
} from './logoLibrary';

const img = (n: number) => `data:image/jpeg;base64,${n}`;
const entry = (n: number): LogoEntry => ({ id: `id${n}`, name: `L${n}`, data: img(n) });

describe('logoLibrary', () => {
  it('sanitize filtre les entrées invalides et doublons', () => {
    const out = sanitizeLogoLibrary([
      entry(1),
      entry(1),
      { id: 'x', name: 'bad', data: 'javascript:alert(1)' },
      null,
      'str',
      entry(2),
    ]);
    expect(out.map(l => l.id)).toEqual(['id1', 'id2']);
    expect(sanitizeLogoLibrary({})).toEqual([]);
  });

  it('sanitize borne la taille', () => {
    const many = Array.from({ length: LOGO_LIBRARY_MAX + 5 }, (_, i) => entry(i));
    expect(sanitizeLogoLibrary(many)).toHaveLength(LOGO_LIBRARY_MAX);
  });

  it('ensureActiveInLibrary migre le logo actif hérité', () => {
    expect(ensureActiveInLibrary([], img(9), 'Club')).toMatchObject([
      { name: 'Club', data: img(9) },
    ]);
    const list = [entry(1)];
    expect(ensureActiveInLibrary(list, img(1))).toBe(list);
    expect(ensureActiveInLibrary(list, null)).toBe(list);
  });

  it('addLogo refuse au-delà du maximum', () => {
    const full = Array.from({ length: LOGO_LIBRARY_MAX }, (_, i) => entry(i));
    expect(addLogo(full, entry(99))).toBe(full);
    expect(addLogo([entry(1)], entry(2))).toHaveLength(2);
  });

  it('renameLogo ignore un nom vide', () => {
    const list = [entry(1)];
    expect(renameLogo(list, 'id1', '   ')).toBe(list);
    expect(renameLogo(list, 'id1', ' Ligue ')[0].name).toBe('Ligue');
  });

  it('removeLogo bascule le logo actif', () => {
    const list = [entry(1), entry(2)];
    expect(removeLogo(list, 'id1', img(1))).toEqual({ list: [entry(2)], nextActive: img(2) });
    expect(removeLogo(list, 'id2', img(1))).toEqual({ list: [entry(1)], nextActive: img(1) });
    expect(removeLogo([entry(1)], 'id1', img(1)).nextActive).toBeNull();
  });

  it('logoNameFromFile retire l’extension', () => {
    expect(logoNameFromFile('club.png')).toBe('club');
    expect(logoNameFromFile('.png')).toBe('Logo');
  });
});
