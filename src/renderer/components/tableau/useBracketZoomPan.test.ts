// @vitest-environment jsdom
/**
 * Tests de la mémorisation du zoom du tableau (#1542)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadBracketZoom, saveBracketZoom } from './useBracketZoomPan';

describe('zoom mémorisé du tableau', () => {
  beforeEach(() => localStorage.clear());

  it('renvoie 1 par défaut', () => {
    expect(loadBracketZoom('c1')).toBe(1);
    expect(loadBracketZoom(undefined)).toBe(1);
  });

  it('restitue le zoom par compétition', () => {
    saveBracketZoom('c1', 1.4);
    saveBracketZoom('c2', 0.6);
    expect(loadBracketZoom('c1')).toBe(1.4);
    expect(loadBracketZoom('c2')).toBe(0.6);
  });

  it('ignore une valeur invalide ou hors bornes', () => {
    localStorage.setItem('bp_bracket_zoom_c1', 'abc');
    expect(loadBracketZoom('c1')).toBe(1);
    localStorage.setItem('bp_bracket_zoom_c1', '9');
    expect(loadBracketZoom('c1')).toBe(1);
  });

  it('supprime l entrée quand le zoom revient à 1', () => {
    saveBracketZoom('c1', 1.2);
    saveBracketZoom('c1', 1);
    expect(localStorage.getItem('bp_bracket_zoom_c1')).toBeNull();
  });
});
