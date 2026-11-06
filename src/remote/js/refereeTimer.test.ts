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
    const html = fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8');
    expect(html).toContain('<script src="/js/refereeTimer.js"></script>');
    expect(html).toContain('BPRefereeTimer.timerTick(');
    expect(html).not.toContain(
      'this.prepareSuddenDeath();\n                  }\n                } else if'
    );
  });
});
