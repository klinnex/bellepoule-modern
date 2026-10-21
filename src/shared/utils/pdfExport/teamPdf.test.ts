/**
 * Tests - Export PDF équipes (#1087)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computeTeamFinalRanking,
  groupTeamPools,
  generateTeamPoolsHTML,
  generateTeamTableauHTML,
  generateTeamRankingHTML,
  exportTeamPoolsToPDF,
} from './teamPdf';
import { placeRankedTeamsInTable } from '../../../features/teams/utils/teamCalculations';
import type { TeamMatchRow, TeamRow } from '../../../features/teams/types/team.types';

const team = (id: string): TeamRow => ({
  id,
  name: `Équipe ${id}`,
  club: `Club ${id}`,
  fencers: [1, 2, 3].map(n => ({
    fencerId: `${id}${n}`,
    fencerLastName: `nom${id}${n}`,
    fencerFirstName: 'P',
    teamOrder: n,
    isReserve: false,
  })),
});

const match = (
  a: string,
  b: string,
  over: Partial<TeamMatchRow> = {},
  winner: string | null = a
): TeamMatchRow => ({
  id: `${a}-${b}`,
  teamAId: a,
  teamBId: b,
  scoreBoutsA: winner === a ? 45 : 30,
  scoreBoutsB: winner === a ? 30 : 45,
  status: winner ? 'finished' : 'in_progress',
  winnerId: winner,
  currentBoutIndex: 9,
  bouts: [
    {
      id: `${a}-${b}-1`,
      boutOrder: 1,
      fencerAId: `${a}1`,
      fencerBId: `${b}1`,
      scoreA: 5,
      scoreB: 3,
      maxScore: 5,
      status: 'finished',
      winnerId: `${a}1`,
    },
  ],
  ...over,
});

const opts = (teams: TeamRow[], isLaserArena = false) => ({
  title: 'Coupe <Équipes>',
  teams,
  fencerName: (id: string) => `Tireur ${id}`,
  isLaserArena,
});

/** Matchs de tableau positionnés selon le placement réel (seed → position). */
function tableau4(teams: TeamRow[], semis: [string, string], final?: string) {
  const placements = placeRankedTeamsInTable(teams, 4);
  const pair = (p: number) => [placements[p * 2]!.id, placements[p * 2 + 1]!.id];
  const ms: TeamMatchRow[] = [0, 1].map(p => {
    const [a, b] = pair(p);
    return { ...match(a, b, {}, semis[p]), id: `sf${p}`, round: 2, position: p };
  });
  if (final !== undefined) {
    const [fa, fb] = semis;
    ms.push({ ...match(fa, fb, {}, final), id: 'f', round: 1, position: 0 });
  }
  return ms;
}

describe('teamPdf', () => {
  afterEach(() => {
    delete (globalThis as any).window;
    vi.restoreAllMocks();
  });

  it('groupTeamPools : regroupe par numéro de poule', () => {
    const teams = ['A', 'B', 'C', 'D'].map(team);
    const pools = groupTeamPools(teams, [
      match('A', 'B', { poolNumber: 1 }),
      match('C', 'D', { poolNumber: 2 }),
    ]);
    expect(pools.map(p => p.number)).toEqual([1, 2]);
    expect(pools[1].teams.map(t => t.id)).toEqual(['C', 'D']);
  });

  it('classement final : vainqueur, finaliste, demi-finalistes 3e ex æquo', () => {
    const teams = ['A', 'B', 'C', 'D'].map(team); // ordre de seed
    const ms = tableau4(teams, ['A', 'B'], 'B');
    const { rows, provisional } = computeTeamFinalRanking(teams, ms);
    expect(provisional).toBe(false);
    expect(rows.map(r => [r.team.id, r.rank])).toEqual([
      ['B', 1],
      ['A', 2],
      ['C', 3],
      ['D', 3],
    ]);
  });

  it('classement final provisoire tant que la finale n’est pas jouée', () => {
    const teams = ['A', 'B', 'C', 'D'].map(team);
    const { rows, provisional } = computeTeamFinalRanking(teams, tableau4(teams, ['A', 'B']));
    expect(provisional).toBe(true);
    expect(rows.slice(0, 2).map(r => r.team.id)).toEqual(['A', 'B']);
    expect(rows.slice(2).map(r => r.rank)).toEqual([3, 3]);
  });

  it('sans tableau : ordre de poule', () => {
    const teams = ['A', 'B', 'C'].map(team);
    const { rows } = computeTeamFinalRanking(teams, []);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('HTML poules : classement, score, relais, échappement', () => {
    const teams = ['A', 'B'].map(team);
    const html = generateTeamPoolsHTML(opts(teams), [match('A', 'B')]);
    expect(html).toContain('Coupe &lt;Équipes&gt;');
    expect(html).not.toContain('<Équipes>');
    expect(html).toContain('45 – 30');
    expect(html).toContain('Tireur A1');
    expect(html).toContain('5 – 3');
    expect(html).toContain('Relais G');
  });

  it('HTML poules format arène : poules A/B, points cumulés', () => {
    const teams = ['A', 'B', 'C', 'D'].map(team);
    const html = generateTeamPoolsHTML(opts(teams, true), [
      match('A', 'B', { poolNumber: 1 }),
      match('C', 'D', { poolNumber: 2 }),
    ]);
    expect(html).toContain('Poule A');
    expect(html).toContain('Poule B');
    expect(html).toContain('Points+');
    expect(html).toContain('5 – 3'); // score arène = somme des assauts
  });

  it('HTML tableau : tours, exempt et matchs', () => {
    const teams = ['A', 'B', 'C'].map(team); // tableau de 4 : seed 1 exempt
    const html = generateTeamTableauHTML(opts(teams), teams, []);
    expect(html).toContain('Demi-finales');
    expect(html).toContain('Finale');
    expect(html).toContain('Équipe A — exempt');
    expect(html).toContain(': À jouer');
  });

  it('HTML classement : rangs et tireurs titulaires', () => {
    const teams = ['A', 'B', 'C', 'D'].map(team);
    const html = generateTeamRankingHTML(opts(teams), teams, tableau4(teams, ['A', 'B'], 'A'));
    expect(html).toContain('Classement équipes —');
    expect(html).toContain('NOMA1 P');
  });

  it('export : passe par savePDF (dialogue + impression HTML)', async () => {
    const printHtmlToPDF = vi.fn().mockResolvedValue({ success: true });
    (globalThis as any).window = {
      electronAPI: {
        dialog: { saveFile: vi.fn().mockResolvedValue({ filePath: '/tmp/x.pdf' }) },
        file: { printHtmlToPDF },
      },
    };
    await exportTeamPoolsToPDF(opts(['A', 'B'].map(team)), [match('A', 'B')]);
    expect(printHtmlToPDF).toHaveBeenCalledWith(
      expect.stringContaining('<!DOCTYPE html>'),
      '/tmp/x.pdf'
    );
  });

  it('export sans rencontre : erreur explicite', async () => {
    await expect(exportTeamPoolsToPDF(opts([]), [])).rejects.toThrow('Aucune rencontre');
  });
});
