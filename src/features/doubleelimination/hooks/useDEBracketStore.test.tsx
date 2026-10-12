// @vitest-environment jsdom
/**
 * Tests unitaires - useDEBracketStore (double élimination)
 * BellePoule Modern
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useDEBracketStore, DEBracket } from './useDEBracketStore';

const get = () => useDEBracketStore.getState();
const setState = useDEBracketStore.setState;

beforeEach(() => get().clearBracket());

function makeBracket(overrides: Partial<DEBracket> = {}): DEBracket {
  return {
    id: 'de-test',
    competitionId: 'c1',
    winnersBracket: [],
    losersBracket: [],
    final: [],
    size: 4,
    isComplete: false,
    resetRequired: false,
    ...overrides,
  };
}

describe('generateBracket', () => {
  it('crée un tableau winners + finale pour 8 tireurs', () => {
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const bracket = get().generateBracket('c1', ids);
    expect(bracket.size).toBe(8);
    expect(bracket.competitionId).toBe('c1');
    expect(bracket.final).toHaveLength(1);
    // 1er tour winners = 4 matchs
    const round1 = bracket.winnersBracket.filter(n => n.round === 1);
    expect(round1).toHaveLength(4);
    // les tireurs sont assignés au 1er tour
    expect(round1[0].fencerAId).toBe('1');
    expect(round1[0].fencerBId).toBe('2');
    // seeds attribués
    expect(get().fencers).toHaveLength(8);
    expect(get().fencers[0].seed).toBe(1);
  });

  it('arrondit la taille à la puissance de 2 supérieure', () => {
    const bracket = get().generateBracket('c1', ['1', '2', '3', '4', '5']);
    expect(bracket.size).toBe(8);
  });
});

describe('updateMatchResult', () => {
  it('enregistre le score, le vainqueur et marque le match terminé', () => {
    const bracket = get().generateBracket('c1', ['1', '2', '3', '4']);
    const node = bracket.winnersBracket.find(n => n.round === 1)!;
    get().updateMatchResult(node.id, 15, 8);
    const updated = get().bracket!.winnersBracket.find(n => n.id === node.id)!;
    expect(updated.scoreA).toBe(15);
    expect(updated.scoreB).toBe(8);
    expect(updated.isComplete).toBe(true);
    expect(updated.winnerId).toBe(node.fencerAId);
  });
});

describe('advanceWinner', () => {
  it("place le vainqueur dans le prochain match qui l'attend", () => {
    setState({
      bracket: makeBracket({
        winnersBracket: [
          {
            id: 'wb-r1-m1',
            round: 1,
            bracket: 'winners',
            matchNumber: 1,
            fencerAId: '1',
            fencerBId: '2',
            winnerId: '1',
            isComplete: true,
          },
          {
            id: 'wb-r2-m1',
            round: 2,
            bracket: 'winners',
            matchNumber: 2,
            winnerFromNodes: ['wb-r1-m1'],
            isComplete: false,
          },
        ],
      }),
    });

    get().advanceWinner('wb-r1-m1');

    const next = get().bracket!.winnersBracket.find(n => n.id === 'wb-r2-m1')!;
    expect(next.fencerAId).toBe('1');
  });

  it('ne fait rien si le match source est incomplet', () => {
    setState({
      bracket: makeBracket({
        winnersBracket: [
          { id: 'wb-r1-m1', round: 1, bracket: 'winners', matchNumber: 1, isComplete: false },
          {
            id: 'wb-r2-m1',
            round: 2,
            bracket: 'winners',
            matchNumber: 2,
            winnerFromNodes: ['wb-r1-m1'],
            isComplete: false,
          },
        ],
      }),
    });

    get().advanceWinner('wb-r1-m1');

    expect(get().bracket!.winnersBracket.find(n => n.id === 'wb-r2-m1')!.fencerAId).toBeUndefined();
  });
});

describe('advanceLoser', () => {
  it('envoie le perdant dans le tableau des repêchés et marque son round d’élimination', () => {
    setState({
      bracket: makeBracket({
        winnersBracket: [
          {
            id: 'wb-r1-m1',
            round: 1,
            bracket: 'winners',
            matchNumber: 1,
            fencerAId: '1',
            fencerBId: '2',
            winnerId: '1',
            loserToNodeId: 'lb-r1-m1',
            isComplete: true,
          },
        ],
        losersBracket: [
          { id: 'lb-r1-m1', round: 1, bracket: 'losers', matchNumber: 1, isComplete: false },
        ],
      }),
      fencers: [
        { id: '1', seed: 1, eliminated: false },
        { id: '2', seed: 2, eliminated: false },
      ],
    });

    get().advanceLoser('wb-r1-m1');

    const loserNode = get().bracket!.losersBracket.find(n => n.id === 'lb-r1-m1')!;
    expect(loserNode.fencerAId).toBe('2');
    expect(get().fencers.find(f => f.id === '2')!.eliminationRound).toBe(1);
  });
});

describe('resetGrandFinal', () => {
  it('ajoute une deuxième manche de finale et pose resetRequired', () => {
    setState({
      bracket: makeBracket({
        final: [{ id: 'final-1', round: 1, bracket: 'final', matchNumber: 1, isComplete: true }],
      }),
    });

    get().resetGrandFinal();

    expect(get().bracket!.resetRequired).toBe(true);
    expect(get().bracket!.final).toHaveLength(2);
    expect(get().bracket!.final[1].id).toBe('final-2');
  });
});

describe('getFencerPath / getNextMatch / isInLosersBracket', () => {
  it('retrouve le parcours, le prochain match et la présence en repêchage', () => {
    get().generateBracket('c1', ['1', '2', '3', '4']);
    const firstMatch = get().bracket!.winnersBracket.find(n => n.round === 1)!;

    expect(get().getFencerPath('1')).toHaveLength(1);
    expect(get().getNextMatch('1')?.id).toBe(firstMatch.id);
    expect(get().isInLosersBracket('1')).toBe(false);

    setState(state => ({
      bracket: {
        ...state.bracket!,
        losersBracket: [
          {
            id: 'lb-1',
            round: 1,
            bracket: 'losers',
            matchNumber: 1,
            fencerAId: '2',
            isComplete: false,
          },
        ],
      },
    }));
    expect(get().isInLosersBracket('2')).toBe(true);
  });
});

describe('canWinChampionship', () => {
  it('retourne false pour un tireur éliminé', () => {
    setState({
      bracket: makeBracket(),
      fencers: [{ id: '1', seed: 1, eliminated: true }],
    });
    expect(get().canWinChampionship('1')).toBe(false);
  });

  it('retourne true pour un tireur toujours en lice', () => {
    setState({
      bracket: makeBracket(),
      fencers: [{ id: '1', seed: 1, eliminated: false }],
    });
    expect(get().canWinChampionship('1')).toBe(true);
  });
});

describe('finalizeBracket / getFinalRanking', () => {
  it('désigne le champion et classe les tireurs par round d’élimination', () => {
    setState({
      bracket: makeBracket({
        isComplete: false,
        final: [
          {
            id: 'final-1',
            round: 1,
            bracket: 'final',
            matchNumber: 1,
            fencerAId: '1',
            fencerBId: '2',
            winnerId: '1',
            isComplete: true,
          },
        ],
      }),
      fencers: [
        { id: '1', seed: 1, eliminated: false },
        { id: '2', seed: 2, eliminated: true, eliminationRound: 2 },
        { id: '3', seed: 3, eliminated: true, eliminationRound: 1 },
      ],
    });

    get().finalizeBracket();

    expect(get().bracket!.isComplete).toBe(true);
    expect(get().bracket!.championId).toBe('1');

    const ranking = get().getFinalRanking();
    expect(ranking.map(f => f.id)).toEqual(['3', '2', '1']);
  });

  it("renvoie un classement vide si le tableau n'est pas terminé", () => {
    setState({ bracket: makeBracket({ isComplete: false }), fencers: [] });
    expect(get().getFinalRanking()).toEqual([]);
  });
});

describe('clearBracket', () => {
  it('réinitialise le tableau et les tireurs', () => {
    get().generateBracket('c1', ['1', '2', '3', '4']);
    get().clearBracket();
    expect(get().bracket).toBeNull();
    expect(get().fencers).toEqual([]);
  });
});
