// @vitest-environment jsdom
/**
 * Tests de composant - AddFencerToPoolModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddFencerToPoolModal from './AddFencerToPoolModal';
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

const inPool = fencer('1', 'Dupont');
const free = fencer('2', 'Martin');
const pool: Pool = {
  id: 'p1',
  number: 1,
  phaseId: 'ph',
  fencers: [inPool],
  matches: [],
  referees: [],
  isComplete: false,
  hasError: false,
  ranking: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  (window as any).electronAPI = {
    db: {
      getFencersByCompetition: vi.fn(async () => [inPool, free]),
      syncPoolSnapshot: vi.fn(async () => undefined),
    },
  };
});
afterEach(() => {
  delete (window as any).electronAPI;
});

describe('AddFencerToPoolModal', () => {
  it('affiche les tireurs disponibles (hors poule)', async () => {
    render(
      <AddFencerToPoolModal pool={pool} competitionId="c1" onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    expect(await screen.findByText(/Martin/)).toBeInTheDocument();
    // Dupont est déjà dans la poule → absent de la liste des disponibles
    expect(screen.queryByText(/Dupont/)).not.toBeInTheDocument();
  });

  it('sélectionne un tireur et confirme l’ajout (poule locale + synchro DB)', async () => {
    const onConfirm = vi.fn();
    render(
      <AddFencerToPoolModal
        pool={pool}
        competitionId="c1"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByText(/Martin/));
    fireEvent.click(screen.getByText('Ajouter le tireur'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const updated: Pool = onConfirm.mock.calls[0][0];
    expect(updated.fencers.map(f => f.id)).toEqual(['1', '2']);
    expect(updated.matches).toHaveLength(1);
    expect(updated.matches[0].fencerA?.id).toBe('2');
    expect(updated.matches[0].fencerB?.id).toBe('1');
    const sync = (window as any).electronAPI.db.syncPoolSnapshot;
    expect(sync).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ id: 'p1', fencerIds: ['1', '2'] })
    );
  });

  it('ajoute quand même le tireur si la poule est absente de la base (#905)', async () => {
    (window as any).electronAPI.db.syncPoolSnapshot = vi.fn(async () => {
      throw new Error('Pool p1 introuvable');
    });
    const onConfirm = vi.fn();
    render(
      <AddFencerToPoolModal
        pool={pool}
        competitionId="c1"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByText(/Martin/));
    fireEvent.click(screen.getByText('Ajouter le tireur'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0].fencers).toHaveLength(2);
  });

  it('exclut les tireurs déjà placés dans une autre poule', async () => {
    render(
      <AddFencerToPoolModal
        pool={pool}
        competitionId="c1"
        assignedFencerIds={new Set(['2'])}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(await screen.findByText('Aucun tireur disponible')).toBeInTheDocument();
  });

  it('le bouton ajouter est désactivé sans sélection', async () => {
    render(
      <AddFencerToPoolModal pool={pool} competitionId="c1" onConfirm={vi.fn()} onClose={vi.fn()} />
    );
    await screen.findByText(/Martin/);
    expect(screen.getByText('Ajouter le tireur')).toBeDisabled();
  });
});
