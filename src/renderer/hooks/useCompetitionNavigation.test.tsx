// @vitest-environment jsdom
/**
 * Passage au tableau depuis le classement (#1996) : un tableau déjà tiré n'est jamais refait.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCompetitionNavigation } from './useCompetitionNavigation';
import type { TableauMatch } from '../../shared/domain/tableau/tableauTypes';
import React from 'react';
import { BpmClientProvider } from '../api/BpmClientContext';
import type { BpmClient } from '../../shared/api/client';

vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock('../components/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock('./useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const setup = (
  tableauMatches: TableauMatch[],
  rankingChanged = false,
  thirdPlaceMatch = false,
  client?: BpmClient
) => {
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
  const { result } = renderHook(
    () =>
      useCompetitionNavigation(params as unknown as Parameters<typeof useCompetitionNavigation>[0]),
    client
      ? {
          wrapper: ({ children }: { children: React.ReactNode }) =>
            React.createElement(BpmClientProvider, { client, children }),
        }
      : undefined
  );
  return {
    ...fns,
    params,
    onUpdate,
    go: result.current.handleGoToTableau,
    nextRound: result.current.handleNextPoolRound,
  };
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

describe('handleNextPoolRound par le moteur (docs/adr/0017)', () => {
  it('simulation pour la confirmation, puis closePoolRound ; écran vers l’appel', async () => {
    const call = vi.fn(async (_name: string, input: { dryRun?: boolean }) =>
      input.dryRun
        ? { dryRun: true, round: 1, nextRound: 2, qualified: 8, eliminated: 4 }
        : { dryRun: false, round: 1, nextRound: 2, qualified: 8, eliminated: 4 }
    );
    confirmMock.mockResolvedValueOnce(true);
    const s = setup([], false, false, { call } as unknown as BpmClient);
    await s.nextRound();
    expect(confirmMock).toHaveBeenCalledWith('pools.next_round_confirm');
    expect(call).toHaveBeenNthCalledWith(1, 'closePoolRound', { competitionId: 'c', dryRun: true });
    expect(call).toHaveBeenNthCalledWith(2, 'closePoolRound', { competitionId: 'c' });
    expect(s.setCurrentPhase).toHaveBeenCalledWith('checkin');
    // Rien d'écrit par l'écran : le moteur a éliminé et archivé le tour
    expect(s.params.updateFencers).not.toHaveBeenCalled();
    expect(s.params.nextPoolRound).not.toHaveBeenCalled();
  });

  it('confirmation refusée : aucune clôture', async () => {
    const call = vi.fn(async () => ({ nextRound: 2, qualified: 8, eliminated: 4 }));
    confirmMock.mockResolvedValueOnce(false);
    const s = setup([], false, false, { call } as unknown as BpmClient);
    await s.nextRound();
    expect(call).toHaveBeenCalledTimes(1);
    expect(s.setCurrentPhase).not.toHaveBeenCalled();
  });
});
