// @vitest-environment jsdom
/**
 * Poules figées après le tirage du tableau, correction vérifiée (#1996)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { FencerStatus, Gender, type Fencer } from '../../../shared/types';
import {
  applyScoreToPool,
  buildMatchScores,
  buildPools,
  computeOverallRankingFor,
} from '../../../shared/utils/poolOrchestration';
import { buildTableauMatches } from '../../components/tableau/tableauCalculations';
import type { TableauMatch } from '../../components/tableau/tableauTypes';
import { usePoolCorrection } from './usePoolCorrection';

vi.mock('../useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

const fencer = (i: number): Fencer =>
  ({
    id: `f${i}`,
    ref: i,
    lastName: `NOM${i}`,
    firstName: 'P',
    gender: Gender.MALE,
    nationality: 'FRA',
    club: `Club${i}`,
    ranking: i,
    status: FencerStatus.CHECKED_IN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Fencer;

/** Une poule de 4, tous les matchs gagnés par le mieux classé 5-4 */
const playedPools = () => {
  const [pool] = buildPools([1, 2, 3, 4].map(fencer), {
    poolMaxScore: 5,
    poolCount: 1,
    newId: () => Math.random().toString(36),
  });
  let p = pool;
  p.matches.forEach((m, i) => {
    const aFirst = (m.fencerA!.ranking ?? 0) < (m.fencerB!.ranking ?? 0);
    p = applyScoreToPool(p, i, buildMatchScores(aFirst ? 5 : 4, aFirst ? 4 : 5), false);
  });
  return [p];
};

const setup = (opts: { withTableau: boolean; played?: boolean }) => {
  const pools = playedPools();
  const overallRanking = computeOverallRankingFor(pools, false);
  let tableauMatches: TableauMatch[] = opts.withTableau
    ? buildTableauMatches(overallRanking, 4, false, false)
    : [];
  if (opts.played) {
    tableauMatches = tableauMatches.map(m =>
      m.round === 4 && m.fencerA ? { ...m, scoreA: 15, scoreB: 3, winner: m.fencerA } : m
    );
  }
  const fns = {
    setTableauMatches: vi.fn(),
    setConsolationBrackets: vi.fn(),
    setFinalResults: vi.fn(),
    setCurrentPhase: vi.fn(),
    showToast: vi.fn(),
  };
  const hook = renderHook(() =>
    usePoolCorrection({
      pools,
      poolHistory: [],
      overallRanking,
      tableauMatches,
      consolationBrackets: [],
      isLaserSabre: false,
      t: (k: string) => k,
      ...fns,
    })
  );
  // Match entre f1 et f2 (n°1 et n°2), gagné 5-4 par f1
  const matchIndex = pools[0].matches.findIndex(
    m => [m.fencerA!.id, m.fencerB!.id].sort().join() === 'f1,f2'
  );
  const m = pools[0].matches[matchIndex];
  const flip = m.fencerA!.id === 'f1' ? { scoreA: 3, scoreB: 4 } : { scoreA: 4, scoreB: 3 };
  return { hook, fns, matchIndex, flip };
};

describe('usePoolCorrection (#1996)', () => {
  it('sans tableau : score appliqué directement, poules non figées', () => {
    const { hook, matchIndex, flip } = setup({ withTableau: false });
    const apply = vi.fn();
    act(() => hook.result.current.requestScore(0, matchIndex, flip, apply));
    expect(apply).toHaveBeenCalledWith();
    expect(hook.result.current.poolsFrozen).toBe(false);
    expect(hook.result.current.freezeFor('x')).toBeUndefined();
  });

  it('tableau tiré : poules figées, mode correction par poule', () => {
    const { hook } = setup({ withTableau: true });
    expect(hook.result.current.poolsFrozen).toBe(true);
    const freeze = hook.result.current.freezeFor('p')!;
    expect(freeze.correcting).toBe(false);
    act(() => freeze.onStartCorrection());
    expect(hook.result.current.freezeFor('p')!.correcting).toBe(true);
    expect(hook.result.current.freezeFor('autre')!.correcting).toBe(false);
  });

  it('tableau tiré : impact affiché, rien n’est appliqué avant la décision', () => {
    const { hook, matchIndex, flip } = setup({ withTableau: true });
    const apply = vi.fn();
    act(() => hook.result.current.requestScore(0, matchIndex, flip, apply));
    expect(apply).not.toHaveBeenCalled();
    render(<>{hook.result.current.poolCorrectionDialog}</>);
    expect(screen.getByText('poolCorrection.tableau_outdated')).toBeInTheDocument();
    expect(screen.getByTestId('pool-correction-rebuild')).toBeEnabled();
  });

  it('garder le tableau : score appliqué avec motif, tableau intact', () => {
    const { hook, fns, matchIndex, flip } = setup({ withTableau: true });
    const apply = vi.fn();
    act(() => hook.result.current.requestScore(0, matchIndex, flip, apply));
    render(<>{hook.result.current.poolCorrectionDialog}</>);
    act(() => fireEvent.click(screen.getByTestId('pool-correction-keep')));
    expect(apply).toHaveBeenCalledWith('poolCorrection.reason_keep');
    expect(fns.setTableauMatches).not.toHaveBeenCalled();
  });

  it('refaire le tableau : matchs joués → mot de confirmation exigé', () => {
    const { hook, fns, matchIndex, flip } = setup({ withTableau: true, played: true });
    const apply = vi.fn();
    act(() => hook.result.current.requestScore(0, matchIndex, flip, apply));
    render(<>{hook.result.current.poolCorrectionDialog}</>);
    const rebuild = screen.getByTestId('pool-correction-rebuild');
    expect(rebuild).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'poolCorrection.rebuild_word' },
    });
    expect(rebuild).toBeEnabled();
    act(() => fireEvent.click(rebuild));
    expect(apply).toHaveBeenCalledWith('poolCorrection.reason_rebuild');
    expect(fns.setTableauMatches).toHaveBeenCalledWith([]);
    expect(fns.setCurrentPhase).toHaveBeenCalledWith('tableau');
  });

  it('abandon / forfait / exclusion refusés une fois le tableau tiré', () => {
    const { hook, fns, matchIndex } = setup({ withTableau: true });
    const apply = vi.fn();
    act(() =>
      hook.result.current.requestScore(
        0,
        matchIndex,
        { scoreA: 0, scoreB: 5, specialStatus: 'abandon' },
        apply
      )
    );
    expect(apply).not.toHaveBeenCalled();
    expect(fns.showToast).toHaveBeenCalledWith('poolCorrection.special_refused', 'error');
  });
});
