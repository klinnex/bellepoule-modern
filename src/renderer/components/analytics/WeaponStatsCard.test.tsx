// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TranslationProvider } from '../../contexts/TranslationContext';
import { WeaponStatsCard } from './WeaponStatsCard';
import {
  Competition,
  FencerCompetitionStats,
  Match,
  MatchStatus,
  Weapon,
} from '../../../shared/types';

const m = (sa: number, sb: number) =>
  ({
    id: `${sa}-${sb}`,
    maxScore: 5,
    fencerA: { id: 'a' },
    fencerB: { id: 'b' },
    scoreA: { value: sa, isVictory: sa > sb },
    scoreB: { value: sb, isVictory: sb > sa },
    status: MatchStatus.FINISHED,
  }) as unknown as Match;

const legacy = { totalMatches: 9, averageVictoryMargin: 1, mostTouchingMatch: 7 };
const cards = {
  whiteCards: 0,
  yellowCards: 2,
  redCards: 1,
  blackCards: 1,
} as FencerCompetitionStats;

describe('WeaponStatsCard (#1817)', () => {
  it('armes olympiques : écart, cartons/match, abandons, temps limite', () => {
    const { getByTestId } = render(
      <TranslationProvider>
        <WeaponStatsCard
          competition={{ weapon: Weapon.EPEE } as Competition}
          poolMatches={[m(5, 1), m(3, 2)]}
          tableauMatches={[]}
          fencers={[]}
          fencerStats={[cards]}
          legacy={legacy}
        />
      </TranslationProvider>
    );
    const text = getByTestId('weapon-stats-olympic').textContent;
    expect(text).toContain('2.5'); // (4 + 1) / 2
    expect(text).toContain('2.00'); // 4 cartons / 2 matchs
    expect(text).toContain('0 / 0 / 0');
    expect(text).toContain('1 (50%)');
  });

  it("tournoi des rapières : mêmes indicateurs que l'épée", () => {
    const { getByTestId } = render(
      <TranslationProvider>
        <WeaponStatsCard
          competition={
            { weapon: Weapon.CUSTOM, settings: { specialMode: 'rapieres' } } as Competition
          }
          poolMatches={[m(5, 1), m(3, 2)]}
          tableauMatches={[]}
          fencers={[]}
          fencerStats={[cards]}
          legacy={legacy}
        />
      </TranslationProvider>
    );
    expect(getByTestId('weapon-stats-olympic').textContent).toContain('1 (50%)');
  });

  it('arme personnalisée hors rapières : indicateurs historiques', () => {
    const { queryByTestId } = render(
      <TranslationProvider>
        <WeaponStatsCard
          competition={{ weapon: Weapon.CUSTOM } as Competition}
          poolMatches={[]}
          tableauMatches={[]}
          fencers={[]}
          fencerStats={[]}
          legacy={legacy}
        />
      </TranslationProvider>
    );
    expect(queryByTestId('weapon-stats-olympic')).toBeNull();
  });

  it('sabre laser : indicateurs historiques', () => {
    const { queryByTestId, container } = render(
      <TranslationProvider>
        <WeaponStatsCard
          competition={{ weapon: Weapon.LASER } as Competition}
          poolMatches={[]}
          tableauMatches={[]}
          fencers={[]}
          fencerStats={[]}
          legacy={legacy}
        />
      </TranslationProvider>
    );
    expect(queryByTestId('weapon-stats-olympic')).toBeNull();
    expect(container.textContent).toContain('9');
  });
});
