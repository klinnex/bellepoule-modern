// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildBlackCardEntries } from './blackCardReport';
import { FencerStatus, MatchStatus, type Fencer, type Pool } from '../../shared/types';
import type { BpmClient } from '../../shared/api/client';

const f = (id: string, last: string, excluded = false) =>
  ({
    id,
    lastName: last,
    firstName: 'X',
    status: excluded ? FencerStatus.EXCLUDED : FencerStatus.CHECKED_IN,
    exclusionReason: excluded ? 'black_card' : null,
  }) as unknown as Fencer;

describe('buildBlackCardEntries (#1829)', () => {
  it('match de la sanction : celui qui porte le carton noir en base', async () => {
    const a = f('a', 'Alpha', true);
    const b = f('b', 'Bravo');
    const c = f('c', 'Charlie');
    const match = (id: string, x: Fencer, y: Fencer, sx: number, sy: number) => ({
      id,
      fencerA: x,
      fencerB: y,
      scoreA: { value: sx },
      scoreB: { value: sy },
      status: MatchStatus.FINISHED,
    });
    const pool = {
      number: 3,
      strip: 7,
      matches: [match('m1', a, b, 5, 2), match('m2', c, a, 4, 1)],
    } as unknown as Pool;
    // Contrat d'API (#1981) : requête getMatchCards simulée
    const client = {
      query: vi.fn(async (_name: string, { matchId }: { matchId: string }) =>
        matchId === 'm2'
          ? [{ fencerId: 'a', cardType: 'black', timestamp: '2026-11-15T10:00:00Z' }]
          : []
      ),
      call: vi.fn(),
      subscribe: vi.fn(),
    } as unknown as BpmClient;
    const [entry] = await buildBlackCardEntries([a, b, c], [pool], [], client);
    expect(client.query).toHaveBeenCalledWith('getMatchCards', { matchId: 'm1' });
    expect(entry).toMatchObject({
      fencer: { lastName: 'Alpha' },
      phase: 'Poule 3',
      opponent: 'CHARLIE X',
      score: '1 – 4',
      strip: 7,
    });
    expect(entry.at?.toISOString()).toBe('2026-11-15T10:00:00.000Z');
  });

  it('aucun exclu : rien', async () => {
    expect(await buildBlackCardEntries([f('a', 'Alpha')])).toEqual([]);
  });
});
