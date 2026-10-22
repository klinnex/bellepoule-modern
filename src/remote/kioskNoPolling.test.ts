import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// #1152 : le kiosque ne doit plus interroger le serveur périodiquement.
const html = readFileSync(join(__dirname, 'kiosk.html'), 'utf8');

describe('kiosk.html sans polling HTTP (#1152)', () => {
  it('aucun setInterval ne déclenche un fetch', () => {
    expect(html).not.toMatch(/setInterval\(\s*(fetchData|fetchLogo|fetchBracket|refresh)\b/);
    for (const m of html.matchAll(/setInterval\(([\s\S]{0,300}?)\n\s*\}, \d+\)/g)) {
      expect(m[1]).not.toMatch(/\bfetch\(/);
    }
  });
  it('se resynchronise sur événements, reconnexion, visibilité et retour réseau', () => {
    expect(html).toContain("socket.on('kiosk:data', scheduleRefresh)");
    expect(html).toContain("socket.on('logo:update'");
    expect(html).toMatch(/if \(_connectedOnce\) resyncAll\(\)/);
    expect(html).toContain("addEventListener('visibilitychange'");
    expect(html).toContain("addEventListener('online', resyncAll)");
  });
  it('backoff exponentiel avec jitter sur échec', () => {
    expect(html).toMatch(/Math\.min\(30000, 1000 \* 2 \*\* retryAttempt\)/);
    expect(html).toContain('Math.random()');
  });
  it('timers d’animation suspendus quand la page est masquée', () => {
    expect((html.match(/if \(document\.hidden\) return;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
