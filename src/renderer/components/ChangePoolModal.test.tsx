// @vitest-environment jsdom
/**
 * Tests de composant - ChangePoolModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChangePoolModal from './ChangePoolModal';
import { Fencer, Pool, Gender, FencerStatus } from '../../shared/types';

const fencer = (id: string, last: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: last,
  firstName: 'F',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const pool = (id: string, number: number, fencers: Fencer[]): Pool => ({
  id,
  number,
  phaseId: 'ph',
  fencers,
  matches: [],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const fA = fencer('1', 'Dupont');
const p1 = pool('p1', 1, [fA]);
const p2 = pool('p2', 2, [fencer('2', 'Martin')]);
const p3 = pool('p3', 3, [fencer('3', 'Bernard')]);

const setup = () => {
  const onMove = vi.fn();
  const onClose = vi.fn();
  render(
    <ChangePoolModal
      fencer={fA}
      currentPool={p1}
      allPools={[p1, p2, p3]}
      onMove={onMove}
      onClose={onClose}
    />
  );
  return { onMove, onClose };
};

describe('ChangePoolModal', () => {
  it('liste les autres poules (pas la poule courante)', () => {
    setup();
    expect(screen.getByText('Poule 2')).toBeInTheDocument();
    expect(screen.getByText('Poule 3')).toBeInTheDocument();
    expect(screen.queryByText('Poule 1')).not.toBeInTheDocument();
  });

  it('le bouton déplacer est désactivé tant qu’aucune poule n’est choisie', () => {
    setup();
    expect(screen.getByText('Déplacer le tireur')).toBeDisabled();
  });

  it('sélectionner une poule puis déplacer appelle onMove + onClose', () => {
    const { onMove, onClose } = setup();
    fireEvent.click(screen.getByText('Poule 3'));
    const btn = screen.getByText('Déplacer le tireur');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    // onMove(fencerId, fromIndex=0, toIndex=2)
    expect(onMove).toHaveBeenCalledWith('1', 0, 2);
    expect(onClose).toHaveBeenCalled();
  });
});
