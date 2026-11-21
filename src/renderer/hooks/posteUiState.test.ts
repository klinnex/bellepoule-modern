// @vitest-environment jsdom
/**
 * État d'interface du poste (docs/adr/0017) : stockage tolérant, onglet borné par la phase.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readPosteUiState, tabToRestore, writePosteUiState } from './posteUiState';
import type { Phase } from './useCompetitionSession';

const ORDER: Record<string, number> = {
  checkin: 0,
  poolprep: 1,
  pools: 2,
  ranking: 3,
  tableau: 5,
  results: 6,
  remote: 7,
};
const order = (p: Phase) => ORDER[p];

beforeEach(() => localStorage.clear());

describe('posteUiState', () => {
  it('écrit et relit par épreuve, fusionne les champs', () => {
    writePosteUiState('c1', { tab: 'pools' });
    writePosteUiState('c1', { remoteStripStart: 3 });
    expect(readPosteUiState('c1')).toEqual({ tab: 'pools', remoteStripStart: 3 });
    expect(readPosteUiState('c2')).toEqual({});
  });

  it('stockage illisible : rien', () => {
    localStorage.setItem('bellepoule-ui-c1', '{oops');
    expect(readPosteUiState('c1')).toEqual({});
  });

  it('onglet du poste borné par la phase de l’épreuve ; onglets latéraux libres', () => {
    expect(tabToRestore('pools', 'tableau', order)).toBe('pools');
    expect(tabToRestore('tableau', 'pools', order)).toBe('pools');
    expect(tabToRestore('remote', 'checkin', order)).toBe('remote');
    expect(tabToRestore(undefined, 'ranking', order)).toBe('ranking');
  });
});
