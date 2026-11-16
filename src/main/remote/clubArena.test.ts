import { describe, it, expect, vi } from 'vitest';
import {
  clubBoutIdOf,
  clubBoutToArenaMatch,
  identifyClubBout,
  pushClubBout,
  releaseClubBout,
  setLinkedClubSession,
  type ClubIdentifyDeps,
} from './clubArena';
import type { ClubBout, ClubMember, ClubSession } from '../../shared/types/club';
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

describe('cartes scannées sur la tablette arbitre (#1872)', () => {
  const session = { id: 's1', clubId: 'c1', status: 'open', attendeeIds: ['a'] } as ClubSession;
  const cards: Record<string, ClubMember> = { AAAAAAAAAA: anne, BBBBBBBBBB: paul };
  const deps = (arena: object | null = { id: 'arena2', status: 'ready', currentMatch: null }) => {
    const club = {
      getSession: vi.fn((id: string) => (id === 's1' ? session : null)),
      findMemberByCardCode: vi.fn((code: string) => cards[code] ?? null),
      setAttendance: vi.fn(),
      createBout: vi.fn(() => ({ id: 'new', strip: 2 }) as ClubBout),
      startBout: vi.fn(() => ({ id: 'new', strip: 2, status: 'in_progress' }) as ClubBout),
      listBouts: vi.fn(() => [{ id: 'old', strip: 2, status: 'pending' } as ClubBout]),
      cancelBout: vi.fn(),
    };
    return {
      club,
      getArena: vi.fn(() => arena),
      assignMatchToArena: vi.fn(),
    } as unknown as ClubIdentifyDeps & {
      club: Record<string, ReturnType<typeof vi.fn>>;
      assignMatchToArena: ReturnType<typeof vi.fn>;
    };
  };

  it('sans séance reliée : refusé', () => {
    setLinkedClubSession(null);
    expect(identifyClubBout(deps(), 2, 'AAAAAAAAAA', 'BBBBBBBBBB')).toEqual({
      ok: false,
      error: 'no_session',
    });
  });

  it('deux cartes : présents pointés, combat enregistré et placé sur la piste', () => {
    setLinkedClubSession('s1');
    const d = deps();
    const r = identifyClubBout(d, 2, 'AAAAAAAAAA', 'BBBBBBBBBB');
    expect(r).toEqual({ ok: true, recorded: true, nameA: 'MARTIN Anne', nameB: 'DURAND Paul' });
    expect(d.club.setAttendance).toHaveBeenCalledTimes(1);
    expect(d.club.setAttendance).toHaveBeenCalledWith('s1', 'p', true);
    // Combat prévu sur la piste remplacé
    expect(d.club.cancelBout).toHaveBeenCalledWith('old');
    expect(d.club.createBout).toHaveBeenCalledWith(
      expect.objectContaining({ memberAId: 'a', memberBId: 'p', strip: 2, entryMode: 'referee' })
    );
    expect(d.assignMatchToArena).toHaveBeenCalledWith(
      'arena2',
      expect.objectContaining({ id: 'club:new' })
    );
  });

  it('une carte passée : combat libre non enregistré, nom connu affiché', () => {
    setLinkedClubSession('s1');
    const d = deps();
    const r = identifyClubBout(d, 2, null, 'BBBBBBBBBB');
    expect(r).toMatchObject({ ok: true, recorded: false, nameB: 'DURAND Paul' });
    expect(d.club.createBout).not.toHaveBeenCalled();
    expect(d.assignMatchToArena).toHaveBeenCalledWith(
      'arena2',
      expect.objectContaining({
        poolId: '__training__',
        fencerB: expect.objectContaining({ lastName: 'DURAND' }),
      })
    );
  });

  it('erreurs : carte inconnue, même tireur, piste occupée ou absente', () => {
    setLinkedClubSession('s1');
    expect(identifyClubBout(deps(), 2, 'CCCCCCCCCC', null)).toEqual({
      ok: false,
      error: 'unknown_card',
      side: 'A',
    });
    expect(identifyClubBout(deps(), 2, 'AAAAAAAAAA', 'AAAAAAAAAA')).toMatchObject({
      error: 'same_member',
    });
    expect(
      identifyClubBout(deps({ id: 'arena2', status: 'in_progress' }), 2, 'AAAAAAAAAA', null)
    ).toMatchObject({ error: 'busy' });
    expect(identifyClubBout(deps(null), 2, 'AAAAAAAAAA', null)).toMatchObject({
      error: 'no_arena',
    });
    setLinkedClubSession(null);
  });
});
