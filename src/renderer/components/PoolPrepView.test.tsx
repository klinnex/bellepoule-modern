// @vitest-environment jsdom
/**
 * Tests de composant - PoolPrepView (#1499)
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import PoolPrepView from './PoolPrepView';
import { TranslationProvider } from '../contexts/TranslationContext';
import { Fencer, FencerStatus, Gender, Pool } from '../../shared/types';

const fencer = (n: number): Fencer =>
  ({
    id: `f${n}`,
    ref: n,
    lastName: `Nom${n}`,
    firstName: 'Prenom',
    gender: Gender.MALE,
    nationality: 'FRA',
    club: `Club${n % 3}`,
    ranking: n,
    status: FencerStatus.CHECKED_IN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Fencer;

const pool = (fencers: Fencer[]): Pool =>
  ({
    id: 'p1',
    number: 1,
    phaseId: 'phase-pools',
    fencers,
    matches: [],
    referees: [],
    isComplete: false,
    hasError: false,
    ranking: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Pool;

const view = (fencers: Fencer[], initialPools: Pool[], poolsLaunched = false) => (
  <TranslationProvider>
    <PoolPrepView
      fencers={fencers}
      initialPools={initialPools}
      maxScore={5}
      poolsLaunched={poolsLaunched}
      onPoolsConfirm={vi.fn()}
    />
  </TranslationProvider>
);

describe('PoolPrepView (#1499)', () => {
  const base = [1, 2, 3, 4].map(fencer);

  it('titres Min / Max séparés au-dessus des deux champs', () => {
    render(view(base, [pool(base)]));
    expect(screen.getByText('Tireurs Min')).toBeInTheDocument();
    expect(screen.getByText('Tireurs Max')).toBeInTheDocument();
    expect(screen.queryByText(/Tireurs \/ poule/)).toBeNull();
  });

  it("le tireur ajouté depuis l'appel n'entre pas dans les poules avant la repréparation", () => {
    const { rerender } = render(view(base, [pool(base)]));
    expect(screen.queryByText(/non placé/)).toBeNull();

    rerender(view([...base, fencer(5)], [pool(base)]));
    expect(screen.queryByText('Nom5')).toBeNull();
    expect(screen.getByText(/1 tireur\(s\) ajouté\(s\) depuis l'appel/)).toBeInTheDocument();
  });

  it('bouton « Lancer » puis « Relancer » une fois les poules lancées', () => {
    const onLaunch = vi.fn();
    const props = {
      fencers: base,
      initialPools: [pool(base)],
      maxScore: 5,
      onPoolsConfirm: vi.fn(),
    };
    render(
      <TranslationProvider>
        <PoolPrepView {...props} onLaunchActionChange={onLaunch} />
      </TranslationProvider>
    );
    expect(onLaunch).toHaveBeenCalledWith(expect.objectContaining({ label: 'Lancer les poules' }));

    onLaunch.mockClear();
    render(
      <TranslationProvider>
        <PoolPrepView {...props} poolsLaunched onLaunchActionChange={onLaunch} />
      </TranslationProvider>
    );
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Relancer les poules' })
    );
  });
});
