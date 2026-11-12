// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useMemo, useState } from 'react';
import type { Pool } from '../../shared/types';
import { useCompetitionRestore } from './useCompetitionRestore';

vi.mock('./useCompetitionSession', () => ({
  useCompetitionSession: () => ({ isLoaded: true, restoredState: null }),
  phaseFromNumber: () => null,
}));

type Api = { count: number; setCount: (n: number | ((c: number) => number)) => void };

/** Harnais : état réel pour le nombre de pistes et la première piste, nombre de poules variable */
function Harness({
  poolCount,
  start,
  onReady,
}: {
  poolCount: number;
  start: number;
  onReady: (api: Api) => void;
}) {
  const [remoteArenaCount, setRemoteArenaCount] = useState(1);
  const pools = useMemo(
    () =>
      Array.from(
        { length: poolCount },
        (_, i) => ({ id: `p${i}`, number: i + 1 }) as unknown as Pool
      ),
    [poolCount]
  );
  const noop = vi.fn();
  useCompetitionRestore({
    competitionId: 'c1',
    currentPhase: 'pools',
    setCurrentPhase: noop,
    currentPoolRound: 1,
    setCurrentPoolRound: noop,
    pools,
    setPools: noop,
    poolHistory: [],
    setPoolHistory: noop,
    appelHistory: [],
    setAppelHistory: noop,
    overallRanking: [],
    setOverallRanking: noop,
    tableauMatches: [],
    setTableauMatches: noop,
    finalResults: [],
    setFinalResults: noop,
    consolationBrackets: [],
    setConsolationBrackets: noop,
    skipPoolPhase: false,
    setSkipPoolPhase: noop,
    setRankingValidated: noop,
    remoteArenaCount,
    setRemoteArenaCount,
    remoteStripStart: start,
    setRemoteStripStart: noop,
    isRapieres: false,
    rapieresState: undefined,
    setRapieresState: noop,
    minFencersPerPool: 3,
    maxFencersPerPool: 6,
    setMinFencersPerPool: noop,
    setMaxFencersPerPool: noop,
    poolsLaunched: true,
    setPoolsLaunched: noop,
  } as unknown as Parameters<typeof useCompetitionRestore>[0]);
  onReady({ count: remoteArenaCount, setCount: setRemoteArenaCount });
  return null;
}

function mount(poolCount: number, start = 1) {
  let api: Api | null = null;
  const onReady = (a: Api) => {
    api = a;
  };
  const view = render(<Harness poolCount={poolCount} start={start} onReady={onReady} />);
  const current = () => (api as Api | null)?.count;
  const setCount = (n: number) => act(() => (api as Api).setCount(n));
  const rerender = (nextPools: number, nextStart = start) =>
    act(() => {
      view.rerender(<Harness poolCount={nextPools} start={nextStart} onReady={onReady} />);
    });
  return { current, setCount, rerender };
}

describe('useCompetitionRestore – nombre de pistes (#1653)', () => {
  it('par défaut : une piste par poule à partir de la première piste', () => {
    const h = mount(9, 4);
    expect(h.current()).toBe(12);
  });

  it('conserve un nombre de pistes choisi au-delà du nombre de poules (10 pistes pour 9 poules)', () => {
    const h = mount(9, 1);
    h.setCount(10);
    expect(h.current()).toBe(10);
  });

  it('conserve la fin de plage choisie (piste 4 à 14 pour 9 poules)', () => {
    const h = mount(9, 4);
    h.setCount(14);
    expect(h.current()).toBe(14);
  });

  it('clamp au nombre de poules quand les poules rétrécissent', () => {
    const h = mount(9, 4);
    h.setCount(14);
    h.rerender(6, 4);
    expect(h.current()).toBe(9);
  });

  it('ne modifie pas la fin de plage quand seule la première piste change', () => {
    const h = mount(9, 1);
    h.setCount(10);
    h.rerender(9, 3);
    expect(h.current()).toBe(10);
  });
});
