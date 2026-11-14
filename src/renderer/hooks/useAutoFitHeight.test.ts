// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { fitHeightToContent } from './useAutoFitHeight';

function fakeEl(scrollHeight: number, clientHeight: number, offsetHeight: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight });
  Object.defineProperty(el, 'offsetHeight', { value: offsetHeight });
  return el;
}

describe('fitHeightToContent (#1826)', () => {
  it('agrandit quand le contenu déborde', () => {
    const el = fakeEl(500, 400, 402);
    fitHeightToContent(el);
    expect(el.style.height).toBe('502px');
  });

  it('ne touche pas une modale sans débordement', () => {
    const el = fakeEl(400, 400, 402);
    fitHeightToContent(el);
    expect(el.style.height).toBe('');
  });

  it('plafonne à 90 % de la fenêtre', () => {
    const el = fakeEl(5000, 400, 402);
    fitHeightToContent(el);
    expect(el.style.height).toBe(`${Math.floor(window.innerHeight * 0.9)}px`);
  });
});
