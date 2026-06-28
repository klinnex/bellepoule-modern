import { describe, it, expect } from 'vitest';
import {
  exportRankingCSV,
  exportResultsXMLFFE,
  exportDetailedStatsCSV,
  describeMatchEvent,
  exportMatchTimelineJSON,
  exportResultsHTML,
} from './multiFormatExport';
import {
  Competition,
  Fencer,
  FencerStatus,
  Gender,
  Match,
  MatchEventEntry,
  MatchStatus,
  Pool,
  PoolRanking,
  Weapon,
  Category,
} from '../types';

// ============================================================================
// Helpers
// ============================================================================

const makeFencer = (id: string, ref: number, overrides: Partial<Fencer> = {}): Fencer => ({
  id,
  ref,
  lastName: 'Dupont',
  firstName: 'Jean',
  gender: Gender.MALE,
  nationality: 'FRA',
  club: 'Club Paris',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeRanking = (fencer: Fencer, overrides: Partial<PoolRanking> = {}): PoolRanking => ({
  fencer,
  rank: 1,
  victories: 3,
  defeats: 1,
  matchesPlayed: 4,
  touchesScored: 20,
  touchesReceived: 12,
  index: 8,
  ratio: 0.75,
  ...overrides,
});

const makeCompetition = (overrides: Partial<Competition> = {}): Competition => ({
  id: 'comp-1',
  title: 'Championnat Test',
  date: new Date('2026-03-15'),
  weapon: Weapon.EPEE,
  gender: Gender.MALE,
  category: Category.SENIOR,
  color: '#3B82F6',
  fencers: [],
  referees: [],
  phases: [],
  currentPhaseIndex: 0,
  isTeamEvent: false,
  status: 'in_progress',
  settings: {
    defaultPoolMaxScore: 5,
    defaultTableMaxScore: 15,
    defaultPoolTimerSeconds: 180,
    defaultTableTimerSeconds: 180,
    poolRounds: 1,
    hasDirectElimination: true,
    thirdPlaceMatch: false,
    manualRanking: false,
    defaultRanking: 9999,
    randomScore: false,
    minTeamSize: 3,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ============================================================================
// exportRankingCSV
// ============================================================================

describe('exportRankingCSV', () => {
  it('includes header row', () => {
    const csv = exportRankingCSV([]);
    expect(csv).toContain('Rang');
    expect(csv).toContain('Nom');
    expect(csv).toContain('V');
    expect(csv).toContain('TD');
  });

  it('uses semicolon as separator', () => {
    const f = makeFencer('f1', 1);
    const csv = exportRankingCSV([makeRanking(f)]);
    expect(csv).toContain(';');
  });

  it('assigns sequential rank numbers', () => {
    const rankings = [
      makeRanking(makeFencer('f1', 1)),
      makeRanking(makeFencer('f2', 2)),
      makeRanking(makeFencer('f3', 3)),
    ];
    const csv = exportRankingCSV(rankings);
    const lines = csv.trim().split('\n');
    // header + 3 data rows
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^1;/);
    expect(lines[2]).toMatch(/^2;/);
    expect(lines[3]).toMatch(/^3;/);
  });

  it('marks FORFAIT fencer with F', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.FORFAIT });
    const csv = exportRankingCSV([makeRanking(f)]);
    expect(csv).toContain(';F;');
  });

  it('marks EXCLUDED fencer with X', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.EXCLUDED });
    const csv = exportRankingCSV([makeRanking(f)]);
    expect(csv).toContain(';X;');
  });

  it('marks ABANDONED fencer with A', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.ABANDONED });
    const csv = exportRankingCSV([makeRanking(f)]);
    expect(csv).toContain(';A;');
  });

  it('normal fencer has empty status cell', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.QUALIFIED });
    const csv = exportRankingCSV([makeRanking(f)]);
    // Status column should be empty (;;)
    expect(csv).toContain(';;');
  });

  it('outputs Excel formula when includeFormulas=true', () => {
    const f = makeFencer('f1', 1);
    const csv = exportRankingCSV([makeRanking(f)], true);
    expect(csv).toContain('=H');
  });

  it('outputs numeric index when includeFormulas=false', () => {
    const f = makeFencer('f1', 1);
    const csv = exportRankingCSV([makeRanking(f, { index: 8 })], false);
    expect(csv).toContain(';8');
  });

  it('handles empty ranking list', () => {
    const csv = exportRankingCSV([]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1); // header only
  });
});

