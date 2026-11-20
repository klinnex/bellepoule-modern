// @vitest-environment jsdom
/**
 * Passage au tableau depuis le classement (#1996) : un tableau déjà tiré n'est jamais refait.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCompetitionNavigation } from './useCompetitionNavigation';
import type { TableauMatch } from '../components/tableau/tableauTypes';

vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../components/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const setup = (tableauMatches: TableauMatch[], rankingChanged = false, thirdPlaceMatch = false) => {
  const fns = {
    setCurrentPhase: vi.fn(),
    setTableauMatches: vi.fn(),
    setConsolationBrackets: vi.fn(),
    setRankingChanged: vi.fn(),
  };
  const onUpdate = vi.fn();
  const params = {
    competition: { id: 'c', settings: {} },
    onUpdate,
    fencers: [],
    updateFencers: vi.fn(),
    getCheckedInFencers: () => [],
    pools: [],
    setPools: vi.fn(),
    overallRanking: [],
    setOverallRanking: vi.fn(),
    computeOverallRanking: vi.fn(() => []),
    nextPoolRound: vi.fn(),
    currentPoolRound: 1,
    currentAppelFencers: [],
    poolRoundQualifiers: undefined,
    customFormula: undefined,
    hasDirectElimination: true,
    thirdPlaceMatch,
    playAllPositions: false,
    isRapieres: false,
    updateRapieres: vi.fn(),
    setShowRapieresTableauDialog: vi.fn(),
    setPoolsLaunched: vi.fn(),
    setViewedPoolRound: vi.fn(),
    setRankingValidated: vi.fn(),
    setSkipPoolPhase: vi.fn(),
    rankingChanged,
    tableauMatches,
    consolationBrackets: [],
    finalResults: [],
    setFinalResults: vi.fn(),
    activeSplitGroup: null,
    setActiveSplitGroup: vi.fn(),
    splitTableauStates: {},
    setSplitTableauStates: vi.fn(),
    ...fns,
  };
  const { result } = renderHook(() =>
    useCompetitionNavigation(params as unknown as Parameters<typeof useCompetitionNavigation>[0])
  );
  return { ...fns, onUpdate, go: result.current.handleGoToTableau };
};

describe('handleGoToTableau (#1996)', () => {
  it('tableau déjà tiré : retour au tableau, rien n’est effacé', () => {
    const s = setup([{ id: '16-0' } as TableauMatch], true);
    s.go();
    expect(s.setCurrentPhase).toHaveBeenCalledWith('tableau');
    expect(s.setTableauMatches).not.toHaveBeenCalled();
    expect(s.setConsolationBrackets).not.toHaveBeenCalled();
    expect(s.onUpdate).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'pas encore de tableau : petite finale reprise de la formule, sans question (#2013) — %s',
    thirdPlace => {
      const s = setup([], false, thirdPlace);
      s.go();
      expect(s.onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ thirdPlaceMatch: thirdPlace }),
        })
      );
      expect(s.setCurrentPhase).toHaveBeenCalledWith('tableau');
    }
  );
});
