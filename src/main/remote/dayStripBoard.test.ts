/**
 * Pistes d'une journée en temps réel (#1878) : occupation, propositions selon la réservation,
 * affectation en un clic et automatique. Serveurs d'épreuve simulés.
 */
import { describe, it, expect } from 'vitest';
import { assignStrip, autoAssignStrips, buildStripBoard, type DayEvent } from './dayStripBoard';
import type { WaitingWork } from './stripHandover';
import { DEFAULT_STRIP_RULE } from '../../shared/utils/stripRules';
import type { ArenaMatch } from '../../shared/types/remote';

function fakeEvent(competitionId: string, busy: number[], waiting: WaitingWork[]) {
  const occupied = new Set(busy);
  const moves: { work: WaitingWork; strip: number }[] = [];
  let queue = [...waiting];
  const event: DayEvent = {
    competitionId,
    title: competitionId.toUpperCase(),
    server: {
      hasSession: () => true,
      hasArenaAssignment: id => occupied.has(Number(id.replace('arena', ''))),
      getArena: id => (Number(id.replace('arena', '')) <= 4 ? {} : null),
      getWaitingWork: () => queue,
      moveWorkToArena: (work, strip) => {
        moves.push({ work, strip });
        occupied.add(strip);
        queue = queue.filter(w => w !== work);
        return true;
      },
    },
  };
  return { event, moves };
}

const deMatch = (id: string, size: number): WaitingWork => ({
  kind: 'match',
  matchId: id,
  fromArena: 1,
  fencers: 'A – B',
  match: { id, round: size, position: 0 } as unknown as ArenaMatch,
});
const pool = (id: string, n: number, fromArena: number | null): WaitingWork => ({
  kind: 'pool',
  poolId: id,
  poolNumber: n,
  fromArena,
});
const coords = (_c: string, m: ArenaMatch) => {
  const r = (m as unknown as { round: number }).round;
  return { size: r, number: 1 };
};

describe('dayStripBoard — pistes libérées d’une journée (#1878)', () => {
  it('occupation et propositions : une piste libre reçoit le travail en attente', () => {
    const fleuret = fakeEvent('fleuret', [1, 2], [pool('p3', 3, null)]);
    const epee = fakeEvent('epee', [3], [deMatch('16-1', 16)]);
    const board = buildStripBoard(4, {}, false, [fleuret.event, epee.event], coords);
    expect(board.live).toBe(true);
    expect(board.strips.map(s => s.competitionId)).toEqual(['fleuret', 'fleuret', 'epee', null]);
    expect(board.strips[0].candidates).toEqual([]);
    expect(board.strips[3].candidates.map(c => c.key)).toEqual([
      'fleuret|pool:p3',
      'epee|match:16-1',
    ]);
    expect(board.strips[3].candidates[1]).toMatchObject({ tableauSize: 16, fencers: 'A – B' });
  });

  it('réservation : piste de finale réservée au tableau de 8 d’une épreuve', () => {
    const epee = fakeEvent('epee', [], [deMatch('16-1', 16), deMatch('8-1', 8)]);
    const fleuret = fakeEvent('fleuret', [], [deMatch('8-2', 8)]);
    const rules = {
      4: { ...DEFAULT_STRIP_RULE, competitions: ['epee'], pools: false, tableauMax: 8 },
    };
    const board = buildStripBoard(4, rules, false, [epee.event, fleuret.event], coords);
    expect(board.strips[3].candidates.map(c => c.key)).toEqual(['epee|match:8-1']);
    // Le clic ne contourne pas la réservation
    expect(assignStrip(4, 'epee|match:16-1', rules[4], [epee.event, fleuret.event], coords)).toBe(
      false
    );
    expect(assignStrip(4, 'epee|match:8-1', rules[4], [epee.event, fleuret.event], coords)).toBe(
      true
    );
    expect(epee.moves).toEqual([{ work: expect.objectContaining({ matchId: '8-1' }), strip: 4 }]);
  });

  it('piste occupée ou travail inconnu : refus', () => {
    const e = fakeEvent('e', [2], [pool('p', 1, null)]);
    expect(assignStrip(2, 'e|pool:p', undefined, [e.event], coords)).toBe(false);
    expect(assignStrip(3, 'e|pool:zz', undefined, [e.event], coords)).toBe(false);
    expect(assignStrip(0, 'e|pool:p', undefined, [e.event], coords)).toBe(false);
    expect(e.moves).toEqual([]);
  });

  it('affectation automatique : une proposition par piste libre, jamais deux fois la même', () => {
    const e = fakeEvent('e', [1], [pool('p2', 2, null), pool('p3', 3, null)]);
    const done = autoAssignStrips(4, {}, [e.event], coords);
    expect(done).toEqual([
      { strip: 2, key: 'e|pool:p2' },
      { strip: 3, key: 'e|pool:p3' },
    ]);
    expect(autoAssignStrips(4, {}, [e.event], coords)).toEqual([]);
  });

  it('aucune saisie distante ouverte : tableau hors ligne, sans proposition', () => {
    const e = fakeEvent('e', [], [pool('p', 1, null)]);
    e.event.server.hasSession = () => false;
    const board = buildStripBoard(2, {}, true, [e.event], coords);
    expect(board).toMatchObject({ live: false, autoAssign: true });
    expect(board.strips.every(s => s.candidates.length === 0 && !s.competitionId)).toBe(true);
  });
});
