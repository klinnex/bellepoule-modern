// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TranslationProvider } from '../../contexts/TranslationContext';
import { AnalyticsCharts } from './AnalyticsCharts';
import {
  Competition,
  Fencer,
  FencerCompetitionStats,
  FencerStatus,
  Match,
  MatchStatus,
  Weapon,
} from '../../../shared/types';

const stat = (id: string, given: number[], received: number[]): FencerCompetitionStats =>
  ({
    fencerId: id,
    fencerLastName: id.toUpperCase(),
    fencerFirstName: 'X',
    fencerClub: id === 'c' ? 'Naboo' : 'Jedi',
    competitionId: 'c',
    touchesZoneA: given[0],
    touchesZoneB: given[1],
    touchesZoneC: given[2],
    totalTouchPoints: given[0] + given[1] * 3 + given[2] * 5,
    receivedZoneA: received[0],
    receivedZoneB: received[1],
    receivedZoneC: received[2],
    receivedTouchPoints: received[0] + received[1] * 3 + received[2] * 5,
    whiteCards: 0,
    yellowCards: 0,
    redCards: 0,
    cardsByReason: {},
    arenaExits: 0,
    matchesPlayed: 1,
    totalDurationSeconds: 0,
    averageDurationSeconds: 0,
    matchesFinishedEarly: 0,
  }) as FencerCompetitionStats;

const competition = { id: 'c', title: 'T', weapon: Weapon.LASER } as Competition;

describe('AnalyticsCharts — zones données / reçues', () => {
  it('affiche les mannequins des touches données et reçues, filtrables par tireur', () => {
    const stats = [stat('a', [1, 2, 3], [4, 0, 1]), stat('b', [4, 0, 1], [1, 2, 3])];
    const { container } = render(
      <TranslationProvider>
        <AnalyticsCharts competition={competition} stats={stats} />
      </TranslationProvider>
    );
    const labels = () =>
      [...container.querySelectorAll('.touch-zones svg')].map(s => s.getAttribute('aria-label'));
    expect(container.querySelector('.touch-zones--given')).not.toBeNull();
    expect(container.querySelector('.touch-zones--received')).not.toBeNull();
    expect(labels().map(l => l?.split(' — ')[1])).toEqual(['A=5 B=2 C=4', 'A=5 B=2 C=4']);

    const select = container.querySelector('select')!;
    fireEvent.change(select, { target: { value: 'fencer:a' } });
    expect(labels().map(l => l?.split(' — ')[1])).toEqual(['A=1 B=2 C=3', 'A=4 B=0 C=1']);
  });

  it('filtre par club', () => {
    const stats = [
      stat('a', [1, 0, 0], [0, 1, 0]),
      stat('b', [0, 1, 0], [0, 0, 1]),
      stat('c', [0, 0, 7], [7, 0, 0]),
    ];
    const { container } = render(
      <TranslationProvider>
        <AnalyticsCharts competition={competition} stats={stats} />
      </TranslationProvider>
    );
    const select = container.querySelector('select')!;
    expect(
      [...select.querySelectorAll('optgroup')[0].querySelectorAll('option')].map(o => o.value)
    ).toEqual(['club:Jedi', 'club:Naboo']);
    fireEvent.change(select, { target: { value: 'club:Jedi' } });
    const labels = [...container.querySelectorAll('.touch-zones svg')].map(
      s => s.getAttribute('aria-label')?.split(' — ')[1]
    );
    expect(labels).toEqual(['A=1 B=1 C=0', 'A=0 B=1 C=1']);
    expect(container.textContent).toContain('Jedi');
  });
});

describe('AnalyticsCharts — armes olympiques (#1817)', () => {
  const foil = { id: 'c', title: 'T', weapon: Weapon.FOIL } as Competition;
  const fencer = (id: string, ranking: number, status = FencerStatus.CHECKED_IN) =>
    ({ id, ranking, status, lastName: id.toUpperCase(), firstName: 'X' }) as unknown as Fencer;
  const m = (id: string, a: string, b: string, sa: number, sb: number) =>
    ({
      id,
      number: 1,
      fencerA: { id: a },
      fencerB: { id: b },
      scoreA: { value: sa, isVictory: sa > sb },
      scoreB: { value: sb, isVictory: sb > sa },
      status: MatchStatus.FINISHED,
      updatedAt: new Date(`2026-11-13T09:0${id.slice(1)}:00Z`),
    }) as unknown as Match;

  it('Global en tête, indice moyen, KPI du tireur sélectionné à la place du classement', () => {
    const stats = [stat('a', [0, 0, 0], [0, 0, 0]), stat('b', [0, 0, 0], [0, 0, 0])];
    const { container, getByTestId, queryByTestId } = render(
      <TranslationProvider>
        <AnalyticsCharts
          competition={foil}
          stats={[...stats, stat('z', [0, 0, 0], [0, 0, 0])]}
          fencers={[fencer('a', 2), fencer('b', 1), fencer('z', 3, FencerStatus.NOT_CHECKED_IN)]}
          poolMatches={[m('m1', 'a', 'b', 5, 2), m('m2', 'b', 'a', 5, 4)]}
          poolRanks={new Map([['a', 1]])}
        />
      </TranslationProvider>
    );
    const select = container.querySelector('select')!;
    expect(select.options[0].value).toBe('');
    expect(select.options[0].textContent).toBe('Global');
    // absent (non pointé) exclu de la liste
    expect([...select.options].map(o => o.value)).not.toContain('fencer:z');
    expect(container.textContent).toContain('Indice moyen');
    expect(container.textContent).toContain('+1.00');
    expect(queryByTestId('fencer-kpis')).toBeNull();

    fireEvent.change(select, { target: { value: 'fencer:a' } });
    expect(container.textContent).not.toContain('Indice moyen');
    const kpis = getByTestId('fencer-kpis');
    // entrée 2e → 1er après poules : progression
    expect(kpis.querySelector('.kpi-delta--up')).not.toBeNull();
    expect([...kpis.querySelectorAll('.kpi-sequence__item')].map(e => e.textContent)).toEqual([
      'V',
      'D',
    ]);
  });
});
