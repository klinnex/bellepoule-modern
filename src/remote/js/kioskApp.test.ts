/**
 * Script de page du kiosque (/js/kioskApp.js, extrait de kiosk.html, #1600) : exécuté dans jsdom
 * avec les modules kiosk* réels et un socket factice.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const REMOTE_DIR = path.join(__dirname, '..');
const read = (name: string) => fs.readFileSync(path.join(REMOTE_DIR, name), 'utf8');

type Handler = (data?: unknown) => void;

async function loadKiosk() {
  // Via jsdom (pas de regex sur le HTML, cf. CLAUDE.md) : scripts /js/* et common.js intégrés inline
  const prep = new JSDOM(read('kiosk.html'));
  for (const s of Array.from(prep.window.document.querySelectorAll('script[src]'))) {
    const name = /^\/((?:js\/)?[A-Za-z0-9]+)\.js$/.exec(s.getAttribute('src') ?? '')?.[1];
    if (name && /^(common|js\/)/.test(name)) {
      const inline = prep.window.document.createElement('script');
      inline.textContent = read(`${name}.js`).split('</script').join('<\\/script');
      s.replaceWith(inline);
    } else {
      s.remove();
    }
  }
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.message)));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const handlers: Record<string, Handler> = {};
  const emitted: string[] = [];
  const dom = new JSDOM(prep.serialize(), {
    url: 'http://localhost/kiosque',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      const w = window as unknown as Record<string, unknown>;
      const socket: Record<string, unknown> = {
        connected: true,
        on(e: string, cb: Handler) {
          handlers[e] = cb;
          return socket;
        },
        emit(e: string) {
          emitted.push(e);
          return socket;
        },
      };
      w.io = () => socket;
      w.T = (k: string) => k;
      w.initRemoteI18n = async () => {};
      w.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
    },
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  return { dom, handlers, emitted, errors };
}

describe('kioskApp.js dans kiosk.html', () => {
  it('kiosk.html ne contient plus de script inline', () => {
    const doc = new JSDOM(read('kiosk.html')).window.document;
    const inline = Array.from(doc.querySelectorAll('script')).filter(s => !s.hasAttribute('src'));
    expect(inline).toHaveLength(0);
    expect(doc.querySelector('script[src="/js/kioskApp.js"]')).not.toBeNull();
  });

  it('s exécute sans erreur et branche les événements socket', async () => {
    const { handlers, errors } = await loadKiosk();
    expect(errors).toEqual([]);
    expect(handlers['kiosk:data']).toBeTypeOf('function');
    expect(handlers['connect']).toBeTypeOf('function');
    expect(handlers['server:command']).toBeTypeOf('function');
  });
});
