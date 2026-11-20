import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #1600 : le service worker précache les modules /js/* des pages arbitre et arène (mode hors-ligne).
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const assetsBlock = /const ASSETS = \[([\s\S]*?)\];/.exec(read('sw.js'))?.[1] ?? '';
const assets = Array.from(assetsBlock.matchAll(/'([^']+)'/g)).map(m => m[1]);

describe('sw.js précache (#1600)', () => {
  for (const page of ['arena.html', 'referee.html']) {
    it(`${page} : tous ses scripts /js/* sont précachés et existent`, () => {
      const srcs = Array.from(read(page).matchAll(/src="(\/js\/[A-Za-z0-9]+\.js)"/g)).map(
        m => m[1]
      );
      expect(srcs.length).toBeGreaterThan(0);
      for (const s of srcs) {
        expect(assets, s).toContain(s);
        expect(fs.existsSync(path.join(__dirname, s.slice(1))), s).toBe(true);
      }
    });
  }

  it('aucun doublon dans la liste précachée', () => {
    expect(new Set(assets).size).toBe(assets.length);
  });
});
