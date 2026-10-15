// @vitest-environment jsdom
/**
 * Tests de composant - TableauView
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TableauView from './TableauView';
import { TableauMatch, FinalResult } from './tableau/tableauTypes';
import { ToastProvider } from './Toast';
import { ConfirmProvider } from './ConfirmDialog';
import { Fencer, Gender, FencerStatus, PoolRanking } from '../../shared/types';

const fencer = (n: number, status = FencerStatus.CHECKED_IN): Fencer => ({
  id: `f${n}`,
  ref: n,
  lastName: `Nom${n}`,
  firstName: 'Prenom',
  gender: Gender.MALE,
  nationality: 'FRA',
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const rankingOf = (count: number): PoolRanking[] =>
  Array.from({ length: count }, (_, i) => ({
    fencer: fencer(i + 1),
    rank: i + 1,
    victories: 0,
    defeats: 0,
    touchesScored: 0,
    touchesReceived: 0,
    index: 0,
    ratio: 0,
  })) as unknown as PoolRanking[];

/** Hôte à état : TableauView est contrôlé via matches/onMatchesChange. */
const Host: React.FC<{
  ranking: PoolRanking[];
  onMatchesSpy?: (m: TableauMatch[]) => void;
  onComplete?: (r: FinalResult[]) => void;
  initial?: TableauMatch[];
  readOnly?: boolean;
  thirdPlaceMatch?: boolean;
  playAllPositions?: boolean;
  onBracketsSpy?: (b: unknown[]) => void;
}> = ({
  ranking,
  onMatchesSpy,
  onComplete,
  initial = [],
  readOnly,
  thirdPlaceMatch,
  playAllPositions,
  onBracketsSpy,
}) => {
  const [matches, setMatches] = useState<TableauMatch[]>(initial);
  return (
    <ToastProvider>
      <ConfirmProvider>
        <TableauView
          ranking={ranking}
          matches={matches}
          onMatchesChange={m => {
            onMatchesSpy?.(m);
            setMatches(m);
          }}
          onComplete={onComplete}
          readOnly={readOnly}
          thirdPlaceMatch={thirdPlaceMatch}
          playAllPositions={playAllPositions}
          onConsolationBracketsChange={onBracketsSpy}
          maxScore={15}
        />
      </ConfirmProvider>
    </ToastProvider>
  );
};

describe('TableauView', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: { getRefereesByCompetition: vi.fn().mockResolvedValue([]) },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('génère un tableau de 8 pour 5 à 8 tireurs (7 matchs, byes inclus)', async () => {
    const spy = vi.fn();
    render(<Host ranking={rankingOf(6)} onMatchesSpy={spy} />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const generated: TableauMatch[] = spy.mock.calls[0][0];
    const rounds = new Set(generated.map(m => m.round));
    expect(rounds.has(8)).toBe(true);
    expect(rounds.has(16)).toBe(false);
    expect(generated.filter(m => m.round === 8)).toHaveLength(4);
    expect(generated.filter(m => m.isBye)).toHaveLength(2);
  });

  it('place chaque tireur éligible une seule fois au premier tour', async () => {
    const spy = vi.fn();
    render(<Host ranking={rankingOf(8)} onMatchesSpy={spy} />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const first: TableauMatch[] = spy.mock.calls[0][0].filter((m: TableauMatch) => m.round === 8);
    const ids = first.flatMap(m => [m.fencerA?.id, m.fencerB?.id]).filter(Boolean);
    expect(new Set(ids).size).toBe(8);
    // Tête de série 1 contre 8 (placement FIE)
    const m1 = first.find(m => m.fencerA?.id === 'f1' || m.fencerB?.id === 'f1')!;
    expect([m1.fencerA?.id, m1.fencerB?.id].sort()).toEqual(['f1', 'f8']);
  });

  it('exclut les tireurs abandon / forfait / exclu du tableau', async () => {
    const spy = vi.fn();
    const ranking = rankingOf(8);
    ranking[7].fencer = fencer(8, FencerStatus.ABANDONED);
    ranking[6].fencer = fencer(7, FencerStatus.FORFAIT);
    ranking[5].fencer = fencer(6, FencerStatus.EXCLUDED);
    render(<Host ranking={ranking} onMatchesSpy={spy} />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const generated: TableauMatch[] = spy.mock.calls[0][0];
    const ids = generated.flatMap(m => [m.fencerA?.id, m.fencerB?.id]);
    expect(ids).not.toContain('f6');
    expect(ids).not.toContain('f7');
    expect(ids).not.toContain('f8');
  });

  it('ajoute une petite finale (round 3) avec thirdPlaceMatch', async () => {
    const spy = vi.fn();
    render(<Host ranking={rankingOf(8)} onMatchesSpy={spy} thirdPlaceMatch />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0].some((m: TableauMatch) => m.round === 3)).toBe(true);
  });

  it('en lecture seule, ne génère ni ne modifie le tableau', async () => {
    const spy = vi.fn();
    render(<Host ranking={rankingOf(8)} onMatchesSpy={spy} readOnly />);
    await new Promise(r => setTimeout(r, 20));
    expect(spy).not.toHaveBeenCalled();
  });

  it('affiche les noms des tireurs et ouvre la saisie de score au clic sur un match', async () => {
    render(<Host ranking={rankingOf(4)} />);
    const card = (await screen.findAllByText(/Nom1 P\./))[0].closest('.match-card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('Nom4 P.');
    fireEvent.click(card);
    expect(await screen.findAllByRole('spinbutton')).toHaveLength(2);
  });

  it('saisir un score fait avancer le vainqueur au tour suivant', async () => {
    const spy = vi.fn();
    render(<Host ranking={rankingOf(4)} onMatchesSpy={spy} />);
    const card = (await screen.findAllByText(/Nom1 P\./))[0].closest('.match-card') as HTMLElement;
    fireEvent.click(card);
    const [inputA, inputB] = await screen.findAllByRole('spinbutton');
    // Nom1 est le fencerA ou fencerB selon le placement : on gagne avec 15 côté A puis on vérifie le vainqueur
    fireEvent.change(inputA, { target: { value: '15' } });
    fireEvent.change(inputB, { target: { value: '9' } });
    const submit = screen
      .getAllByRole('button')
      .find(b => /valider|enregistrer/i.test(b.textContent || ''));
    expect(submit).toBeTruthy();
    const before = spy.mock.calls.length;
    fireEvent.click(submit!);
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(before));
    const last: TableauMatch[] = spy.mock.calls[spy.mock.calls.length - 1][0];
    const played = last.find(m => m.round === 4 && m.winner);
    expect(played).toBeTruthy();
    expect(played!.scoreA).toBe(15);
    expect(played!.scoreB).toBe(9);
    const final = last.find(m => m.round === 2)!;
    expect([final.fencerA?.id, final.fencerB?.id]).toContain(played!.winner!.id);
  });

  it('playAllPositions : notifie les brackets de consolation sans erreur', async () => {
    const brackets = vi.fn();
    render(<Host ranking={rankingOf(8)} playAllPositions onBracketsSpy={brackets} />);
    await waitFor(() => expect(brackets).toHaveBeenCalled());
  });
});