// ============================================================================
// exportResultsXMLFFE
// ============================================================================

describe('exportResultsXMLFFE', () => {
  it('produces valid XML declaration', () => {
    const comp = makeCompetition();
    const xml = exportResultsXMLFFE(comp, [], []);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it('includes competition title', () => {
    const comp = makeCompetition({ title: 'Grand Prix' });
    const xml = exportResultsXMLFFE(comp, [], []);
    expect(xml).toContain('TitreLong="Grand Prix"');
  });

  it('includes fencer data', () => {
    const f = makeFencer('f1', 1, { ref: 42, lastName: 'Martin', firstName: 'Pierre' });
    const xml = exportResultsXMLFFE(makeCompetition(), [makeRanking(f)], []);
    expect(xml).toContain('Nom="Martin"');
    expect(xml).toContain('Prenom="Pierre"');
  });

  it('escapes XML special chars in title', () => {
    const comp = makeCompetition({ title: 'Test & "Comp" <2026>' });
    const xml = exportResultsXMLFFE(comp, [], []);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&quot;');
  });

  it('uses final rank from finalResults when available', () => {
    const f = makeFencer('f1', 1);
    const poolRanking = [makeRanking(f, { rank: 3 })];
    const finalResults = [{ rank: 1, fencer: f }];
    const xml = exportResultsXMLFFE(makeCompetition(), poolRanking, finalResults);
    expect(xml).toContain('RangFinal="1"');
  });

  it('uses CompetitionIndividuelle root tag', () => {
    const xml = exportResultsXMLFFE(makeCompetition(), [], []);
    expect(xml).toContain('<CompetitionIndividuelle');
    expect(xml).toContain('</CompetitionIndividuelle>');
  });

  it('uses CompetitionParEquipe root tag for team events', () => {
    const comp = makeCompetition({ isTeamEvent: true });
    const xml = exportResultsXMLFFE(comp, [], []);
    expect(xml).toContain('<CompetitionParEquipe');
    expect(xml).toContain('</CompetitionParEquipe>');
  });

  it('includes pool phase when pools provided', () => {
    const comp = makeCompetition();
    const f1 = makeFencer('f1', 1, { ref: 1 });
    const f2 = makeFencer('f2', 2, { ref: 2 });
    const match: Match = {
      id: 'm1',
      number: 1,
      fencerA: f1,
      fencerB: f2,
      scoreA: { value: 5, isVictory: true, isAbstention: false, isExclusion: false, isForfait: false },
      scoreB: { value: 3, isVictory: false, isAbstention: false, isExclusion: false, isForfait: false },
      maxScore: 5,
      status: MatchStatus.FINISHED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const pool: Pool = {
      id: 'p1',
      number: 1,
      phaseId: 'ph1',
      fencers: [f1, f2],
      matches: [match],
      referees: [],
      isComplete: true,
      hasError: false,
      ranking: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const xml = exportResultsXMLFFE(comp, [makeRanking(f1), makeRanking(f2)], [], [pool]);
    expect(xml).toContain('<TourDePoules');
    expect(xml).toContain('<Match');
  });

  it('includes elimination bracket when tableauMatches provided', () => {
    const f1 = makeFencer('f1', 1, { ref: 1 });
    const f2 = makeFencer('f2', 2, { ref: 2 });
    const poolRanking = [makeRanking(f1, { rank: 1 }), makeRanking(f2, { rank: 2 })];
    const tableauMatches = [
      { round: 2, fencerA: f1, fencerB: f2, scoreA: 15, scoreB: 10, isBye: false },
    ];
    const xml = exportResultsXMLFFE(makeCompetition(), poolRanking, [], undefined, tableauMatches);
    expect(xml).toContain('<PhaseDeTableaux');
    expect(xml).toContain('<Tableau ID="A2"');
    expect(xml).toContain('REF="1" Score="15" Statut="V"');
    expect(xml).toContain('REF="2" Score="10" Statut="D"');
  });

  it('maps ABANDONED to A', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.ABANDONED });
    const xml = exportResultsXMLFFE(makeCompetition(), [makeRanking(f)], []);
    expect(xml).toContain('Statut="A"');
  });

  it('maps EXCLUDED to X', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.EXCLUDED });
    const xml = exportResultsXMLFFE(makeCompetition(), [makeRanking(f)], []);
    expect(xml).toContain('Statut="X"');
  });

  it('maps FORFAIT to F', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.FORFAIT });
    const xml = exportResultsXMLFFE(makeCompetition(), [makeRanking(f)], []);
    expect(xml).toContain('Statut="F"');
  });

  it('maps ELIMINATED to E', () => {
    const f = makeFencer('f1', 1, { status: FencerStatus.ELIMINATED });
    const xml = exportResultsXMLFFE(makeCompetition(), [makeRanking(f)], []);
    expect(xml).toContain('Statut="E"');
  });

});

