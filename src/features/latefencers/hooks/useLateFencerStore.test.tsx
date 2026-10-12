// @vitest-environment jsdom
/**
 * Tests unitaires - useLateFencerStore
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useLateFencerStore, DEFAULT_LATE_CONFIG } from './useLateFencerStore';
import { Fencer, Gender, FencerStatus } from '../../../shared/types';

const fencer = (id: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: 'L' + id,
  firstName: 'F',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000);
const get = () => useLateFencerStore.getState();

beforeEach(() => {
  useLateFencerStore.setState({
    lateFencers: [],
    config: { ...DEFAULT_LATE_CONFIG },
    isMonitoring: false,
  });
});

describe('registerFencer / markAsPresent', () => {
  it('enregistre un tireur en attente', () => {
    get().registerFencer(fencer('1'), minutesAgo(0));
    expect(get().lateFencers).toHaveLength(1);
    expect(get().lateFencers[0].status).toBe('waiting');
  });

  it('remplace l’entrée existante (pas de doublon)', () => {
    get().registerFencer(fencer('1'), minutesAgo(0));
    get().registerFencer(fencer('1'), minutesAgo(5));
    expect(get().lateFencers).toHaveLength(1);
  });

  it('markAsPresent retire le tireur', () => {
    get().registerFencer(fencer('1'), minutesAgo(0));
    get().markAsPresent('1');
    expect(get().lateFencers).toHaveLength(0);
  });
});

describe('updateDelays - statuts selon les seuils', () => {
  it('passe en "warned" au-delà du seuil d’avertissement', () => {
    get().registerFencer(fencer('1'), minutesAgo(6));
    get().updateDelays();
    expect(get().lateFencers[0].status).toBe('warned');
  });

  it('passe en "critical" sans auto-forfait', () => {
    useLateFencerStore.setState({ config: { ...DEFAULT_LATE_CONFIG, autoForfeit: false } });
    get().registerFencer(fencer('1'), minutesAgo(16));
    get().updateDelays();
    expect(get().lateFencers[0].status).toBe('critical');
  });

  it('passe en "forfeit" avec auto-forfait au-delà du seuil', () => {
    get().registerFencer(fencer('1'), minutesAgo(16));
    get().updateDelays();
    expect(get().lateFencers[0].status).toBe('forfeit');
    expect(get().lateFencers[0].delayMinutes).toBeGreaterThanOrEqual(15);
  });
});

describe('sélecteurs', () => {
  it('getLateFencers / getCriticalFencers filtrent par délai', () => {
    get().registerFencer(fencer('1'), minutesAgo(6)); // warned
    get().registerFencer(fencer('2'), minutesAgo(12)); // critical
    get().updateDelays();
    expect(get().getLateFencers().length).toBe(2); // >=5
    expect(get().getCriticalFencers().length).toBe(1); // >=10
  });
});

describe('sendWarning / getForfeitCandidates / getFencerStatus', () => {
  it('sendWarning incrémente le compteur d’avertissements', () => {
    get().registerFencer(fencer('1'), minutesAgo(0));
    get().sendWarning('1');
    get().sendWarning('1');
    expect(get().getFencerStatus('1')?.warningCount).toBe(2);
  });

  it('getForfeitCandidates filtre les tireurs au-delà du seuil de forfait', () => {
    get().registerFencer(fencer('1'), minutesAgo(16));
    get().registerFencer(fencer('2'), minutesAgo(6));
    get().updateDelays();
    const candidates = get().getForfeitCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].fencerId).toBe('1');
  });

  it('getFencerStatus renvoie undefined pour un tireur inconnu', () => {
    expect(get().getFencerStatus('inconnu')).toBeUndefined();
  });
});

describe('updateConfig', () => {
  it('fusionne la config partielle sans écraser le reste', () => {
    get().updateConfig({ warningThresholdMinutes: 2 });
    expect(get().config.warningThresholdMinutes).toBe(2);
    expect(get().config.criticalThresholdMinutes).toBe(
      DEFAULT_LATE_CONFIG.criticalThresholdMinutes
    );
  });
});

describe('startMonitoring / stopMonitoring', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('active isMonitoring et rafraîchit les délais périodiquement', () => {
    get().registerFencer(fencer('1'), minutesAgo(6));
    get().startMonitoring();
    expect(get().isMonitoring).toBe(true);

    vi.advanceTimersByTime(60000);
    expect(get().lateFencers[0].status).toBe('warned');

    get().stopMonitoring();
    expect(get().isMonitoring).toBe(false);
  });
});

describe('markAsForfeit / getLateStats', () => {
  it('markAsForfeit force le statut forfeit', () => {
    get().registerFencer(fencer('1'), minutesAgo(0));
    get().markAsForfeit('1');
    expect(get().getFencerStatus('1')?.status).toBe('forfeit');
  });

  it('getLateStats agrège les compteurs', () => {
    get().registerFencer(fencer('1'), minutesAgo(6));
    get().registerFencer(fencer('2'), minutesAgo(16));
    get().updateDelays();
    const stats = get().getLateStats();
    expect(stats.totalLate).toBe(2);
    expect(stats.forfeit).toBe(1);
    expect(stats.averageDelay).toBeGreaterThan(0);
  });
});
