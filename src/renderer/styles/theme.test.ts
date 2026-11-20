/**
 * Garde-fou palette sémantique, élévation et rayons (#1531)
 * Licensed under GPL-3.0
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.tsx'), 'utf8');
const SEMANTIC = ['success', 'warning', 'danger', 'info'];

describe('theme.css : palette sémantique (#1531)', () => {
  it('est importé après tokens.css', () => {
    expect(index.indexOf("'./styles/theme.css'")).toBeGreaterThan(
      index.indexOf("'./styles/tokens.css'")
    );
  });

  it('définit surfaces, accent et couleurs sémantiques', () => {
    for (const t of ['surface-0', 'surface-1', 'surface-2', 'accent', ...SEMANTIC]) {
      expect(css).toMatch(new RegExp(`--${t}:`));
    }
  });

  it('teintes douces redéfinies pour le thème sombre', () => {
    // Bloc sombre unique dans tokens.css (#1531)
    const design = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');
    const dark = design.slice(design.indexOf('.theme-dark {'));
    for (const t of SEMANTIC) {
      expect(dark).toMatch(new RegExp(`--${t}-soft:`));
      expect(dark).toMatch(new RegExp(`--${t}-on-soft:`));
    }
  });

  it('badges sémantiques migrés vers les tokens, sans variante sombre dédiée', () => {
    const design = fs.readFileSync(path.join(__dirname, 'design.css'), 'utf8');
    for (const t of SEMANTIC) {
      expect(design).toMatch(
        new RegExp(
          `\\.badge-${t} \\{\\s*background: var\\(--${t}-soft\\);\\s*color: var\\(--${t}-on-soft\\);`
        )
      );
      expect(design).not.toMatch(new RegExp(`\\.theme-dark \\.badge-${t}`));
    }
  });

  it('étapes terminées et badges de statut classement lisent les tokens sémantiques', () => {
    const design = fs.readFileSync(path.join(__dirname, 'design.css'), 'utf8');
    const main = fs.readFileSync(path.join(__dirname, 'main.css'), 'utf8');
    expect(design).toMatch(/\.phase-step-completed \{[^}]*var\(--success-on-soft\)/);
    expect(design).not.toMatch(/\.theme-dark \.phase-step-completed/);
    expect(main).toMatch(/\.ranking-status-badge--abandon \{[^}]*var\(--warning-on-soft\)/);
    expect(main).toMatch(/\.ranking-status-badge--exclu \{[^}]*var\(--danger-on-soft\)/);
  });

  it("échelle d'élévation à 3 niveaux", () => {
    for (const n of [1, 2, 3]) expect(css).toMatch(new RegExp(`--elevation-${n}:`));
  });

  it('micro-interactions basées sur les tokens de mouvement, reduced-motion global', () => {
    expect(css).toMatch(/\.confirm-pulse \{[^}]*var\(--motion-base\)/);
    expect(css).toMatch(/\.check-draw \{[^}]*var\(--motion-base\)/);
    const design = fs.readFileSync(path.join(__dirname, 'design.css'), 'utf8');
    expect(design).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation-duration: 0\.01ms/);
  });

  it('tokens.css : un seul bloc .theme-dark de variables, tableau inclus', () => {
    const design = fs.readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');
    expect(design.match(/^\.theme-dark \{/gm)).toHaveLength(1);
    expect(design).toMatch(/\.theme-dark \{[^}]*--tableau-bg:/);
  });
});
