import { FencerStatus, Gender, MatchStatus } from '../types';
import type { Pool, PoolRanking, Fencer, Match, Score } from '../types';
import type { TableauMatchForPDF } from './pdfExport';

const NOW = new Date();

function f(id: string, ref: number, lastName: string, firstName: string, club: string): Fencer {
  return {
    id,
    ref,
    lastName,
    firstName,
    club,
    gender: Gender.MALE,
    nationality: 'FRA',
    status: FencerStatus.QUALIFIED,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function score(value: number, isVictory: boolean): Score {
  return { value, isVictory, isAbstention: false, isExclusion: false, isForfait: false };
}

function match(
  id: string,
  num: number,
  a: Fencer,
  b: Fencer,
  va: number,
  vb: number,
  winA: boolean
): Match {
  return {
    id,
    number: num,
    fencerA: a,
    fencerB: b,
    scoreA: score(va, winA),
    scoreB: score(vb, !winA),
    maxScore: 5,
    status: MatchStatus.FINISHED,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function pending(id: string, num: number, a: Fencer, b: Fencer): Match {
  return {
    id,
    number: num,
    fencerA: a,
    fencerB: b,
    scoreA: null,
    scoreB: null,
    maxScore: 5,
    status: MatchStatus.NOT_STARTED,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const F1 = f('f1', 1, 'MARTIN', 'Pierre', 'Escrime Paris');
const F2 = f('f2', 2, 'DUPONT', 'Sophie', 'CE Lyon');
const F3 = f('f3', 3, 'BERNARD', 'Lucas', 'EC Bordeaux');
const F4 = f('f4', 4, 'ROUSSEAU', 'Marie', 'Montpellier Escrime');
const F5 = f('f5', 5, 'LEROY', 'Antoine', 'Strasbourg CE');

export const PREVIEW_POOL: Pool = {
  id: 'preview-pool',
  number: 1,
  phaseId: 'phase-1',
  fencers: [F1, F2, F3, F4, F5],
  matches: [
    match('m1', 1, F1, F2, 5, 3, true),
    match('m2', 2, F3, F4, 5, 2, true),
    match('m3', 3, F1, F3, 4, 5, false),
    match('m4', 4, F2, F4, 5, 1, true),
    match('m5', 5, F1, F4, 5, 0, true),
    match('m6', 6, F2, F3, 3, 5, false),
    match('m7', 7, F5, F1, 2, 5, false),
    pending('m8', 8, F5, F2),
    pending('m9', 9, F5, F3),
    pending('m10', 10, F5, F4),
  ],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: NOW,
  updatedAt: NOW,
};

export const PREVIEW_TABLEAU: TableauMatchForPDF[] = [
  {
    id: 't1',
    round: 4,
    position: 1,
    fencerA: { lastName: 'MARTIN', firstName: 'Pierre' },
    fencerB: { lastName: 'LEROY', firstName: 'Antoine' },
    scoreA: 15,
    scoreB: 9,
    winner: { id: 'f1' },
    isBye: false,
  },
  {
    id: 't2',
    round: 4,
    position: 2,
    fencerA: { lastName: 'DUPONT', firstName: 'Sophie' },
    fencerB: { lastName: 'GARCIA', firstName: 'Carlos' },
    scoreA: 11,
    scoreB: 15,
    winner: { id: 'f6' },
    isBye: false,
  },
  {
    id: 't3',
    round: 3,
    position: 1,
    fencerA: { lastName: 'BERNARD', firstName: 'Lucas' },
    fencerB: { lastName: 'ROUSSEAU', firstName: 'Marie' },
    scoreA: 15,
    scoreB: 12,
    winner: { id: 'f3' },
    isBye: false,
  },
  {
    id: 't4',
    round: 2,
    position: 1,
    fencerA: { lastName: 'MARTIN', firstName: 'Pierre' },
    fencerB: { lastName: 'GARCIA', firstName: 'Carlos' },
    scoreA: null,
    scoreB: null,
    winner: null,
    isBye: false,
  },
];

export const PREVIEW_RANKING: PoolRanking[] = [
  {
    fencer: F1,
    rank: 1,
    victories: 8,
    defeats: 2,
    matchesPlayed: 10,
    touchesScored: 42,
    touchesReceived: 28,
    index: 14,
    ratio: 0.8,
  },
  {
    fencer: F3,
    rank: 2,
    victories: 7,
    defeats: 3,
    matchesPlayed: 10,
    touchesScored: 38,
    touchesReceived: 30,
    index: 8,
    ratio: 0.7,
  },
  {
    fencer: F2,
    rank: 3,
    victories: 6,
    defeats: 4,
    matchesPlayed: 10,
    touchesScored: 35,
    touchesReceived: 32,
    index: 3,
    ratio: 0.6,
  },
  {
    fencer: F4,
    rank: 4,
    victories: 5,
    defeats: 5,
    matchesPlayed: 10,
    touchesScored: 30,
    touchesReceived: 33,
    index: -3,
    ratio: 0.5,
  },
  {
    fencer: F5,
    rank: 5,
    victories: 3,
    defeats: 7,
    matchesPlayed: 10,
    touchesScored: 25,
    touchesReceived: 38,
    index: -13,
    ratio: 0.3,
  },
];
