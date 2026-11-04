// @vitest-environment jsdom
/**
 * Module écran d'arène /js/arenaPanels.js (#1401) : photos, plan de visibilité, match suivant.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const P = req('./arenaPanels.js');
const $ = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  const side = (p: string, ...ids: string[]) =>
    ids.map(i => `<span id="${p}${i}"></span>`).join('');
  document.body.innerHTML = `
    <div id="waiting-screen" class="hidden"></div><div id="match-display"></div>
    <div id="photo-intro"></div><div id="next-match-panel"></div>
    ${side('intro-', 'name-a', 'club-a', 'name-b', 'club-b')}
    <img id="photo-a"><i id="default-icon-a"></i><img id="photo-b"><i id="default-icon-b"></i>
    ${side('next-', 'name-a', 'name-b')}
    <img id="next-photo-a"><i id="next-icon-a"></i><img id="next-photo-b"><i id="next-icon-b"></i>
    <div id="next-referee-name" class="hidden"><span id="next-referee-label"></span></div>
    <div id="idle-referee-banner" class="hidden"><span id="idle-referee-label"></span></div>
    <div id="next-idle-preview"></div><div id="arena-idle-number"></div><div class="arena-idle-label"></div>
    ${side('idle-', 'name-a', 'club-a', 'name-b', 'club-b')}
    <img id="idle-photo-a"><i id="idle-icon-a"></i><img id="idle-photo-b"><i id="idle-icon-b"></i>`;
});

const match = {
  fencerA: { lastName: 'Aa', firstName: 'Ann', club: 'CA', photo: 'QUJD' },
  fencerB: { lastName: 'Bb', club: 'CB' },
  referee: { name: 'Arb Un' },
};

describe('arenaPanels.js', () => {
  it('photoSrc : préfixe ajouté seulement si absent', () => {
    expect(P.photoSrc('QUJD')).toBe('data:image/jpeg;base64,QUJD');
    expect(P.photoSrc('data:image/png;base64,Zg==')).toBe('data:image/png;base64,Zg==');
  });

  it('setPhoto : photo ou icône', () => {
    P.setPhoto(document, 'photo-a', 'default-icon-a', 'QUJD');
    expect(($('photo-a') as HTMLImageElement).src).toContain('base64,QUJD');
    expect($('default-icon-a').style.display).toBe('none');
    P.setPhoto(document, 'photo-a', 'default-icon-a', undefined);
    expect($('photo-a').style.display).toBe('none');
    expect($('default-icon-a').style.display).toBe('block');
  });

  it.each([
    ['idle', false, false, false, 'idle', true],
    ['not_started', true, true, true, 'idle', true],
    ['ready', true, true, false, 'intro', false],
    ['ready', false, true, false, 'idleDisplay', true],
    ['ready', true, false, false, 'idleDisplay', true],
    ['in_progress', true, true, true, null, false],
    ['finished', false, false, true, 'nextPanel', false],
    ['finished', false, false, false, 'idleDisplay', true],
  ])(
    'visibilityPlan(%s, photos=%s, cur=%s, next=%s) -> %s',
    (st, ph, cur, nxt, action, waiting) => {
      const plan = P.visibilityPlan(st, ph, cur, nxt);
      expect(plan.action).toBe(action);
      expect(plan.waiting).toBe(waiting);
    }
  );

  it('applyVisibility : pose les classes', () => {
    P.applyVisibility(document, P.visibilityPlan('in_progress', false, true, false));
    expect($('waiting-screen').classList.contains('hidden')).toBe(true);
    expect($('match-display').classList.contains('active')).toBe(true);
    P.applyVisibility(document, P.visibilityPlan('finished', false, true, true));
    expect($('next-match-panel').classList.contains('hidden')).toBe(false);
    expect($('photo-intro').classList.contains('hidden')).toBe(true);
  });

  it('updatePhotoIntro : inversion et noms par défaut', () => {
    P.updatePhotoIntro(document, match, false);
    expect($('intro-name-a').textContent).toBe('Bb');
    expect($('intro-club-a').textContent).toBe('CB');
    P.updatePhotoIntro(document, match, true);
    expect($('intro-name-a').textContent).toBe('Aa Ann');
    expect(($('photo-a') as HTMLImageElement).src).toContain('QUJD');
    expect(() => P.updatePhotoIntro(document, null, true)).not.toThrow();
  });

  it('updateNextMatchPanel : arbitre affiché seulement si la fonction est active', () => {
    P.updateNextMatchPanel(document, match, true, true);
    expect($('next-name-a').textContent).toBe('Aa Ann');
    expect($('next-referee-label').textContent).toBe('Arb Un');
    expect($('next-referee-name').classList.contains('hidden')).toBe(false);
    expect($('idle-referee-banner').classList.contains('hidden')).toBe(false);
    P.updateNextMatchPanel(document, match, true, false);
    expect($('next-referee-name').classList.contains('hidden')).toBe(true);
  });

  it('updateIdleNextMatchDisplay : aperçu ou numéro d’arène', () => {
    P.updateIdleNextMatchDisplay(document, match, true);
    expect($('idle-name-b').textContent).toBe('Bb');
    expect($('arena-idle-number').style.display).toBe('none');
    expect($('next-idle-preview').classList.contains('hidden')).toBe(false);
    P.updateIdleNextMatchDisplay(document, null, true);
    expect($('arena-idle-number').style.display).toBe('');
    expect($('next-idle-preview').classList.contains('hidden')).toBe(true);
  });

  it('arena.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toContain('<script src="/js/arenaPanels.js"></script>');
    expect(html).not.toContain('base64,${photoBase64}');
  });
});
