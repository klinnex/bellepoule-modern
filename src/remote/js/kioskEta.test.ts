// @vitest-environment jsdom
/**
 * Module kiosque /js/kioskEta.js (#1401) : libellés de phase, bandeau, option désactivable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const { etaPhaseLabel, createEtaController } = req('./kioskEta.js');

const T = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);

function dom() {
  document.body.innerHTML =
    '<div id="kiosk-eta" hidden><span id="kiosk-eta-label"></span><span id="kiosk-eta-time"></span>' +
    '<span id="kiosk-eta-detail"></span></div><input type="checkbox" id="cb-eta">';
}
const store = (init: Record<string, string> = {}) => {
  const m = { ...init };
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => void (m[k] = v),
  };
};
const okFetch = (eta: unknown) => vi.fn().mockResolvedValue({ json: async () => ({ eta }) });

describe('kioskEta.js', () => {
  beforeEach(dom);

  it('libellé de phase : finale, tableau, poules, défaut', () => {
    expect(etaPhaseLabel(T, { phase: 'tableau', round: 2 })).toBe('dashboard.eta_final');
    expect(etaPhaseLabel(T, { phase: 'tableau', round: 8 })).toBe('dashboard.eta_tableau:{"n":8}');
    expect(etaPhaseLabel(T, { phase: 'pools' })).toBe('dashboard.eta_pools');
    expect(etaPhaseLabel(T, {})).toBe('dashboard.eta');
  });

  it('affiche le bandeau quand il reste des matchs', async () => {
    const c = createEtaController({
      doc: document,
      storage: store(),
      fetchFn: okFetch({ phase: 'pools', remainingMatches: 4, finishAt: Date.now() }),
      getT: () => T,
    });
    await c.refresh();
    expect(document.getElementById('kiosk-eta')!.hidden).toBe(false);
    expect(document.getElementById('kiosk-eta-label')!.textContent).toBe('dashboard.eta_pools');
    expect(document.getElementById('kiosk-eta-detail')!.textContent).toBe(
      '· dashboard.eta_remaining:{"count":4}'
    );
  });

  it('masque sans eta, sans match restant, sur erreur ou si désactivé', async () => {
    const box = document.getElementById('kiosk-eta')!;
    for (const [fetchFn, storage] of [
      [okFetch(null), store()],
      [okFetch({ remainingMatches: 0 }), store()],
      [vi.fn().mockRejectedValue(new Error('x')), store()],
      [okFetch({ remainingMatches: 3 }), store({ kioskShowEta: '0' })],
    ] as const) {
      box.hidden = false;
      await createEtaController({ doc: document, storage, fetchFn, getT: () => T }).refresh();
      expect(box.hidden).toBe(true);
    }
  });

  it('la case à cocher persiste l’option et rafraîchit', () => {
    const storage = store({ kioskShowEta: '0' });
    const fetchFn = okFetch(null);
    createEtaController({ doc: document, storage, fetchFn, getT: () => T });
    const cb = document.getElementById('cb-eta') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(storage.getItem('kioskShowEta')).toBe('1');
    expect(fetchFn).toHaveBeenCalledWith('/api/public/eta', { cache: 'no-store' });
  });

  it('kiosk.html charge le module en script externe (CSP) sans code ETA inline', () => {
    const html = fs.readFileSync(path.join(__dirname, '../kiosk.html'), 'utf8');
    expect(html).toContain('<script src="/js/kioskEta.js"></script>');
    expect(html).not.toContain('function etaPhaseLabel');
  });
});
