// @vitest-environment jsdom
/**
 * Tests de composant - PoolMatchList
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PoolMatchList from './PoolMatchList';
import { Fencer, Match, MatchStatus, Gender, FencerStatus } from '../../../shared/types';

const fencer = (id: string, last: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: last,
  firstName: 'Prenom',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const pending = (a: Fencer, b: Fencer, index: number) => ({
  index,
  match: {
    id: `m${index}`,
    number: index + 1,
    fencerA: a,
    fencerB: b,
    scoreA: null,
    scoreB: null,
    maxScore: 5,
    status: MatchStatus.NOT_STARTED,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Match,
});

const finished = (a: Fencer, b: Fencer, index: number) => ({
  index,
  match: {
    id: `m${index}`,
    number: index + 1,
    fencerA: a,
    fencerB: b,
    scoreA: {
      value: 5,
      isVictory: true,
      isAbstention: false,
      isExclusion: false,
      isForfait: false,
    },
    scoreB: {
      value: 3,
      isVictory: false,
      isAbstention: false,
      isExclusion: false,
      isForfait: false,
    },
    maxScore: 5,
    status: MatchStatus.FINISHED,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Match,
});

const renderList = (orderedMatches: any, over: Partial<Record<string, any>> = {}) => {
  const props: Record<string, any> = {
    orderedMatches,
    isLaserSabre: false,
    isLocked: false,
    openScoreModal: vi.fn(),
    ...over,
  };
  render(<PoolMatchList {...(props as any)} />);
  return props;
};

const f1 = fencer('1', 'Dupont');
const f2 = fencer('2', 'Martin');
const f3 = fencer('3', 'Bernard');

describe('PoolMatchList', () => {
  it('affiche le prochain match et déclenche openScoreModal', () => {
    const props = renderList({ pending: [pending(f1, f2, 0)], finished: [], cancelled: [] });
    expect(screen.getByText('⚔ Prochain match')).toBeInTheDocument();
    expect(screen.getByText('Dupont')).toBeInTheDocument();
    expect(screen.getByText('Martin')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Saisir le score'));
    expect(props.openScoreModal).toHaveBeenCalledWith(0);
  });

  it('affiche la section « À venir » quand il en reste plusieurs', () => {
    renderList({
      pending: [pending(f1, f2, 0), pending(f1, f3, 1), pending(f2, f3, 2)],
      finished: [],
      cancelled: [],
    });
    expect(screen.getByText(/À venir/)).toBeInTheDocument();
  });

  it('affiche « Poule terminée » sans match en attente', () => {
    renderList({ pending: [], finished: [], cancelled: [] });
    expect(screen.getByText('Poule terminée')).toBeInTheDocument();
  });

  it("le bouton supprimer d'un match terminé n'apparaît qu'au survol de la ligne", () => {
    renderList(
      { pending: [], finished: [finished(f1, f2, 0)], cancelled: [] },
      { onMatchReset: vi.fn() }
    );
    const deleteBtn = screen.getByTitle(/Supprimer ce résultat/);
    expect(deleteBtn).toHaveStyle({ opacity: '0' });

    fireEvent.mouseEnter(deleteBtn.closest('div')!);
    expect(deleteBtn).toHaveStyle({ opacity: '1' });

    fireEvent.mouseLeave(deleteBtn.closest('div')!);
    expect(deleteBtn).toHaveStyle({ opacity: '0' });
  });

  it("clique sur supprimer déclenche onMatchReset avec l'index du match", () => {
    const props = renderList(
      { pending: [], finished: [finished(f1, f2, 0)], cancelled: [] },
      { onMatchReset: vi.fn() }
    );
    fireEvent.click(screen.getByTitle(/Supprimer ce résultat/));
    expect(props.onMatchReset).toHaveBeenCalledWith(0);
  });
});
