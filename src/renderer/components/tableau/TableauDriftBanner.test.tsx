// @vitest-environment jsdom
/**
 * Tableau non conforme après corrections de poule cumulées (#1996)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FencerStatus, Gender, type Fencer } from '../../../shared/types';
import { TableauDriftBanner } from './TableauDriftBanner';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

const fencer = (id: string, lastName: string): Fencer =>
  ({
    id,
    lastName,
    firstName: 'Paul',
    gender: Gender.MALE,
    status: FencerStatus.CHECKED_IN,
  }) as Fencer;

describe('TableauDriftBanner (#1996)', () => {
  it('liste les écarts cumulés et propose de refaire le tableau', () => {
    const onRebuild = vi.fn();
    render(
      <TableauDriftBanner
        drift={{
          rankChanges: [],
          seedChanges: [{ fencer: fencer('a', 'DURAND'), drawn: 1, corrected: 2 }],
          entering: [fencer('b', 'MARTIN')],
          leaving: [fencer('c', 'PETIT')],
          playedMatches: 0,
          tableauOutdated: true,
        }}
        onRebuild={onRebuild}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('poolCorrection.drift_title');
    expect(screen.getByText(/seed_change.*DURAND P\..*"from":1.*"to":2/)).toBeInTheDocument();
    expect(screen.getByText(/entering.*MARTIN P\./)).toBeInTheDocument();
    expect(screen.getByText(/leaving.*PETIT P\./)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tableau-drift-rebuild'));
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('replie les têtes de série au-delà de 6', () => {
    const seedChanges = Array.from({ length: 9 }, (_, i) => ({
      fencer: fencer(`s${i}`, `NOM${i}`),
      drawn: i + 1,
      corrected: i + 2,
    }));
    render(
      <TableauDriftBanner
        drift={{
          rankChanges: [],
          seedChanges,
          entering: [],
          leaving: [],
          playedMatches: 0,
          tableauOutdated: true,
        }}
        onRebuild={vi.fn()}
      />
    );
    expect(screen.getAllByText(/seed_change/)).toHaveLength(6);
    expect(screen.getByText(/poolCorrection.more.*"count":3/)).toBeInTheDocument();
  });
});
