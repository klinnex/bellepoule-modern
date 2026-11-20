import { describe, it, expect } from 'vitest';
import { buildTrainingQrTargets, type TrainingQrLabels } from './TrainingPrintModal';

const labels: TrainingQrLabels = {
  kiosk: 'Kiosk',
  lobby: 'Lobby',
  referee: 'Arbitre',
  display: 'Affichage',
  strip: n => `Piste ${n}`,
};
const all = { kiosk: true, referees: true, displays: true, lobby: true };

describe('buildTrainingQrTargets (#1500)', () => {
  it('liste kiosk, arbitres, affichages puis lobby', () => {
    const urls = buildTrainingQrTargets('http://h:8066', 2, all, labels).map(c => c.url);
    expect(urls).toEqual([
      'http://h:8066/kiosk',
      'http://h:8066/arene1/arbitre',
      'http://h:8066/arene2/arbitre',
      'http://h:8066/arene1',
      'http://h:8066/arene2',
      'http://h:8066/entrainement-lobby',
    ]);
  });

  it('respecte la sélection', () => {
    const sel = { ...all, kiosk: false, referees: false, displays: false };
    const t = buildTrainingQrTargets('http://h', 3, sel, labels);
    expect(t).toHaveLength(1);
    expect(t[0].title).toBe('Lobby');
  });

  it('renvoie vide si rien de coché', () => {
    const none = { kiosk: false, referees: false, displays: false, lobby: false };
    expect(buildTrainingQrTargets('http://h', 3, none, labels)).toEqual([]);
  });
});
