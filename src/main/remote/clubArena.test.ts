import { describe, it, expect, vi } from 'vitest';
import { clubBoutIdOf, clubBoutToArenaMatch, pushClubBout, releaseClubBout } from './clubArena';
import type { ClubBout, ClubMember } from '../../shared/types/club';
import type { RemoteScoreServer } from '../remoteScoreServer';

const bout = { id: 'b1', strip: 2, status: 'in_progress' } as ClubBout;
const anne = { id: 'a', firstName: 'Anne', lastName: 'MARTIN' } as ClubMember;
const paul = { id: 'p', firstName: 'Paul', lastName: 'DURAND' } as ClubMember;

const server = (arena: object | null, session = true) =>
  ({
    hasSession: () => session,
    getArena: vi.fn(() => arena),
    getAllArenas: vi.fn(() => (arena ? [arena] : [])),
    assignMatchToArena: vi.fn(),
  }) as unknown as RemoteScoreServer & { assignMatchToArena: ReturnType<typeof vi.fn> };

describe('saisie distante Mode Club (#1872)', () => {
  it('identifiant de match club', () => {
    expect(clubBoutIdOf('club:b1')).toBe('b1');
    expect(clubBoutIdOf('training-1')).toBeNull();
    expect(clubBoutIdOf(undefined)).toBeNull();
  });

  it('match d’arène aux noms des membres', () => {
    const m = clubBoutToArenaMatch(bout, anne, paul);
    expect(m).toMatchObject({
      id: 'club:b1',
      status: 'not_started',
      fencerA: { lastName: 'MARTIN', firstName: 'Anne' },
      fencerB: { lastName: 'DURAND' },
    });
  });

  it('envoi : arène libre, occupée, sans serveur', () => {
    const free = server({ id: 'arena2', status: 'ready', currentMatch: { id: 'training-1' } });
    expect(pushClubBout(free, bout, anne, paul)).toBe('ok');
    expect(free.assignMatchToArena).toHaveBeenCalledWith(
      'arena2',
      expect.objectContaining({ id: 'club:b1' })
    );
    const busy = server({
      id: 'arena2',
      status: 'in_progress',
      currentMatch: { id: 'club:other' },
    });
    expect(pushClubBout(busy, bout, anne, paul)).toBe('busy');
    expect(pushClubBout(server(null, false), bout, anne, paul)).toBe('no_server');
    expect(pushClubBout(server(null), bout, anne, paul)).toBe('no_arena');
  });

  it('libération : match d’entraînement libre remis si pas en cours', () => {
    const s = server({ id: 'arena2', status: 'ready', currentMatch: { id: 'club:b1' } });
    releaseClubBout(s, 'b1');
    expect(s.assignMatchToArena).toHaveBeenCalledWith(
      'arena2',
      expect.objectContaining({ poolId: '__training__' })
    );
  });
});
