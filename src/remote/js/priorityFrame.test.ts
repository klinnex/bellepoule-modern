// @vitest-environment jsdom
/**
 * Non-régression #1442 : le cadre doré doit entourer le tireur réellement prioritaire.
 * Sans inversion, le panneau « a » (gauche) montre le tireur B ; l'ancien code posait le
 * cadre sur le panneau du même nom, donc sur l'adversaire (qui perdait à l'égalité).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const req = createRequire(import.meta.url);
const { frameDomSide, paintPriorityFrame } = req('./priorityDraw.js');
const { updateMatchDisplay } = req('./arenaRender.js');

describe('cadre doré du prioritaire (#1442)', () => {
  it('correspondance côté logique vers panneau affiché', () => {
    expect(frameDomSide('A', false)).toBe('B');
    expect(frameDomSide('B', false)).toBe('A');
    expect(frameDomSide('A', true)).toBe('A');
    expect(frameDomSide('B', true)).toBe('B');
    expect(frameDomSide(null, false)).toBeNull();
  });

  function build() {
    document.body.innerHTML =
      '<div class="fencer-display" id="fencer-a-display"><div id="fencer-a-name"></div><div id="fencer-a-club"></div></div>' +
      '<div class="fencer-display" id="fencer-b-display"><div id="fencer-b-name"></div><div id="fencer-b-club"></div></div>' +
      '<div id="score-a" class="score green"></div><div id="score-b" class="score red"></div>';
  }
  const gold = (id: string) => document.getElementById(id)!.classList.contains('priority-gold');

  it('le cadre est sur le panneau qui affiche le nom du prioritaire', () => {
    build();
    const match = {
      fencerA: { lastName: 'ALPHA', firstName: 'a' },
      fencerB: { lastName: 'BRAVO', firstName: 'b' },
    };
    for (const inv of [false, true]) {
      updateMatchDisplay(document, match, inv);
      paintPriorityFrame(document, 'A', inv);
      const goldPanel = gold('fencer-a-display') ? 'a' : 'b';
      expect(document.getElementById(`fencer-${goldPanel}-name`)!.textContent).toContain('ALPHA');
    }
  });

  it('le cadre survit au recalcul des classes (updateMatchDisplay)', () => {
    build();
    const match = { fencerA: { lastName: 'ALPHA' }, fencerB: { lastName: 'BRAVO' } };
    paintPriorityFrame(document, 'B', false);
    updateMatchDisplay(document, match, false);
    expect(gold('fencer-a-display')).toBe(true);
  });
});
