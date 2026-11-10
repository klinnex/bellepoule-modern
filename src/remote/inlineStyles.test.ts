// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #1600 : les styles statiques des pages arbitre et kiosque vivent dans des classes (<style>),
// pas dans des attributs style=. Restent seulement quelques masquages `display: none` basculés par le JS (et un logo borné).
const MAX_INLINE: Record<string, number> = {
  'referee.html': 4,
  'kiosk.html': 1,
  'arena.html': 0,
  'public.html': 0,
};

describe('styles inline des pages distantes (#1600)', () => {
  for (const [page, max] of Object.entries(MAX_INLINE)) {
    it(`${page} : au plus ${max} attribut(s) style`, () => {
      const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const styled = Array.from(doc.querySelectorAll('[style]'));
      expect(styled.length).toBeLessThanOrEqual(max);
    });
  }
});
