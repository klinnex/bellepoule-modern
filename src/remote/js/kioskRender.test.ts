/**
 * Module kiosque /js/kioskRender.js (#1401) : gabarits des vues poules, classement, entraînement.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const K = req('./kioskRender.js');
const tk = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);
const esc = (v: unknown) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

describe('kioskRender.js', () => {
  it('isPoolComplete : indicateur serveur prioritaire, sinon matchs joués', () => {
    expect(K.isPoolComplete({ isComplete: false, rankings: [{ matchesPlayed: 9 }] })).toBe(false);
    expect(K.isPoolComplete({ isComplete: true, rankings: [] })).toBe(true);
    const full = { rankings: [{ matchesPlayed: 2 }, { matchesPlayed: 2 }, { matchesPlayed: 2 }] };
    expect(K.isPoolComplete(full)).toBe(true);
    expect(K.isPoolComplete({ rankings: [{ matchesPlayed: 1 }, { matchesPlayed: 2 }, {}] })).toBe(
      false
    );
    expect(K.isPoolComplete({ rankings: [] })).toBe(false);
  });

  it('poolsHtml : message vide, sinon cartes avec rangs et statut', () => {
    expect(K.poolsHtml([], tk, esc)).toContain('kiosk.no_pools_hint');
    expect(K.poolsHtml(null, tk, esc)).toContain('no-data');
    const html = K.poolsHtml(
      [
        {
          number: 2,
          isComplete: false,
          rankings: [
            { lastName: 'Aa', firstName: 'B', club: 'C', victories: 3, index: 4, touchesFor: 15 },
            { lastName: 'Zz', index: -2 },
          ],
        },
      ],
      tk,
      esc
    );
    expect(html).toContain('kiosk.pool_n:{&quot;n&quot;:2}');
    expect(html).toContain('class="rank-col rank-1"');
    expect(html).toContain('pool-pill ongoing');
    expect(html).toContain('+4');
    expect(html).toContain('color:#ef4444">-2');
  });

  it('poolsHtml : tout est échappé (XSS)', () => {
    const html = K.poolsHtml(
      [{ name: '<script>x</script>', rankings: [{ lastName: '<img onerror=1>', club: '"><b>' }] }],
      tk,
      esc
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('"><b>');
    expect(html).toContain('&lt;img onerror=1&gt;');
  });

  it('rankingRowsHtml : attente, puis lignes avec indice signé', () => {
    expect(K.rankingRowsHtml([], tk, esc)).toContain('kiosk.waiting_results');
    const html = K.rankingRowsHtml(
      [{ lastName: 'L', victories: 2, index: 0, touchesFor: 5 }],
      tk,
      esc
    );
    expect(html).toContain('>+0<');
    expect(html).toContain('—'); // club absent
    expect(html).toContain('color:#60a5fa');
  });

  it('formatBoutDuration', () => {
    expect(K.formatBoutDuration(125)).toBe('2:05');
    expect(K.formatBoutDuration(0)).toBe('—');
    expect(K.formatBoutDuration(undefined)).toBe('—');
  });

  it('trainingRowsHtml : vide, sinon ligne avec heure formatée et échappement', () => {
    expect(K.trainingRowsHtml([], tk, esc, () => '')).toContain('kiosk.no_finished_bout');
    const html = K.trainingRowsHtml(
      [{ arenaNumber: 3, scoreA: 5, scoreB: '<1>', durationSec: 61, finishedAt: 'T' }],
      tk,
      esc,
      iso => `h:${iso}`
    );
    expect(html).toContain('P3');
    expect(html).toContain('5 — &lt;1&gt;');
    expect(html).toContain('1:01');
    expect(html).toContain('h:T');
  });

  it('kiosk.html charge le module', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskRender.js"></script>');
    expect(html).not.toContain('<div class="pool-card">');
  });
});
