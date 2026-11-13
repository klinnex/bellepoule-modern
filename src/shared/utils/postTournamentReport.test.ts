/**
 * Rapport post-tournoi (analytique) : classement complet, par club, stats individuelles.
 */
import { describe, it, expect } from 'vitest';
import { generatePostTournamentReportHTML, buildReportExtras } from './postTournamentReport';
import {
  MatchStatus,
  Weapon,
  type Competition,
  type Fencer,
  type FencerCompetitionStats,
  type Match,
  type PoolRanking,
} from '../types';

const fencer = (id: string, lastName: string, club: string): Fencer =>
  ({ id, lastName, firstName: 'Ana', club }) as Fencer;

const stats = (f: Fencer, extra: Partial<FencerCompetitionStats> = {}): FencerCompetitionStats =>
  ({
    fencerId: f.id,
    fencerLastName: f.lastName,
    fencerFirstName: f.firstName,
    fencerClub: f.club,
    competitionId: 'c1',
    touchesZoneA: 0,
    touchesZoneB: 0,
    touchesZoneC: 0,
    totalTouchPoints: 0,
    receivedTouchPoints: 0,
    whiteCards: 0,
    yellowCards: 0,
    redCards: 0,
    arenaExits: 0,
    matchesPlayed: 3,
    averageDurationSeconds: 125,
    ...extra,
  }) as FencerCompetitionStats;

const competition = { id: 'c1', title: 'Open <Test>', weapon: Weapon.EPEE } as Competition;
const fencers = Array.from({ length: 30 }, (_, i) =>
  fencer(`f${i}`, `Nom${i}`, i % 3 === 0 ? 'Paris' : i % 3 === 1 ? 'Lyon' : 'Nice')
);

describe('rapport post-tournoi', () => {
  const ranking: PoolRanking[] = fencers.map(
    (f, i) =>
      ({
        fencer: f,
        rank: i + 1,
        victories: 5 - (i % 6),
        defeats: i % 6,
        matchesPlayed: 5,
        touchesScored: 20,
        touchesReceived: 15,
        index: 5,
        ratio: 0.5,
      }) as PoolRanking
  );
  const matches = [
    { status: MatchStatus.FINISHED },
    { status: MatchStatus.NOT_STARTED },
  ] as Match[];

  it('buildReportExtras : classement final prioritaire + décompte poules/tableau', () => {
    const extras = buildReportExtras({
      matches,
      fencers,
      overallRanking: ranking,
      finalResults: [{ rank: 1, fencer: { id: 'f4' } }],
      tableauMatches: [
        { fencerA: { id: 'f1' }, fencerB: { id: 'f2' }, winner: { id: 'f1' }, isBye: false },
        { fencerA: { id: 'f3' }, fencerB: null, winner: { id: 'f3' }, isBye: true },
      ],
    });
    expect(extras.rankingKind).toBe('final');
    expect(extras.ranking).toEqual([
      expect.objectContaining({ rank: 1, name: 'NOM4 Ana', club: 'Lyon', victories: 1 }),
    ]);
    expect(extras.matchCounts).toEqual({ total: 3, finished: 2 });
  });

  it('liste tous les tireurs (pas de top 5), par club, échappe le HTML', () => {
    const extras = buildReportExtras({ matches, fencers, overallRanking: ranking });
    const html = generatePostTournamentReportHTML(
      competition,
      fencers.map((f, i) => stats(f, { yellowCards: i === 0 ? 2 : 0 })),
      [],
      null,
      extras
    );
    expect(html).toContain('Classement après poules');
    for (const f of fencers) expect(html).toContain(`NOM${f.id.slice(1)} Ana`);
    expect(html).toContain('Par club');
    // Paris : f0 (rang 1), 10 tireurs, 2 jaunes
    expect(html).toMatch(
      /Paris<\/td>\s*<td[^>]*>10<\/td>\s*<td[^>]*>1<\/td>\s*<td[^>]*>30<\/td>\s*<td[^>]*>2</
    );
    expect(html).toContain('Open &lt;Test&gt;');
    expect(html).toContain('2:05');
  });
});
