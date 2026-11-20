/**
 * Garde-fou tokens de mouvement et surfaces translucides (#1531)
 * Licensed under GPL-3.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');

describe('tokens.css : mouvement et surfaces (#1531)', () => {
  it('définit les tokens de mouvement', () => {
    expect(css).toMatch(/--motion-fast:/);
    expect(css).toMatch(/--motion-base:/);
    expect(css).toMatch(/--motion-ease:/);
  });

  it('surface translucide uniquement sous @supports backdrop-filter, repli opaque par défaut', () => {
    expect(css).toMatch(/--surface-glass: var\(--color-surface\);/);
    const supports = css.indexOf('@supports ((backdrop-filter');
    expect(supports).toBeGreaterThan(-1);
    expect(css.indexOf('backdrop-filter: blur(14px)')).toBeGreaterThan(supports);
  });

  it('design.css neutralise les animations via prefers-reduced-motion', () => {
    const design = fs.readFileSync(path.join(__dirname, 'design.css'), 'utf8');
    expect(design).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*animation-duration: 0\.01ms !important/
    );
  });
});
