/**
 * Module arbitre /js/refereeTts.js (#1401) : minuteur vocal (langue, paliers, config).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const T = req('./refereeTts.js');

describe('refereeTts.js', () => {
  it('ttsLangCode : normalisation, br et inconnu -> fr', () => {
    expect(T.ttsLangCode('en-GB')).toBe('en');
    expect(T.ttsLangCode('DE')).toBe('de');
    expect(T.ttsLangCode('ca')).toBe('ca');
    expect(T.ttsLangCode('zh-HK')).toBe('zh-HK');
    expect(T.ttsLangCode('br')).toBe('fr');
    expect(T.ttsLangCode('')).toBe('fr');
    expect(T.ttsLangCode(undefined)).toBe('fr');
  });

  it('ttsBcp47 et message d’activation avec repli fr', () => {
    expect(T.ttsBcp47('en')).toBe('en-GB');
    expect(T.ttsBcp47('zh-HK')).toBe('zh-HK');
    expect(T.ttsBcp47('xx')).toBe('fr-FR');
    expect(T.enabledMessage('de')).toBe('Sprachtimer aktiviert');
    expect(T.enabledMessage('xx')).toBe('Minuteur vocal activé');
  });

  it('mergeTtsConfig : champs valides seulement, announce fusionné', () => {
    const cfg: Record<string, unknown> = { voiceName: null, rate: 1, announce: { 60: true } };
    T.mergeTtsConfig(cfg, { voiceName: 'Amelie', rate: 0, announce: { 30: false } });
    expect(cfg).toEqual({ voiceName: 'Amelie', rate: 1, announce: { 60: true, 30: false } });
    T.mergeTtsConfig(cfg, { voiceName: null, rate: 1.3 });
    expect(cfg.voiceName).toBeNull();
    expect(cfg.rate).toBe(1.3);
    expect(T.mergeTtsConfig(cfg, 'x')).toBe(cfg);
    expect(T.mergeTtsConfig(cfg, null)).toBe(cfg);
  });

  it('announceKey : paliers', () => {
    expect([60, 30, 10, 5, 4, 1, 0, 45].map(s => T.announceKey(s))).toEqual([
      '60',
      '30',
      '10',
      '5',
      'countdown',
      'countdown',
      '0',
      null,
    ]);
  });

  it('announcementFor : phrase, chiffres, repli numérique, palier coupé, rien', () => {
    expect(T.announcementFor(60, 'fr', {})).toEqual({ text: 'Une minute' });
    expect(T.announcementFor(0, 'en', undefined)).toEqual({ text: 'Time!' });
    expect(T.announcementFor(3, 'zh-HK', {})).toEqual({ text: '三' });
    expect(T.announcementFor(3, 'es', {})).toEqual({ text: '3' });
    expect(T.announcementFor(30, 'fr', { 30: false })).toEqual({ text: null });
    expect(T.announcementFor(2, 'fr', { countdown: false })).toEqual({ text: null });
    expect(T.announcementFor(45, 'fr', {})).toBeNull();
  });

  it('referee.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/refereeTts.js"></script>');
    expect(html).toContain('BPRefereeTts.announcementFor(');
    expect(html).not.toContain('Trente secondes');
  });
});
