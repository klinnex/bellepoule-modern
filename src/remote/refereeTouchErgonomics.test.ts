/**
 * Ergonomie tactile de la tablette arbitre (#1539, lot 1) : espacement, retour à l'appui, focus, annulation.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const html = fs.readFileSync(path.join(__dirname, 'referee.html'), 'utf8');

function rule(selector: string): string {
  const i = html.indexOf(`${selector} {`);
  expect(i).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf('}', i));
}

describe('referee.html ergonomie tactile (#1539)', () => {
  it('espace les cibles de score et de cartons d au moins 8 px', () => {
    expect(rule('.score-buttons')).toContain('gap: 0.5rem');
    expect(rule('.card-buttons')).toContain('gap: 0.5rem');
  });

  it('donne un retour visuel à l appui sur les boutons de score et de contrôle', () => {
    expect(rule('.score-btn:active')).toContain('brightness');
    expect(rule('.control-btn:active')).toContain('brightness');
  });

  it('rend le focus visible sur les contrôles de saisie', () => {
    expect(html).toMatch(/\.control-btn:focus-visible[^{]*\{ outline: 3px/);
  });

  it('garde le bouton Annuler plus grand que les sorties d arène', () => {
    expect(rule('.btn-undo')).toContain('min-height: 56px');
  });

  it('annonce les scores aux lecteurs d écran', () => {
    expect(html).toMatch(/id="score-a" role="status" aria-live="polite"/);
    expect(html).toMatch(/id="score-b" role="status" aria-live="polite"/);
  });
});
