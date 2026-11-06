// @vitest-environment jsdom
/**
 * Module écran d'arène /js/arenaOverlays.js (#1401) : annonces, pile ou face, message distant, identification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const O = req('./arenaOverlays.js');

describe('arenaOverlays.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('cardAnnouncement : carton simple', () => {
    const r = O.cardAnnouncement({ cardType: 'yellow', fencerName: 'Dupont', reason: 'Retard' });
    expect(r.line1).toBe('Carton JAUNE — Dupont');
    expect(r.line2).toBe('Retard');
    expect(r.className).toBe('card-announcement-banner visible card-yellow');
  });

  it('cardAnnouncement : revalorisation, type inconnu -> NOIR / classe jaune', () => {
    const r = O.cardAnnouncement({
      cardType: 'red',
      fencerName: 'X',
      isRevalorisation: true,
      fromCard: 'white',
    });
    expect(r.line1).toBe('⚠️ Revalorisation 2ème blanc → ROUGE — X');
    expect(r.line2).toBeNull();
    const u = O.cardAnnouncement({ cardType: 'zzz', fencerName: 'Y' });
    expect(u.line1).toBe('Carton NOIR — Y');
    expect(u.className).toContain('card-yellow');
  });

  it('exitAnnouncement', () => {
    const r = O.exitAnnouncement({ fencerName: 'Z', points: 2 });
    expect(r.line1).toBe("🚪 Sortie d'arène — Z");
    expect(r.line2).toBe("+2 pts pour l'adversaire");
    expect(r.className).toContain('card-exit');
  });

  it('coinFlipPlan : vainqueur A = vert 3600, B = rouge 3780, noms par défaut', () => {
    const a = O.coinFlipPlan('A', { lastName: 'Martin', firstName: 'Léa' }, null);
    expect(a).toMatchObject({ nameGreen: 'Martin Léa', nameRed: 'ROUGE', finalDeg: 3600 });
    expect(a.resultText).toBe('🏆 Martin Léa gagne ! (VERT)');
    expect(a.resultClass).toBe('winner-green');
    const b = O.coinFlipPlan('B', { lastName: '', firstName: '' }, { lastName: 'Roux' });
    expect(b).toMatchObject({ nameGreen: 'VERT', nameRed: 'Roux', finalDeg: 3780 });
    expect(b.resultClass).toBe('winner-red');
  });

  it('showRemoteMessage : texte seul (pas de HTML interprété), masqué après la durée', () => {
    O.showRemoteMessage(document, '<img src=x onerror=alert(1)>', 1000);
    const b = document.getElementById('remote-msg-banner')!;
    expect(b.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(b.querySelector('img')).toBeNull();
    expect(b.style.opacity).toBe('1');
    vi.advanceTimersByTime(1000);
    expect(b.style.opacity).toBe('0');
    O.showRemoteMessage(document, 'bis', 10);
    expect(document.querySelectorAll('#remote-msg-banner')).toHaveLength(1);
  });

  it('showIdentifyOverlay : étiquette échappée, masqué après 5 s par défaut', () => {
    const esc = (s: string) => s.replace(/</g, '&lt;');
    O.showIdentifyOverlay({ doc: document, T: (k: string) => k, esc }, '<b>Piste 1', undefined);
    const ov = document.getElementById('bp-identify-overlay')!;
    expect(ov.querySelector('b')).toBeNull();
    expect(ov.textContent).toContain('<b>Piste 1');
    expect(ov.textContent).toContain('kiosk.identify');
    expect(ov.style.display).toBe('flex');
    vi.advanceTimersByTime(5000);
    expect(ov.style.display).toBe('none');
  });

  it('arena.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'arena.html'), 'utf8');
    expect(html).toContain('<script src="/js/arenaOverlays.js"></script>');
    expect(html).not.toContain('bp-identify-overlay');
  });
});
