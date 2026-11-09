// @vitest-environment jsdom
/**
 * Tests de composant - MatchCard (#1542) : clavier + actions secondaires
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MatchCard from './MatchCard';

const match = {
  id: 'm1',
  round: 8,
  position: 0,
  fencerA: { id: 'a', lastName: 'Dupont', firstName: 'Jean' },
  fencerB: { id: 'b', lastName: 'Martin', firstName: 'Marie' },
  scoreA: null,
  scoreB: null,
  winner: null,
  isBye: false,
} as any;

const setup = (over: Record<string, unknown> = {}) => {
  const onMatchClick = vi.fn();
  const onArenaClick = vi.fn();
  const utils = render(
    <MatchCard
      match={match}
      viewMode="full"
      baseMatchHeight={100}
      onMatchClick={onMatchClick}
      onArenaClick={onArenaClick}
      {...over}
    />
  );
  return { onMatchClick, onArenaClick, ...utils };
};

describe('MatchCard clavier', () => {
  it('Entrée sur la carte ouvre la saisie', () => {
    const { onMatchClick, container } = setup();
    const card = container.querySelector('.match-card') as HTMLElement;
    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onMatchClick).toHaveBeenCalledWith(match);
  });

  it('Espace ouvre aussi la saisie', () => {
    const { onMatchClick, container } = setup();
    fireEvent.keyDown(container.querySelector('.match-card') as HTMLElement, { key: ' ' });
    expect(onMatchClick).toHaveBeenCalledTimes(1);
  });

  it("Entrée sur le bouton piste n'ouvre pas la saisie", () => {
    const { onMatchClick } = setup();
    fireEvent.keyDown(screen.getByText('+P'), { key: 'Enter' });
    expect(onMatchClick).not.toHaveBeenCalled();
  });

  it('lecture seule : carte non focusable', () => {
    const { container } = setup({ readOnly: true });
    expect(container.querySelector('.match-card')).not.toHaveAttribute('tabindex');
  });
});
