/**
 * Module arbitre /js/refereeCards.js (#1401) : règles des cartons et de la passivité.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const req = createRequire(import.meta.url);
const C = req('./refereeCards.js');

describe('refereeCards.js cartons', () => {
  it('modernYellowOrRed : rouge si déjà jaune ou rouge', () => {
    expect(C.modernYellowOrRed([])).toBe('yellow');
    expect(C.modernYellowOrRed(['white'])).toBe('yellow');
    expect(C.modernYellowOrRed(['yellow'])).toBe('red');
    expect(C.modernYellowOrRed(['red'])).toBe('red');
  });

  it('cardFromGroup : classique (historique) et moderne', () => {
    const h = (o: Record<number, number>) => ({ isModern: false, history: o });
    expect(C.cardFromGroup(1, h({}))).toBe('white');
    expect(C.cardFromGroup(1, h({ 1: 1 }))).toBe('yellow');
    expect(C.cardFromGroup(1, h({ 1: 5 }))).toBe('yellow');
    expect(C.cardFromGroup(2, h({}))).toBe('yellow');
    expect(C.cardFromGroup(2, h({ 2: 1 }))).toBe('red');
    expect(C.cardFromGroup(3, h({}))).toBe('red');
    expect(C.cardFromGroup(1, { isModern: false })).toBe('white');
    expect(C.cardFromGroup(2, { isModern: true, standardCards: [] })).toBe('yellow');
    expect(C.cardFromGroup(2, { isModern: true, standardCards: ['yellow'] })).toBe('red');
    expect(C.cardFromGroup(1, { isModern: true, standardCards: [] })).toBe('red');
  });

  it('cardEffect : classique +3 / +5, blanc, 2e blanc -> jaune', () => {
    expect(C.cardEffect({ cardType: 'white', isModern: false, whiteCount: 0 })).toEqual({
      cardType: 'white',
      secondWhite: false,
      opponentPoints: 0,
      notify: null,
    });
    expect(C.cardEffect({ cardType: 'white', isModern: false, whiteCount: 1 })).toEqual({
      cardType: 'yellow',
      secondWhite: true,
      opponentPoints: 3,
      notify: 'referee.opp_plus3',
    });
    expect(C.cardEffect({ cardType: 'red', isModern: false, whiteCount: 0 })).toMatchObject({
      opponentPoints: 5,
      notify: 'referee.opp_plus5',
    });
  });

  it('cardEffect : moderne, jaune sans point, rouge +1', () => {
    expect(C.cardEffect({ cardType: 'yellow', isModern: true, whiteCount: 0 })).toMatchObject({
      opponentPoints: 0,
      notify: null,
    });
    expect(C.cardEffect({ cardType: 'red', isModern: true, whiteCount: 0 })).toMatchObject({
      opponentPoints: 1,
      notify: 'referee.opp_plus1',
    });
  });

  it('cardVibration', () => {
    expect(C.cardVibration('red')).toEqual([100, 50, 100]);
    expect(C.cardVibration('yellow')).toBe(80);
    expect(C.cardVibration('white')).toBe(40);
  });
});

describe('refereeCards.js passivité', () => {
  it('nextPassivityCard : rouge, noir, puis plus rien', () => {
    expect(C.nextPassivityCard(0)).toBe('p-red');
    expect(C.nextPassivityCard(1)).toBe('p-black');
    expect(C.nextPassivityCard(2)).toBeNull();
  });

  it('passivityWinner : score, puis classement initial, puis tirage', () => {
    const fa = { ranking: 5 };
    const fb = { initialRanking: 2 };
    expect(C.passivityWinner({ scoreA: 3, scoreB: 1, fencerA: fa, fencerB: fb })).toEqual({
      action: 'finish',
      winner: 'A',
      reasonKey: 'referee.reason_passivity',
    });
    expect(C.passivityWinner({ scoreA: 1, scoreB: 3 }).winner).toBe('B');
    expect(C.passivityWinner({ scoreA: 2, scoreB: 2, fencerA: fa, fencerB: fb })).toEqual({
      action: 'finish',
      winner: 'B',
      reasonKey: 'referee.reason_passivity_seed',
    });
    expect(
      C.passivityWinner({ scoreA: 2, scoreB: 2, fencerA: { ranking: 1 }, fencerB: {} }).winner
    ).toBe('A');
    expect(C.passivityWinner({ scoreA: 2, scoreB: 2, fencerA: {}, fencerB: fb }).winner).toBe('B');
    expect(C.passivityWinner({ scoreA: 2, scoreB: 2, fencerA: {}, fencerB: {} })).toEqual({
      action: 'tiebreak',
    });
    expect(
      C.passivityWinner({ scoreA: 2, scoreB: 2, fencerA: { ranking: 3 }, fencerB: { ranking: 3 } })
    ).toEqual({ action: 'tiebreak' });
  });

  it('referee.html charge le module et délègue', () => {
    const html =
      fs.readFileSync(path.join(__dirname, '..', 'referee.html'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeApp.js'), 'utf8') +
      fs.readFileSync(path.join(__dirname, 'refereeAppBase.js'), 'utf8'); // page + script extrait (#1600)
    expect(html).toContain('<script src="/js/refereeCards.js"></script>');
    expect(html).toContain('BPRefereeCards.cardEffect(');
    expect(html).not.toContain('Groupe 3 : rouge direct');
  });
});
