import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

// #1537 : audit axe statique des pages distantes (jsdom, scripts non exécutés).
// Le contraste (color-contrast) reste couvert par e2e/accessibility.spec.ts : jsdom ne calcule pas les styles.
const PAGES = [
  'referee',
  'arena',
  'kiosk',
  'public',
  'dashboard',
  'lobby',
  'login',
  'checkin',
  'register',
  'teamReferee',
  'teamArena',
];
const RULES = [
  'button-name',
  'link-name',
  'label',
  'image-alt',
  'input-button-name',
  'select-name',
  'html-has-lang',
  'document-title',
  'aria-allowed-attr',
  'aria-required-attr',
  'aria-valid-attr',
  'aria-valid-attr-value',
  'aria-roles',
  'duplicate-id-aria',
];

interface AxeWindow {
  eval(code: string): unknown;
  axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: AxeViolation[] }> };
  document: unknown;
  close(): void;
}
interface AxeViolation {
  id: string;
  nodes: { target: string[] }[];
}

describe('axe sur les pages distantes (#1537)', () => {
  for (const page of PAGES) {
    it(`${page}.html : aucune violation`, async () => {
      const html = readFileSync(join(__dirname, `${page}.html`), 'utf8');
      const win = new JSDOM(html, { runScripts: 'outside-only' }).window as unknown as AxeWindow;
      win.eval(axe.source);
      const results = await win.axe.run(win.document, { runOnly: { type: 'rule', values: RULES } });
      expect(
        results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)
      ).toEqual([]);
      // landmark-one-main reste « incomplete » sous jsdom (pas de calcul de visibilité) : contrôle direct
      expect((win.document as Document).querySelectorAll('main, [role="main"]').length).toBe(1);
      win.close();
    });
  }
});
