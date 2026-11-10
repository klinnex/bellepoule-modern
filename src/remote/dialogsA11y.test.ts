// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #1537 : les dialogues des pages distantes sont des role="dialog" modaux, nommés par un titre existant.
const pages = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

describe('dialogues des pages distantes (#1537)', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(__dirname, page), 'utf8');
    if (!html.includes('role="dialog"')) continue;
    it(`${page} : chaque role=dialog est modal et nommé`, () => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const dialogs = doc.querySelectorAll('[role="dialog"]');
      expect(dialogs.length).toBeGreaterThan(0);
      dialogs.forEach(d => {
        expect(d.getAttribute('aria-modal')).toBe('true');
        const id = d.getAttribute('aria-labelledby');
        expect(id).toBeTruthy();
        expect(doc.getElementById(id as string)).not.toBeNull();
      });
    });
  }

  it('referee.html : 5 dialogues (fin de match, carton noir, raison, poule, signature)', () => {
    const html = fs.readFileSync(path.join(__dirname, 'referee.html'), 'utf8');
    expect((html.match(/role="dialog"/g) ?? []).length).toBe(5);
  });
});
