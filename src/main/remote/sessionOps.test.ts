/**
 * updateMatchScore (#1500) : match d'entraînement porté par l'arène seule.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../ipc/dbHandlers', () => ({ emitCompetitionEvent: vi.fn() }));

import { updateMatchScore, type SessionOpsContext } from './sessionOps';
import type { RemoteScoreUpdate } from '../../shared/types/remote';

const update = { matchId: 'tm1', scoreA: 3, scoreB: 1, status: 'in_progress' } as RemoteScoreUpdate;

const ctx = (arenaMatchId: string | null) => {
  const updateArenaScore = vi.fn();
  const c = {
    db: { getMatch: () => null },
    sessionMatches: [],
    sessionMatchScores: new Map(),
    arenas: new Map([['arena1', { currentMatch: arenaMatchId ? { id: arenaMatchId } : null }]]),
    updateArenaScore,
  } as unknown as SessionOpsContext;
  return { c, updateArenaScore };
};

describe('updateMatchScore', () => {
  it('match d’entraînement sur une arène : score appliqué, pas d’erreur', async () => {
    const { c, updateArenaScore } = ctx('tm1');
    await expect(updateMatchScore(c, 'tm1', update)).resolves.toBeUndefined();
    expect(updateArenaScore).toHaveBeenCalledWith('arena1', 3, 1);
  });
  it('match introuvable partout : erreur « Match non trouvé »', async () => {
    const { c } = ctx(null);
    await expect(updateMatchScore(c, 'tm1', update)).rejects.toThrow('Match non trouvé');
  });
});