// ============================================================================
// exportDetailedStatsCSV
// ============================================================================

describe('exportDetailedStatsCSV', () => {
  it('includes competition title in header', () => {
    const comp = makeCompetition({ title: 'Test Cup' });
    const csv = exportDetailedStatsCSV(comp, [], []);
    expect(csv).toContain('Test Cup');
  });

  it('includes VMoy and DMoy columns', () => {
    const csv = exportDetailedStatsCSV(makeCompetition(), [], []);
    expect(csv).toContain('VMoy');
    expect(csv).toContain('DMoy');
  });

  it('calculates average correctly (3V 1D → 75%)', () => {
    const f = makeFencer('f1', 1);
    const ranking = makeRanking(f, { victories: 3, defeats: 1 });
    const csv = exportDetailedStatsCSV(makeCompetition(), [], [ranking]);
    expect(csv).toContain('75.0');
  });

  it('handles zero matches without division error', () => {
    const f = makeFencer('f1', 1);
    const ranking = makeRanking(f, { victories: 0, defeats: 0, matchesPlayed: 0 });
    expect(() =>
      exportDetailedStatsCSV(makeCompetition(), [], [ranking])
    ).not.toThrow();
  });
});

// ============================================================================
// describeMatchEvent
// ============================================================================

describe('describeMatchEvent', () => {
  const base: Omit<MatchEventEntry, 'eventType'> = {
    id: 'e1',
    matchId: 'm1',
    timestamp: '2026-01-01T10:00:00Z',
    fencerId: null,
    fencerLastName: null,
    fencerFirstName: null,
    fencerSide: null,
    previousScoreA: null,
    previousScoreB: null,
    newScoreA: null,
    newScoreB: null,
    changedBy: null,
    refereeName: null,
    ipAddress: null,
    changeReason: null,
    zone: null,
    points: null,
    cardType: null,
    cardReason: null,
    cardGroup: null,
    resultingExclusion: null,
    exitType: null,
  };

  it('describes touch event with zone and points', () => {
    const entry: MatchEventEntry = { ...base, eventType: 'touch', zone: 'C', points: 5 };
    expect(describeMatchEvent(entry)).toContain('Zone C');
    expect(describeMatchEvent(entry)).toContain('5');
  });

  it('describes card event without exclusion', () => {
    const entry: MatchEventEntry = {
      ...base,
      eventType: 'card',
      cardType: 'yellow',
      cardReason: 'time_wasting',
      resultingExclusion: false,
    };
    const desc = describeMatchEvent(entry);
    expect(desc).toContain('yellow');
    expect(desc).not.toContain('exclusion');
  });

  it('describes card event with exclusion', () => {
    const entry: MatchEventEntry = {
      ...base,
      eventType: 'card',
      cardType: 'black',
      cardReason: 'brutality',
      resultingExclusion: true,
    };
    expect(describeMatchEvent(entry)).toContain('exclusion');
  });

  it('describes voluntary arena exit', () => {
    const entry: MatchEventEntry = {
      ...base,
      eventType: 'arena_exit',
      exitType: 'arena_exit_voluntary',
      points: 1,
    };
    expect(describeMatchEvent(entry)).toContain('Sortie volontaire');
  });

  it('describes non-voluntary arena exit', () => {
    const entry: MatchEventEntry = {
      ...base,
      eventType: 'arena_exit',
      exitType: 'arena_exit',
      points: 1,
    };
    expect(describeMatchEvent(entry)).toContain("Sortie d'arène");
  });

  it('describes score_change with scores and referee', () => {
    const entry: MatchEventEntry = {
      ...base,
      eventType: 'score_change',
      previousScoreA: { value: 3 },
      previousScoreB: { value: 2 },
      newScoreA: { value: 4 },
      newScoreB: { value: 2 },
      refereeName: 'Ref Dupont',
    };
    const desc = describeMatchEvent(entry);
    expect(desc).toContain('3/2');
    expect(desc).toContain('4/2');
    expect(desc).toContain('Ref Dupont');
  });

  it('returns empty string for unknown event type', () => {
    const entry: MatchEventEntry = { ...base, eventType: 'unknown' as any };
    expect(describeMatchEvent(entry)).toBe('');
  });
});

