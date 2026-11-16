/**
 * Script de page de la tablette arbitre (/js/refereeApp.js, extrait de referee.html, #1600) : exécuté dans jsdom
 * avec les modules referee* réels et un socket factice.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM, VirtualConsole } from 'jsdom';

const REMOTE_DIR = path.join(__dirname, '..');
const read = (name: string) => fs.readFileSync(path.join(REMOTE_DIR, name), 'utf8');

type Handler = (data?: unknown) => void;

async function loadReferee(session: Record<string, unknown> = {}) {
  // Via jsdom (pas de regex sur le HTML, cf. CLAUDE.md) : scripts /js/* et common.js intégrés inline
  const prep = new JSDOM(read('referee.html'));
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
  const emittedData: unknown[] = [];
  const dom = new JSDOM(prep.serialize(), {
    url: 'http://localhost/arene1/arbitre',
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
        emit(e: string, data?: unknown) {
          emitted.push(e);
          emittedData.push(data);
          return socket;
        },
      };
      w.io = () => socket;
      w.T = (k: string) => k;
      w.initRemoteI18n = async () => {};
      w.fetch = async (url: string) => ({
        ok: true,
        json: async () => (url === '/api/session' ? session : {}),
        text: async () => '',
      });
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {};
    },
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  return { dom, handlers, emitted, emittedData, errors };
}

describe('refereeApp.js dans referee.html', () => {
  it('referee.html ne contient plus de script inline', () => {
    const doc = new JSDOM(read('referee.html')).window.document;
    const inline = Array.from(doc.querySelectorAll('script')).filter(s => !s.hasAttribute('src'));
    expect(inline).toHaveLength(0);
    expect(doc.querySelector('script[src="/js/refereeApp.js"]')).not.toBeNull();
  });

  it('s exécute sans erreur et branche les événements socket', async () => {
    const { handlers, errors } = await loadReferee();
    expect(errors).toEqual([]);
    expect(handlers['connect']).toBeTypeOf('function');
    expect(handlers['server:command']).toBeTypeOf('function');
  });
});

describe('chrono conservé après rafraîchissement (#1717)', () => {
  const KEY = 'bp_referee_timer_arena1'; // arenaId de /arene1/arbitre
  type App = {
    matches: Array<Record<string, unknown>>;
    currentMatch: { id: string } | null;
    matchStatus: string;
    timerSeconds: number;
    defaultTimerSeconds: number;
    isSuddenDeath: boolean;
    timerRunning: boolean;
    _timerCs: number;
    selectMatch: (id: string) => void;
    broadcastTimerUpdate: () => void;
  };
  const fencer = (id: string) => ({ id, firstName: id, lastName: id, club: '' });
  const match = (status: string) => ({
    id: 'm1',
    poolId: 'p1',
    fencerA: fencer('a'),
    fencerB: fencer('b'),
    scoreA: { value: 2 },
    scoreB: { value: 1 },
    status,
  });

  it('pendant le match : le chrono diffusé est mémorisé en localStorage', async () => {
    const { dom, errors } = await loadReferee();
    const w = dom.window as unknown as { refereeApp: App; localStorage: Storage };
    const app = w.refereeApp;
    app.currentMatch = { id: 'm1' };
    app.matchStatus = 'in_progress';
    app._timerCs = 9500;
    app.broadcastTimerUpdate();
    const saved = JSON.parse(w.localStorage.getItem(KEY) ?? '{}');
    expect(saved).toMatchObject({ matchId: 'm1', cs: 9500 });
    expect(errors).toEqual([]);
  });

  it('reprise du même match en cours : temps restauré, chrono à l arrêt, arène remise en cours', async () => {
    const { dom, emittedData, errors } = await loadReferee();
    const w = dom.window as unknown as { refereeApp: App; localStorage: Storage };
    const app = w.refereeApp;
    w.localStorage.setItem(
      KEY,
      JSON.stringify({
        matchId: 'm1',
        cs: 9500,
        isSuddenDeath: false,
        overtimeType: null,
        isResting: false,
        savedAt: Date.now(),
      })
    );
    app.matches = [match('in_progress')];
    app.selectMatch('m1');
    expect(app.timerSeconds).toBe(95);
    expect(app.matchStatus).toBe('in_progress');
    expect(app.timerRunning).toBe(false);
    const actions = emittedData.map(d => (d as { action?: string } | undefined)?.action);
    expect(actions).toContain('select_match');
    expect(actions.indexOf('start')).toBeGreaterThan(actions.indexOf('select_match'));
    expect(actions).toContain('pause_timer');
    expect(errors).toEqual([]);
  });

  it('match non commencé ou autre match : durée initiale, sauvegarde effacée', async () => {
    const { dom, emittedData } = await loadReferee();
    const w = dom.window as unknown as { refereeApp: App; localStorage: Storage };
    const app = w.refereeApp;
    w.localStorage.setItem(KEY, JSON.stringify({ matchId: 'm1', cs: 9500, savedAt: Date.now() }));
    app.matches = [match('not_started')];
    app.selectMatch('m1');
    expect(app.timerSeconds).toBe(app.defaultTimerSeconds);
    expect(app.matchStatus).not.toBe('in_progress');
    expect(w.localStorage.getItem(KEY)).toBeNull();
    const actions = emittedData.map(d => (d as { action?: string } | undefined)?.action);
    expect(actions).not.toContain('start');
  });

  it('retour à la liste (fin de match) : sauvegarde du chrono effacée', async () => {
    const { dom } = await loadReferee();
    const w = dom.window as unknown as { refereeApp: App; localStorage: Storage };
    const app = w.refereeApp;
    app.currentMatch = { id: 'm1' };
    app.matchStatus = 'in_progress';
    app._timerCs = 9500;
    app.broadcastTimerUpdate();
    expect(w.localStorage.getItem(KEY)).not.toBeNull();
    (app as unknown as { _clearActiveMatch: () => void })._clearActiveMatch();
    expect(w.localStorage.getItem(KEY)).toBeNull();
  });
});

describe('armes olympiques : point au clic sur la case score (#1713)', () => {
  type Olympic = {
    isModernFencing: boolean;
    customScoring: unknown;
    currentMatch: { id: string } | null;
    matchStatus: string;
    scoreA: number;
    scoreB: number;
    timerRunning: boolean;
    _timerCs: number;
  };

  it('le +1 est masqué et un clic sur la case score ajoute 1 point, chrono arrêté', async () => {
    const { dom, errors } = await loadReferee();
    const doc = dom.window.document;
    const app = (dom.window as unknown as { refereeApp: Olympic }).refereeApp;
    app.isModernFencing = true;
    app.customScoring = null;
    // Même chemin que l'init olympique (le +1 est masqué, les tap sont branchés)
    (app as unknown as { setupOlympicScoreTap: () => void }).setupOlympicScoreTap();
    doc.getElementById('btn-plus-1-a')!.style.display = 'none';
    expect(doc.getElementById('btn-plus-1-a')!.style.display).toBe('none');
    app.currentMatch = { id: 'm1' };
    app.matchStatus = 'in_progress';
    app.timerRunning = true;
    app._timerCs = 9500;
    const before = app.scoreA + app.scoreB;
    doc.getElementById('score-a')!.click();
    expect(app.scoreA + app.scoreB).toBe(before + 1);
    expect(app.timerRunning).toBe(false);
    expect(errors).toEqual([]);
  });
});

describe('tournoi des rapières : même vue arbitre que les armes olympiques (#1808)', () => {
  it('arme C sans barème (pool/de vides) : +1/+3/+5 masqués, point au clic sur la case score', async () => {
    const { dom, errors } = await loadReferee({
      weapon: 'C',
      modernRules: true,
      customScoring: { pool: undefined, de: undefined },
    });
    const doc = dom.window.document;
    const app = (dom.window as unknown as { refereeApp: { customScoring: unknown } }).refereeApp;
    expect(app.customScoring).toBeNull();
    for (const id of ['btn-plus-1-a', 'btn-plus-3-b', 'btn-plus-5-a'])
      expect(doc.getElementById(id)!.style.display).toBe('none');
    expect((doc.getElementById('score-a') as HTMLElement).dataset.tapBound).toBe('1');
    expect(errors).toEqual([]);
  });

  it('arme C avec barème de formule : boutons de zones conservés', async () => {
    const { dom } = await loadReferee({
      weapon: 'C',
      modernRules: true,
      customScoring: { pool: { type: 'zones', zones: [{ label: 'A', points: 1 }] } },
    });
    const app = (dom.window as unknown as { refereeApp: { customScoring: unknown } }).refereeApp;
    expect(app.customScoring).not.toBeNull();
  });
});

describe('appareil de piste maître (#1829) : chrono du serveur et cartons verrouillés', () => {
  type App = {
    matches: Array<Record<string, unknown>>;
    currentMatch: { id: string } | null;
    matchStatus: string;
    isModernFencing: boolean;
    cardAnnounceEnabled: boolean;
    timerRunning: boolean;
    cardsA: string[];
    cardsB: string[];
    _timerCs: number;
    cyranoMasterLock: boolean;
    selectMatch: (id: string) => void;
    handleArenaUpdate: (data: Record<string, unknown>) => void;
    handleCardButtonPress: (fencer: string, cardType: string) => void;
    addPassivityCard: () => void;
    requestBlackCard: (fencer: string) => void;
    removeCardFromButton: (config: { fencer: string; cardType: string }) => void;
  };
  const fencer = (id: string) => ({ id, firstName: id, lastName: id, club: '' });
  const resumed = (serverTimer: unknown) => ({
    id: 'm1',
    poolId: 'p1',
    fencerA: fencer('a'),
    fencerB: fencer('b'),
    scoreA: { value: 2 },
    scoreB: { value: 1 },
    status: 'in_progress',
    serverTimer,
  });

  it('reprise après redémarrage sans chrono local : temps du serveur, chrono à l’arrêt', async () => {
    const { dom, emittedData, errors } = await loadReferee();
    const app = (dom.window as unknown as { refereeApp: App }).refereeApp;
    app.matches = [resumed({ time: 72.5, isSuddenDeath: false, overtimeType: null })];
    app.selectMatch('m1');
    expect(app._timerCs).toBe(7250);
    expect(app.timerRunning).toBe(false);
    expect(app.matchStatus).toBe('in_progress');
    const actions = emittedData.map(d => (d as { action?: string } | undefined)?.action);
    expect(actions.indexOf('start')).toBeGreaterThan(actions.indexOf('select_match'));
    expect(actions).toContain('pause_timer');
    expect(errors).toEqual([]);
  });

  it('chrono local prioritaire sur celui du serveur', async () => {
    const { dom } = await loadReferee();
    const w = dom.window as unknown as { refereeApp: App; localStorage: Storage };
    w.localStorage.setItem(
      'bp_referee_timer_arena1',
      JSON.stringify({ matchId: 'm1', cs: 6000, savedAt: Date.now() })
    );
    const app = w.refereeApp;
    app.matches = [resumed({ time: 90, isSuddenDeath: false, overtimeType: null })];
    app.selectMatch('m1');
    expect(app._timerCs).toBe(6000);
  });

  const lockedApp = async () => {
    const loaded = await loadReferee();
    const app = (loaded.dom.window as unknown as { refereeApp: App }).refereeApp;
    app.currentMatch = { id: 'm1' };
    app.matchStatus = 'in_progress';
    app.timerRunning = false;
    app.cardAnnounceEnabled = false;
    app.handleArenaUpdate({ cyrano: { piste: '1', mode: 'master', online: true } });
    loaded.emittedData.length = 0;
    return { app, ...loaded };
  };

  it('maître en ligne : ajout de carton bloqué (classique, P, noir), rien n’est envoyé', async () => {
    const { app, dom, emittedData, errors } = await lockedApp();
    expect(app.cyranoMasterLock).toBe(true);
    app.isModernFencing = false;
    app.handleCardButtonPress('A', 'yellow');
    app.handleCardButtonPress('B', 'red');
    app.isModernFencing = true;
    app.handleCardButtonPress('A', 'white'); // carton P
    app.addPassivityCard();
    app.requestBlackCard('A');
    expect(app.cardsA).toEqual([]);
    expect(app.cardsB).toEqual([]);
    const modal = dom.window.document.getElementById('black-card-modal')!;
    expect(modal.classList.contains('active')).toBe(false);
    expect(emittedData).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('maître en ligne : retrait d’un carton permis pour corriger', async () => {
    const { app, emittedData } = await lockedApp();
    app.isModernFencing = true;
    // Bouton de gauche ou de droite : le côté réel dépend de l'orientation de la vue
    app.cardsA = ['yellow'];
    app.cardsB = ['yellow'];
    app.removeCardFromButton({ fencer: 'A', cardType: 'yellow' });
    expect([...app.cardsA, ...app.cardsB]).toEqual(['yellow']);
    expect(emittedData).toContainEqual(expect.objectContaining({ action: 'update_score' }));
  });

  it('appareil hors ligne : ajout de carton de nouveau permis', async () => {
    const { app } = await lockedApp();
    app.handleArenaUpdate({ cyrano: { piste: '1', mode: 'master', online: false } });
    expect(app.cyranoMasterLock).toBe(false);
    app.isModernFencing = true;
    app.handleCardButtonPress('A', 'yellow');
    expect([...app.cardsA, ...app.cardsB]).toEqual(['yellow']);
  });
});
