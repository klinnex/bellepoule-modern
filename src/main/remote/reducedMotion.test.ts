import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const remote = (f: string): string =>
  fs.readFileSync(path.resolve(__dirname, `../../remote/${f}`), 'utf8');

// Repli prefers-reduced-motion injecté par common.js dans toutes les pages qui l'incluent
describe('pages distantes — prefers-reduced-motion', () => {
  it('common.js injecte le repli', () => {
    const js = remote('common.js');
    expect(js).toContain('prefers-reduced-motion: reduce');
    expect(js).toContain('animation-duration:0.01ms !important');
  });

  for (const page of ['arena', 'kiosk', 'public', 'overlay']) {
    it(`${page}.html charge common.js`, () => {
      expect(remote(`${page}.html`)).toContain('src="/common.js"');
    });
  }
});
