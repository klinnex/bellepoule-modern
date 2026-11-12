// @vitest-environment jsdom
/**
 * Tests de composant - PoolPrepView (#1499)
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it("brouillon : modifications reprises au retour depuis l'appel (#1649)", () => {
    const onDraft = vi.fn();
    const draftPools = [{ ...pool(base.slice(0, 3)), id: 'pd' }];
    render(
      <TranslationProvider>
        <PoolPrepView
          fencers={base}
          initialPools={[pool(base)]}
          maxScore={5}
          onPoolsConfirm={vi.fn()}
          draft={{
            pools: draftPools,
            poolCount: 1,
            criteria: [
              { key: 'byNation', enabled: true },
              { key: 'byClub', enabled: false },
            ],
          }}
          onDraftChange={onDraft}
        />
      </TranslationProvider>
    );
    expect(screen.queryByText('#4')).toBeNull();
    expect(screen.getByText('#1')).toBeInTheDocument();
    const last = onDraft.mock.lastCall?.[0];
    expect(last.pools[0].id).toBe('pd');
    expect(last.criteria[0]).toEqual({ key: 'byNation', enabled: true });
    expect(last.criteria.find((c: { key: string }) => c.key === 'byClub').enabled).toBe(false);
  });

  it("sans brouillon : publie l'état initial", () => {
    const onDraft = vi.fn();
    render(
      <TranslationProvider>
        <PoolPrepView
          fencers={base}
          initialPools={[pool(base)]}
          maxScore={5}
          onPoolsConfirm={vi.fn()}
          onDraftChange={onDraft}
        />
      </TranslationProvider>
    );
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ poolCount: 1 }));
  });
});

describe('PoolPrepView – brouillon de préparation (#1649)', () => {
  const base = [1, 2, 3, 4, 5, 6].map(fencer);

  it("le brouillon prime sur les poules initiales (retour depuis l'appel)", () => {
    const draftPools = [pool([base[0], base[1], base[2]]), { ...pool(base.slice(3)), id: 'p2' }];
    render(
      <TranslationProvider>
        <PoolPrepView
          fencers={base}
          initialPools={[pool(base)]}
          maxScore={5}
          onPoolsConfirm={vi.fn()}
          draft={{ pools: draftPools, poolCount: 2, criteria: [] }}
        />
      </TranslationProvider>
    );
    expect(document.querySelector('.pool-prep-stepper-value')).toHaveTextContent('2');
  });

  it('modification manuelle → brouillon transmis', () => {
    const onDraftChange = vi.fn();
    render(
      <TranslationProvider>
        <PoolPrepView
          fencers={base}
          initialPools={[pool(base)]}
          maxScore={5}
          onPoolsConfirm={vi.fn()}
          onDraftChange={onDraftChange}
        />
      </TranslationProvider>
    );
    fireEvent.click(screen.getAllByRole('button', { pressed: true })[0]);
    expect(onDraftChange).toHaveBeenCalledWith(
      expect.objectContaining({
        poolCount: 1,
        criteria: expect.arrayContaining([expect.objectContaining({ enabled: false })]),
      })
    );
  });
});

describe('PoolPrepView — pastille du critère prioritaire (#1440)', () => {
  it('club en priorité 1 : pastille club, orange si doublon dans la poule', () => {
    // f1 et f4 : Club1 (doublon), f2 : Club2, f3 : Club0
    const base = [1, 2, 3, 4].map(fencer);
    const { container } = render(view(base, [pool(base)]));
    const pills = [...container.querySelectorAll('.pool-prep-club-pill')];
    expect(pills.map(p => p.textContent)).toEqual(['Club1', 'Club2', 'Club0', 'Club1']);
    expect(pills.filter(p => p.classList.contains('conflict'))).toHaveLength(2);
  });
});
