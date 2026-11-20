import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import { registerPageRoutes } from '../main/remote/routes/pageRoutes';
import type { RouteContext } from '../main/remote/routes/context';

// #1303 : mode écran public `?display=1` — aucun contrôle visible, routes en lecture seule.
const common = readFileSync(join(__dirname, 'common.js'), 'utf8');
const PAGES = ['public', 'kiosk', 'overlay'];
const CONTROLS = 'button, input, select, textarea, [contenteditable], [data-click]';

function load(page: string, search: string) {
  const html = readFileSync(join(__dirname, `${page}.html`), 'utf8');
  const dom = new JSDOM(html, {
    url: `http://localhost/${page}${search}`,
    runScripts: 'outside-only',
  });
  dom.window.eval(common);
  return dom.window;
}

describe('mode display (#1303)', () => {
  it.each(PAGES)('%s?display=1 : aucun contrôle visible', page => {
    const w = load(page, '?display=1');
    expect(w.document.documentElement.classList.contains('display-mode')).toBe(true);
    for (const el of w.document.querySelectorAll(CONTROLS)) {
      const hidden = el.closest('[data-display-hide]');
      expect(hidden, `${page} : ${el.outerHTML.slice(0, 80)}`).not.toBeNull();
      expect(w.getComputedStyle(hidden as Element).display).toBe('none');
    }
  });

  it.each(PAGES)('%s sans paramètre : contrôles inchangés', page => {
    const w = load(page, '');
    expect(w.document.documentElement.classList.contains('display-mode')).toBe(false);
    expect(w.document.querySelector('style[data-bp="display-mode"]')).toBeNull();
  });

  it('display=10 ou display=0 n’active pas le mode', () => {
    expect(
      load('kiosk', '?display=0').document.documentElement.classList.contains('display-mode')
    ).toBe(false);
    expect(
      load('kiosk', '?display=10').document.documentElement.classList.contains('display-mode')
    ).toBe(false);
  });

  it('routes des écrans publics : GET uniquement', () => {
    const writes: string[] = [];
    const reads: string[] = [];
    const app = {
      get: (p: string) => reads.push(p),
      post: (p: string) => writes.push(p),
      put: (p: string) => writes.push(p),
      patch: (p: string) => writes.push(p),
      delete: (p: string) => writes.push(p),
      all: (p: string) => writes.push(p),
    };
    registerPageRoutes({ app } as unknown as RouteContext);
    const DISPLAY = [
      '/kiosk',
      '/arene:arenaId/public',
      '/arena:arenaId/public',
      '/arene:arenaId/overlay',
      '/arena:arenaId/overlay',
      '/api/public/eta',
    ];
    for (const p of DISPLAY) {
      expect(reads).toContain(p);
      expect(writes).not.toContain(p);
    }
  });
});
