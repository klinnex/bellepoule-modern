import { describe, it, expect } from 'vitest';
import { propagateWinners, TableauMatch } from './tableauTypes';

const F = (id: string) => ({ id, firstName: id, lastName: id }) as any;

function mk(
  round: number,
  pos: number,
  a: any,
  b: any,
  o: Partial<TableauMatch> = {}
): TableauMatch {
  const isBye = o.isBye ?? (!a || !b);
  return {
    id: `${round}-${pos}`,
    round,
    position: pos,
    fencerA: a,
    fencerB: b,
    scoreA: o.scoreA ?? null,
    scoreB: o.scoreB ?? null,
    winner: o.winner ?? (isBye ? a || b : null),
    isBye,
  };
}

describe('propagateWinners', () => {
  // Régression : un vainqueur doit affronter son adversaire réel même quand
  // matchList n'est pas ordonné par position (restauration DB / synchro tablette).
  it('apparie les feeders par position même si matchList est désordonné', () => {
    const dk = F('DK');
    const toad = F('Toad');
    const bowser = F('Bowser');

    const matches: TableauMatch[] = [
      mk(8, 1, toad, bowser),
      mk(8, 3, F('z'), F('w')),
      mk(8, 0, dk, null), // bye
      mk(8, 2, F('x'), F('y')),
      mk(4, 1, null, null, { isBye: false }),
      mk(4, 0, null, null, { isBye: false }),
      mk(2, 0, null, null, { isBye: false }),
    ];

    const m81 = matches.find(m => m.id === '8-1')!;
    m81.scoreA = 0;
    m81.scoreB = 15;
    m81.winner = bowser;

    propagateWinners(matches, 8);

    const semi = matches.find(m => m.id === '4-0')!;
    expect(semi.fencerA?.id).toBe('DK');
    expect(semi.fencerB?.id).toBe('Bowser');
  });
});

describe('propagateWinners - taille périmée/invalide', () => {
  const mk16 = (): TableauMatch[] => {
    const m: TableauMatch[] = [];
    for (let p = 0; p < 8; p++) m.push(mk(16, p, F('a' + p), F('b' + p)));
    for (let p = 0; p < 4; p++) m.push(mk(8, p, null, null, { isBye: false }));
    for (let p = 0; p < 2; p++) m.push(mk(4, p, null, null, { isBye: false }));
    m.push(mk(2, 0, null, null, { isBye: false }));
    return m;
  };

  // Régression : un score saisi alors que tableauSize n'est pas encore recalculé
  // (restauration de session) passait size=0 → propagation no-op → vainqueur perdu.
  it('propage même si size vaut 0', () => {
    const matches = mk16();
    const m0 = matches.find(x => x.id === '16-0')!;
    m0.scoreA = 15;
    m0.scoreB = 3;
    m0.winner = m0.fencerA;
    const m1 = matches.find(x => x.id === '16-1')!;
    m1.scoreA = 3;
    m1.scoreB = 15;
    m1.winner = m1.fencerB;

    propagateWinners(matches, 0);

    const qf0 = matches.find(x => x.id === '8-0')!;
    expect(qf0.fencerA?.id).toBe('a0');
    expect(qf0.fencerB?.id).toBe('b1');
  });

  it('propage le vainqueur des 8es vers les quarts (size correct)', () => {
    const matches = mk16();
    const m1 = matches.find(x => x.id === '16-1')!;
    m1.scoreA = 3;
    m1.scoreB = 15;
    m1.winner = m1.fencerB;
    propagateWinners(matches, 16);
    expect(matches.find(x => x.id === '8-0')!.fencerB?.id).toBe('b1');
  });
});
