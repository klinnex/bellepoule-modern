/**
 * Module arbitre /js/refereeTimer.js (#1401) : tick du chrono et décision de fin de temps.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const T = req('./refereeTimer.js');

describe('refereeTimer.js timerTick', () => {
  it('même dixième : ni affichage complet ni diffusion', () => {
    // 100 s restantes ; 4 ms plus tard : 9999.6 cs arrondi à 10000, même dixième
    const t = T.timerTick(100000, 4, 10000, 1000);
    expect(t.cs).toBe(10000);
    expect(t.fullRender).toBe(false);
    expect(t.broadcast).toBe(false);
    expect(t.announce).toBe(false);
    expect(t.finished).toBe(false);
  });

  it('changement de seconde : diffusion et annonce', () => {
    const t = T.timerTick(100000, 1000, 10000, 1000);
    expect(t.cs).toBe(9900);
    expect(t.announce).toBe(true);
    expect(t.broadcast).toBe(true);
    expect(t.fullRender).toBe(true);
    expect(t.lastTenth).toBe(990);
  });

  it('sous 10 s : diffusion à chaque dixième, sans annonce', () => {
    const t = T.timerTick(10000, 9930, 100, 10);
    expect(t.cs).toBe(7);
    expect(t.fullRender).toBe(true);
    expect(t.broadcast).toBe(true);
    const t2 = T.timerTick(10000, 9000, 100, 11);
    expect(t2.cs).toBe(100);
    expect(t2.broadcast).toBe(true);
    expect(t2.announce).toBe(false);
  });

  it('au-dessus de 10 s : dixième seul ne diffuse pas', () => {
    const t = T.timerTick(100000, 100, 10000, 1000);
    expect(t.cs).toBe(9990);
    expect(t.fullRender).toBe(true);
    expect(t.broadcast).toBe(false);
  });

  it('fin : plancher à 0, finished', () => {
    const t = T.timerTick(1000, 5000, 5, 0);
    expect(t).toMatchObject({ cs: 0, finished: true, fullRender: true, broadcast: true });
    expect(T.timerTick(1000, 990, 5, 0).finished).toBe(false);
  });
});

describe('refereeTimer.js timeUpAction', () => {
  const s = {
    isResting: false,
    trainingCustomRules: null,
    scoreA: 5,
    scoreB: 5,
    isSuddenDeath: false,
    overtimeType: null,
    isModernFencing: false,
  };

  it('repos terminé', () => {
    expect(T.timeUpAction({ ...s, isResting: true })).toBe('endRest');
  });

  it('égalité en temps normal : attente (classique) ou tirage prioritaire (olympique)', () => {
    expect(T.timeUpAction(s)).toBe('suddenDeath');
    expect(T.timeUpAction({ ...s, isModernFencing: true })).toBe('priorityDraw');
    expect(T.timeUpAction({ ...s, isSuddenDeath: true, overtimeType: 'challenger' })).toBe(
      'suddenDeath'
    );
  });

  it('égalité en temps supplémentaire : tirage au sort (classique) ou prioritaire (olympique)', () => {
    const sd = { ...s, isSuddenDeath: true, overtimeType: 'supplementary' };
    expect(T.timeUpAction(sd)).toBe('coinFlip');
    expect(T.timeUpAction({ ...sd, isModernFencing: true })).toBe('priorityApplies');
  });

  it('pas d’égalité ou mort subite désactivée : temps écoulé', () => {
    expect(T.timeUpAction({ ...s, scoreA: 6 })).toBe('timeUp');
    expect(T.timeUpAction({ ...s, trainingCustomRules: { disableSuddenDeath: true } })).toBe(
      'timeUp'
    );
  });

  it('referee.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/refereeTimer.js"></script>');
    expect(html).toContain('BPRefereeTimer.timerTick(');
    expect(html).not.toContain(
      'this.prepareSuddenDeath();\n                  }\n                } else if'
    );
  });
});

describe('refereeTimer.js sauvegarde locale du chrono (#1717)', () => {
  const NOW = 1_800_000_000_000;
  const memory = () => {
    const store: Record<string, string> = {};
    return {
      store,
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
  };

  it('aller-retour : même match restauré tel quel', () => {
    const st = memory();
    const state = {
      matchId: 'm1',
      cs: 9512.4,
      isSuddenDeath: true,
      overtimeType: 'supplementary',
      isResting: false,
    };
    expect(T.saveTimerState(st, '1', state, NOW)).toBe(true);
    expect(Object.keys(st.store)).toEqual([T.timerStateKey('1')]);
    expect(T.loadTimerState(st, '1', 'm1', NOW + 5000)).toEqual({
      cs: 9512,
      isSuddenDeath: true,
      overtimeType: 'supplementary',
      isResting: false,
    });
  });

  it('autre match, autre arène ou sauvegarde effacée : rien à restaurer', () => {
    const st = memory();
    T.saveTimerState(st, '1', { matchId: 'm1', cs: 6000 }, NOW);
    expect(T.loadTimerState(st, '1', 'm2', NOW)).toBeNull();
    expect(T.loadTimerState(st, '2', 'm1', NOW)).toBeNull();
    T.clearTimerState(st, '1');
    expect(T.loadTimerState(st, '1', 'm1', NOW)).toBeNull();
  });

  it('sauvegarde périmée (> 6 h) ou datée du futur : ignorée', () => {
    const raw = JSON.stringify(T.snapshotTimer({ matchId: 'm1', cs: 6000 }, NOW));
    expect(T.restoreTimer(raw, 'm1', NOW + 6 * 3600 * 1000)).not.toBeNull();
    expect(T.restoreTimer(raw, 'm1', NOW + 6 * 3600 * 1000 + 1)).toBeNull();
    expect(T.restoreTimer(raw, 'm1', NOW - 61000)).toBeNull();
  });

  it('valeurs corrompues : ignorées ; type de prolongation inconnu neutralisé', () => {
    expect(T.restoreTimer('{pas du json', 'm1', NOW)).toBeNull();
    expect(T.restoreTimer(null, 'm1', NOW)).toBeNull();
    expect(T.restoreTimer({ matchId: 'm1', cs: -1, savedAt: NOW }, 'm1', NOW)).toBeNull();
    expect(T.restoreTimer({ matchId: 'm1', cs: 'x', savedAt: NOW }, 'm1', NOW)).toBeNull();
    expect(T.restoreTimer({ matchId: 'm1', cs: 4e5, savedAt: NOW }, 'm1', NOW)).toBeNull();
    expect(T.restoreTimer({ matchId: 'm1', cs: 100 }, 'm1', NOW)).toBeNull();
    const r = T.restoreTimer(
      { matchId: 'm1', cs: 100, savedAt: NOW, overtimeType: '<img>', isResting: 'oui' },
      'm1',
      NOW
    );
    expect(r).toEqual({ cs: 100, isSuddenDeath: false, overtimeType: null, isResting: false });
  });

  it('stockage indisponible (navigation privée, quota) : toléré', () => {
    const broken = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(T.saveTimerState(broken, '1', { matchId: 'm1', cs: 100 }, NOW)).toBe(false);
    expect(T.loadTimerState(broken, '1', 'm1', NOW)).toBeNull();
    expect(() => T.clearTimerState(broken, '1')).not.toThrow();
  });
});