// ============================================================================
// exportMatchTimelineJSON
// ============================================================================

describe('exportMatchTimelineJSON', () => {
  it('produces valid JSON', () => {
    const json = exportMatchTimelineJSON([], 'Match 1');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes title and event count', () => {
    const json = exportMatchTimelineJSON([], 'Match 1');
    const parsed = JSON.parse(json);
    expect(parsed.title).toBe('Match 1');
    expect(parsed.eventCount).toBe(0);
  });

  it('includes competition name when provided', () => {
    const json = exportMatchTimelineJSON([], 'Match 1', 'Grand Prix 2026');
    const parsed = JSON.parse(json);
    expect(parsed.competitionName).toBe('Grand Prix 2026');
  });

  it('sets competitionName to null when omitted', () => {
    const json = exportMatchTimelineJSON([], 'Match 1');
    const parsed = JSON.parse(json);
    expect(parsed.competitionName).toBeNull();
  });

  it('includes exportedAt ISO timestamp', () => {
    const json = exportMatchTimelineJSON([], 'Match 1');
    const parsed = JSON.parse(json);
    expect(parsed.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// exportResultsHTML
// ============================================================================

describe('exportResultsHTML', () => {
  it('returns valid HTML structure', () => {
    const html = exportResultsHTML(makeCompetition(), [], []);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes competition title', () => {
    const comp = makeCompetition({ title: 'Coupe de France' });
    const html = exportResultsHTML(comp, [], []);
    expect(html).toContain('Coupe de France');
  });

  it('includes ranking table headers', () => {
    const html = exportResultsHTML(makeCompetition(), [], []);
    expect(html).toContain('Classement des Poules');
    expect(html).toContain('Classement Final');
  });

  it('renders fencer row in final results', () => {
    const f = makeFencer('f1', 1, { lastName: 'Renard', firstName: 'Alice' });
    const html = exportResultsHTML(makeCompetition(), [], [{ rank: 1, fencer: f }]);
    expect(html).toContain('Renard');
    expect(html).toContain('Alice');
  });

  it('renders pool ranking row', () => {
    const f = makeFencer('f1', 1, { lastName: 'Bernard' });
    const html = exportResultsHTML(makeCompetition(), [makeRanking(f)], []);
    expect(html).toContain('Bernard');
  });
});
