/**
 * Conversion des lignes SQLite en objets du domaine, partagée par les dépôts (#1242).
 */
import {
  Competition,
  CompetitionSettings,
  Fencer,
  FencerStatus,
  ExclusionReason,
  Gender,
  Weapon,
  Category,
  MatchStatus,
  Referee,
  MatchEventEntry,
  MatchEventType,
} from '../../shared/types';
import { safeJsonParse } from './dbUtils';

export function parseCompetitionRow(row: any): Competition {
  try {
    let settings: CompetitionSettings = {
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 21,
      defaultPoolTimerSeconds: 180,
      defaultTableTimerSeconds: 180,
      poolRounds: 1,
      hasDirectElimination: true,
      thirdPlaceMatch: true,
      signTableauMatches: false,
      blackCardEnabled: false,
      manualRanking: false,
      defaultRanking: 0,
      randomScore: false,
      minTeamSize: 3,
    };
    if (row.settings) {
      try {
        settings = JSON.parse(row.settings as string);
      } catch (e) {
        console.error('DB: Failed to parse settings JSON:', e);
      }
    }
    return {
      id: row.id as string,
      title: row.title as string,
      shortTitle: row.short_title as string,
      date: row.date ? new Date(row.date as string) : new Date(),
      location: row.location as string,
      organizer: row.organizer as string,
      weapon: row.weapon as Weapon,
      gender: row.gender as Gender,
      category: row.category as Category,
      championship: row.championship as string,
      color: row.color as string,
      currentPhaseIndex: row.current_phase_index as number,
      isTeamEvent: row.is_team_event === 1,
      status: row.status as any,
      settings,
      fencers: [],
      referees: [],
      phases: [],
      createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
      updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
    };
  } catch (error) {
    console.error('DB: Error parsing competition data:', error);
    throw error;
  }
}

export function parseFencerRow(row: any): Fencer {
  let poolStats = undefined;
  if (row.pool_stats) {
    try {
      poolStats = JSON.parse(row.pool_stats as string);
    } catch {
      console.error('DB: Failed to parse pool_stats JSON for fencer', row.id);
    }
  }
  return {
    id: row.id as string,
    ref: row.ref as number,
    lastName: row.last_name as string,
    firstName: row.first_name as string,
    birthDate: row.birth_date ? new Date(row.birth_date as string) : undefined,
    gender: row.gender as Gender,
    nationality: row.nationality as string,
    region: row.region as string,
    club: row.club as string,
    license: row.license as string,
    ranking: row.ranking as number,
    status: row.status as FencerStatus,
    exclusionReason: (row.exclusion_reason as ExclusionReason) || undefined,
    seedNumber: row.seed_number as number,
    finalRanking: row.final_ranking as number,
    poolStats,
    photo: (row.photo as string) || undefined,
    createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
  };
}

// Corrige un statut de match incohérent au chargement.
// - 2 scores présents → FINISHED (le match a été joué)
// - in_progress sans aucun score → NOT_STARTED (tablette/strip fermé avant toute saisie ;
//   évite que les premiers matchs réapparaissent « en cours » au redémarrage)
export function healMatchStatus(
  rawStatus: MatchStatus,
  scoreA: unknown,
  scoreB: unknown
): MatchStatus {
  if (scoreA !== null && scoreB !== null && rawStatus !== MatchStatus.FINISHED) {
    return MatchStatus.FINISHED;
  }
  if (rawStatus === MatchStatus.IN_PROGRESS && scoreA === null && scoreB === null) {
    return MatchStatus.NOT_STARTED;
  }
  return rawStatus;
}

export function rowToReferee(row: any): Referee {
  return {
    id: row.id as string,
    ref: row.ref as number,
    lastName: (row.name as string)?.split(' ').slice(-1)[0] ?? '',
    firstName: (row.name as string)?.split(' ').slice(0, -1).join(' ') ?? '',
    gender: (row.gender as Gender) ?? 'M',
    nationality: row.nationality as string,
    club: row.club as string | undefined,
    license: row.license as string | undefined,
    category: row.category as string | undefined,
    status: (row.status as 'available' | 'assigned' | 'unavailable') ?? 'available',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  } as Referee;
}

export function parsePoolRefereeIds(row: {
  referee_id?: unknown;
  referee_ids?: unknown;
}): string[] {
  if (typeof row.referee_ids === 'string' && row.referee_ids) {
    try {
      const parsed = JSON.parse(row.referee_ids);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      /* JSON invalide : repli sur referee_id */
    }
  }
  return row.referee_id ? [row.referee_id as string] : [];
}

export function parseAuditRow(r: any) {
  return {
    id: r.id as string,
    matchId: r.match_id as string,
    arenaId: r.arena_id as string | null,
    poolId: r.pool_id as string | null,
    matchNumber: r.match_number != null ? Number(r.match_number) : null,
    poolNumber: r.pool_number != null ? Number(r.pool_number) : null,
    previousScoreA: safeJsonParse<any>(r.previous_score_a, null, `audit ${r.id}`),
    previousScoreB: safeJsonParse<any>(r.previous_score_b, null, `audit ${r.id}`),
    newScoreA: safeJsonParse<any>(r.new_score_a, null, `audit ${r.id}`),
    newScoreB: safeJsonParse<any>(r.new_score_b, null, `audit ${r.id}`),
    changedBy: r.changed_by as string,
    changedAt: r.changed_at as string,
    reason: r.reason as string | null,
    refereeId: r.referee_id as string | null,
    refereeName: r.referee_name as string | null,
    ipAddress: r.ip_address as string | null,
    tableauRound: r.tableau_round != null && r.pool_number == null ? Number(r.tableau_round) : null,
    tableauPosition:
      r.tableau_position != null && r.pool_number == null ? Number(r.tableau_position) : null,
  };
}

// ─── Match timeline (audit log) ──────────────────────────────────────────────

export function parseTimelineRow(r: any): MatchEventEntry {
  return {
    id: r.id as string,
    matchId: r.match_id as string,
    eventType: r.event_type as MatchEventType,
    timestamp: r.timestamp as string,
    fencerId: (r.fencer_id as string) ?? null,
    fencerLastName: (r.fencer_last_name as string) ?? null,
    fencerFirstName: (r.fencer_first_name as string) ?? null,
    fencerSide: (r.fencer_side as 'A' | 'B') ?? null,
    previousScoreA: safeJsonParse<any>(r.prev_a, null, `event ${r.id}`),
    previousScoreB: safeJsonParse<any>(r.prev_b, null, `event ${r.id}`),
    newScoreA: safeJsonParse<any>(r.new_a, null, `event ${r.id}`),
    newScoreB: safeJsonParse<any>(r.new_b, null, `event ${r.id}`),
    changedBy: (r.changed_by as string) ?? null,
    refereeName: (r.referee_name as string) ?? null,
    ipAddress: (r.ip_address as string) ?? null,
    changeReason: (r.change_reason as string) ?? null,
    zone: (r.zone as string) ?? null,
    points: r.points != null ? Number(r.points) : null,
    cardType: (r.card_type as string) ?? null,
    cardReason: (r.card_reason as string) ?? null,
    cardGroup: r.card_group != null ? Number(r.card_group) : null,
    resultingExclusion: r.resulting_exclusion != null ? r.resulting_exclusion === 1 : null,
    exitType: (r.exit_type as string) ?? null,
  };
}
