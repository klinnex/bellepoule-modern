/**
 * Module kiosque /js/kioskConfig.js (#1401) : réglages locaux, compte à rebours de la note d'organisation.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskConfig.js');

const store = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => void (m[k] = v),
  };
};

describe('kioskConfig.js', () => {
  it('rotation : défaut 15, minimum 3, valeur sauvegardée', () => {
    expect(K.createLocalConfig(store()).loadRotation()).toBe(15);
    expect(K.createLocalConfig(store({ kioskRotationSec: '2' })).loadRotation()).toBe(15);
    expect(K.createLocalConfig(store({ kioskRotationSec: 'abc' })).loadRotation()).toBe(15);
    const c = K.createLocalConfig(store());
    c.saveRotation(30);
    expect(c.loadRotation()).toBe(30);
  });

  it('mode du tableau : valeurs connues seulement, sinon auto', () => {
    const c = K.createLocalConfig(store());
    expect(c.loadTableauMode()).toBe('auto');
    c.saveTableauMode('cinema');
    expect(c.loadTableauMode()).toBe('cinema');
    expect(K.createLocalConfig(store({ kioskTableauMode: 'zzz' })).loadTableauMode()).toBe('auto');
  });

  it('vues : aller-retour, JSON invalide ou absent -> null', () => {
    const c = K.createLocalConfig(store());
    expect(c.loadViews()).toBeNull();
    c.saveViews({ poules: true, direct: false });
    expect(c.loadViews()).toEqual({ poules: true, direct: false });
    expect(K.createLocalConfig(store({ kioskViewsLocal: '{oops' })).loadViews()).toBeNull();
  });

  it('parseTargetTime', () => {
    expect(K.parseTargetTime('9:05')).toEqual({ hh: 9, mm: 5, label: '09h05' });
    expect(K.parseTargetTime('14:30').label).toBe('14h30');
  });

  it('secondsUntil : même jour, lendemain si passée', () => {
    const now = new Date(2026, 0, 10, 12, 0, 0);
    expect(K.secondsUntil(12, 10, now)).toBe(600);
    expect(K.secondsUntil(11, 0, now)).toBe(23 * 3600);
    expect(K.secondsUntil(12, 0, now)).toBe(24 * 3600);
  });

  it('formatCountdown', () => {
    expect(K.formatCountdown('Reprise dans', 605)).toBe('Reprise dans 10 min 05 s');
    expect(K.formatCountdown('x', 0)).toBe('x 0 min 00 s');
  });

  it('kiosk.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskConfig.js"></script>');
    expect(html).not.toContain("localStorage.getItem('kioskRotationSec')");
  });
});
