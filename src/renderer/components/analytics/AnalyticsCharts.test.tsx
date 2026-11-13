// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TranslationProvider } from '../../contexts/TranslationContext';
import { AnalyticsCharts } from './AnalyticsCharts';
import { Competition, FencerCompetitionStats, Weapon } from '../../../shared/types';

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
