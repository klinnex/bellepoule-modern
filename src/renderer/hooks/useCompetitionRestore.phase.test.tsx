// @vitest-environment jsdom
/**
 * Onglet affiché (docs/adr/0017) : appliqué au chargement de l'épreuve, jamais par une
 * relecture après une commande du moteur (l'onglet est un état d'interface du poste).
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCompetitionRestore } from './useCompetitionRestore';

const { state } = vi.hoisted(() => ({ state: { restored: null as unknown } }));
vi.mock('./useCompetitionSession', () => ({
  useCompetitionSession: () => ({ isLoaded: true, restoredState: state.restored }),
  phaseFromNumber: (n: number) => (n === 5 ? 'tableau' : n === 2 ? 'pools' : undefined),
  phaseNumber: (p: string) => ({ checkin: 0, pools: 2, ranking: 3, tableau: 5 })[p] ?? 0,
}));

function run(restored: Record<string, unknown>) {
  state.restored = { pools: [{ id: 'p1' }], poolHistory: [], ...restored };
  const setCurrentPhase = vi.fn();
  const noop = vi.fn();
  renderHook(() =>
    useCompetitionRestore({
      competitionId: 'c1',
      currentPhase: 'tableau',
      setCurrentPhase,
      currentPoolRound: 1,
      setCurrentPoolRound: noop,
      pools: [{ id: 'p1', number: 1 }],
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
      remoteArenaCount: 1,
      setRemoteArenaCount: noop,
      remoteStripStart: 1,
      setRemoteStripStart: noop,
      isRapieres: false,
      rapieresState: undefined,
      setRapieresState: noop,
      minFencersPerPool: 5,
      maxFencersPerPool: 7,
      setMinFencersPerPool: noop,
      setMaxFencersPerPool: noop,
      poolsLaunched: true,
      setPoolsLaunched: noop,
    } as unknown as Parameters<typeof useCompetitionRestore>[0])
  );
  return setCurrentPhase;
}

describe('onglet restauré (docs/adr/0017)', () => {
  it('chargement de l’épreuve : onglet de la session', () => {
    expect(run({ currentPhase: 2 })).toHaveBeenCalledWith('pools');
  });

  it('relecture après une commande : onglet du poste conservé', () => {
    expect(run({ currentPhase: 2, reloaded: true })).not.toHaveBeenCalled();
  });

  it('chargement : onglet du poste s’il ne devance pas la phase de l’épreuve', () => {
    localStorage.setItem('bellepoule-ui-c1', JSON.stringify({ tab: 'checkin' }));
    expect(run({ currentPhase: 5 })).toHaveBeenCalledWith('checkin');
    localStorage.setItem('bellepoule-ui-c1', JSON.stringify({ tab: 'tableau' }));
    expect(run({ currentPhase: 2 })).toHaveBeenCalledWith('pools');
    localStorage.clear();
  });
});
