/**
 * Pages distantes : un tireur nommé `<img src=x onerror=…>` doit rester inerte (#1147).
 * Les pages sont chargées dans jsdom avec un socket factice ; les données piégées sont
 * poussées comme le ferait le serveur, puis on vérifie qu'aucun élément ni script n'apparaît.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const REMOTE_DIR = __dirname;
const PAYLOAD = '<img src=x onerror="window.__xss=1">';

type Handler = (data: unknown) => void;

function fakeSocket(handlers: Record<string, Handler>) {
  const socket: Record<string, unknown> = {
    connected: true,
    id: 'fake',
    on(event: string, cb: Handler) {
      handlers[event] = cb;
      return socket;
    },
  };
  return new Proxy(socket, {
    get: (target, prop: string) => (prop in target ? target[prop] : () => socket),
  });
}

async function loadPage(file: string, url: string) {
  const read = (name: string) => fs.readFileSync(path.join(REMOTE_DIR, name), 'utf8');
  let html = read(file);
  html = html.replace(/<script src="\/(common|i18n)\.js"><\/script>/g, (_m, name: string) => {
    return `<script>${read(`${name}.js`)}</script>`;
  });
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  const handlers: Record<string, Handler> = {};
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      const w = window as unknown as Record<string, unknown>;
      w.io = () => fakeSocket(handlers);
      w.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
      (window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = () =>
        null;
    },
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  return { dom, handlers };
}

function expectInert(dom: JSDOM) {
  const w = dom.window as unknown as Record<string, unknown>;
  expect(w.__xss).toBeUndefined();
  expect(dom.window.document.querySelector('img[src="x"]')).toBeNull();
}

describe('rendu inerte des noms piégés (#1147)', () => {
  it('dashboard : classement, poules et matchs', async () => {
    const { dom, handlers } = await loadPage('dashboard.html', 'http://localhost/dashboard');
    const fencer = { lastName: PAYLOAD, firstName: PAYLOAD, club: PAYLOAD };
    handlers['rankings:update']?.({
      rankings: [{ rank: 1, ...fencer, victories: 3, quest: 0, indicator: 2 }],
    });
    handlers['pools:update']?.({
      pools: [{ number: 1, ranking: [{ ...fencer, victories: 1, quest: 0, indicator: 0 }] }],
    });
    handlers['matches:update']?.({
      matches: [
        {
          number: 1,
          poolNumber: 1,
          fencerA: PAYLOAD,
          fencerB: PAYLOAD,
          clubA: PAYLOAD,
          clubB: PAYLOAD,
          scoreA: 1,
          scoreB: 2,
        },
      ],
    });
    expect(handlers['rankings:update']).toBeTypeOf('function');
    expectInert(dom);
    expect(dom.window.document.body.innerHTML).toContain('&lt;img');
  });

  for (const page of ['public.html', 'arena.html']) {
    it(`${page} : match en cours et annonce de carton`, async () => {
      const { dom, handlers } = await loadPage(page, 'http://localhost/arene1');
      const fencer = { id: 'f1', lastName: PAYLOAD, firstName: PAYLOAD, club: PAYLOAD };
      const update = handlers['arena:1:update'] ?? handlers['arena:arena1:update'];
      const key = Object.keys(handlers).find(k => /^arena:.*:update$/.test(k));
      const handler = update ?? (key ? handlers[key] : undefined);
      expect(handler).toBeTypeOf('function');
      handler?.({
        arenaId: 'arena1',
        status: 'ready',
        currentMatch: {
          id: 'm1',
          fencerA: fencer,
          fencerB: { ...fencer, id: 'f2' },
          scoreA: 0,
          scoreB: 0,
          status: 'not_started',
        },
      });
      const cardKey = Object.keys(handlers).find(k => /card_announcement$/.test(k));
      if (cardKey)
        handlers[cardKey]?.({ fencerName: PAYLOAD, cardType: 'yellow', points: 1, fencerId: 'f1' });
      expectInert(dom);
    });
  }
});
