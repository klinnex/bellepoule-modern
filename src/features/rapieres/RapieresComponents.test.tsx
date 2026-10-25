// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Fencer, FencerStatus, Gender, Match, MatchStatus, Pool } from '../../shared/types';
import RapieresTeamModal from './RapieresTeamModal';
import RapieresWaveBar from './RapieresWaveBar';
import RapieresImportModal from './RapieresImportModal';
import { waveMatchOrder } from './rapieresCalculations';
import { RapieresFencer } from './rapieres.types';

vi.mock('../../renderer/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, string>) => (p ? `${k}:${Object.values(p).join(',')}` : k),
  }),
}));

const fencer = (id: string): Fencer =>
  ({
    id,
    ref: 0,
    lastName: id,
    firstName: '',
    gender: Gender.MIXED,
    nationality: 'FRA',
    status: FencerStatus.CHECKED_IN,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Fencer;

const pool = (): Pool => {
  const fencers = ['a', 'b', 'c', 'd'].map(fencer);
  return {
    id: 'p',
    number: 1,
    phaseId: 'ph',
    fencers,
    matches: waveMatchOrder(fencers).map(
      ([x, y], i) =>
        ({
          id: `m${i}`,
          number: i + 1,
          fencerA: fencers[x - 1],
          fencerB: fencers[y - 1],
          scoreA: null,
          scoreB: null,
          maxScore: 5,
          status: MatchStatus.NOT_STARTED,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as Match
    ),
    referees: [],
    isComplete: false,
    hasError: false,
    ranking: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Pool;
};

describe('Tournoi des rapières : composants (#1118)', () => {
  it('fenêtre équipe : nom, niveau, deux tireurs avec catégorie', async () => {
    const onSave = vi.fn();
    render(<RapieresTeamModal onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('rapieres.save_team'));
    expect(await screen.findByRole('alert')).toHaveTextContent('rapieres.team_incomplete');
    fireEvent.change(screen.getByLabelText(/rapieres.team_name/), { target: { value: 'Alpha' } });
    fireEvent.change(screen.getByLabelText('rapieres.level'), { target: { value: 'expert' } });
    const lasts = screen.getAllByLabelText(/rapieres.last_name/);
    fireEvent.change(lasts[0], { target: { value: 'Dupont' } });
    fireEvent.change(lasts[1], { target: { value: 'Martin' } });
    fireEvent.change(screen.getAllByLabelText('rapieres.category')[1], {
      target: { value: 'V2' },
    });
    fireEvent.click(screen.getByText('rapieres.save_team'));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({
      name: 'Alpha',
      info: {
        level: 'expert',
        fencers: [
          { firstName: '', lastName: 'Dupont', category: 'SENIOR' },
          { firstName: '', lastName: 'Martin', category: 'V2' },
        ],
      },
    });
  });

  it('barre des vagues : lancement, vague incomplète, fin anticipée', () => {
    const onLaunchWave = vi.fn();
    const onEndWaves = vi.fn();
    const props = {
      pools: [pool()],
      wavesEnded: false,
      onLaunchWave,
      onEndWaves,
      onResumeWaves: vi.fn(),
    };
    const { rerender } = render(<RapieresWaveBar {...props} launchedWave={0} />);
    fireEvent.click(screen.getByText('rapieres.launch_wave:1'));
    expect(onLaunchWave).toHaveBeenCalledWith(1);
    rerender(<RapieresWaveBar {...props} launchedWave={1} />);
    expect(screen.getByText('rapieres.launch_wave:2')).toBeDisabled();
    expect(screen.getByText('rapieres.wave_incomplete')).toBeInTheDocument();
    fireEvent.click(screen.getByText('rapieres.end_waves'));
    expect(onEndWaves).toHaveBeenCalled();
  });

  it("fenêtre d'import : équipes cochées par défaut, sélection transmise (#1211)", async () => {
    const team = (name: string) => ({
      name,
      info: {
        level: 'beginner' as const,
        fencers: [
          {
            firstName: 'A',
            lastName: `${name}1`,
            category: 'SENIOR' as const,
            gender: 'M' as const,
          },
          { firstName: 'B', lastName: `${name}2`, category: 'V1' as const },
        ] as [RapieresFencer, RapieresFencer],
      },
    });
    const teams = [team('Alpha'), team('Beta'), team('Gamma')];
    const onImport = vi.fn();
    const onClose = vi.fn();
    render(
      <RapieresImportModal
        filename="export.csv"
        teams={teams}
        skipped={[4]}
        onImport={onImport}
        onClose={onClose}
      />
    );
    expect(screen.getByText('rapieres.import_found:3')).toBeInTheDocument();
    expect(screen.getByText('rapieres.import_skipped:4')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Beta'));
    fireEvent.click(screen.getByText('rapieres.import_n:2'));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onImport).toHaveBeenCalledWith([teams[0], teams[2]]);
  });
});
