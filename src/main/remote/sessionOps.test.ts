import { describe, it, expect, vi } from 'vitest';

vi.mock('../ipc/dbHandlers', () => ({ emitCompetitionEvent: vi.fn() }));

import { updateMatchScore, type SessionOpsContext } from './sessionOps';
import { createTrainingMatch } from './trainingSession';

function makeCtx(arenas: Map<string, { currentMatch: { id: string } | null }>) {
  return {
    arenas,
    db: { getMatch: () => null, updateMatch: vi.fn() },
    sessionMatchScores: new Map(),
    sessionMatches: [],
    assignMatchToArena: vi.fn(),
    loadSessionReferees: vi.fn(),
    setArenaCount: vi.fn(),
    updateArenaScore: vi.fn(),
  } as unknown as SessionOpsContext;
}

describe('updateMatchScore', () => {
  it("match d'entraînement (lobby) : met à jour l'arène sans erreur (#1500)", async () => {
    const match = createTrainingMatch();
    const ctx = makeCtx(new Map([['arena1', { currentMatch: { id: match.id } }]]));
    await expect(
      updateMatchScore(ctx, match.id, {
        matchId: match.id,
        scoreA: 3,
        scoreB: 1,
        status: 'in_progress',
        timestamp: new Date(),
        refereeId: 'test',
      })
    ).resolves.toBeUndefined();
    expect(ctx.updateArenaScore).toHaveBeenCalledWith('arena1', 3, 1);
    expect(ctx.sessionMatchScores.size).toBe(0);
  });

  it('match inconnu hors entraînement : erreur', async () => {
    const ctx = makeCtx(new Map());
    await expect(
      updateMatchScore(ctx, 'm-x', {
        matchId: 'm-x',
        scoreA: 0,
        scoreB: 0,
        status: 'in_progress',
        timestamp: new Date(),
        refereeId: 'test',
      })
    ).rejects.toThrow('Match non trouvé');
  });
});
