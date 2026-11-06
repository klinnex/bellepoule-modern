import { Card } from '../../shared/types';
import type { SqlExecutor } from './sqlExecutor';

/** Équipes, rencontres, assauts et cartons par équipe (#1242) */
export class TeamRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // ─── Équipes (compétitions par équipes) ─────────────────────────────────────

  public createTeam(competitionId: string, name: string, club: string): { id: string } {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const id = gen();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO teams (id, competition_id, name, club, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, competitionId, name, club, now, now]
    );
    return { id };
  }

  public getTeamsByCompetition(competitionId: string): Array<{
    id: string;
    name: string;
    club: string;
    fencers: Array<{
      fencerId: string;
      fencerLastName: string;
      fencerFirstName: string;
      teamOrder: number;
      isReserve: boolean;
    }>;
  }> {
    if (!this.sql.db) return [];
    const teams = this.sql.queryAll<any>(
      'SELECT * FROM teams WHERE competition_id = ? ORDER BY name',
      [competitionId]
    );
    return teams.map(t => {
      const fencers = this.sql.queryAll<any>(
        `SELECT tf.fencer_id, tf.team_order, tf.is_reserve, f.last_name, f.first_name
         FROM team_fencers tf JOIN fencers f ON tf.fencer_id = f.id
         WHERE tf.team_id = ? ORDER BY tf.team_order`,
        [t.id]
      );
      return {
        id: t.id as string,
        name: t.name as string,
        club: t.club as string,
        fencers: fencers.map(f => ({
          fencerId: f.fencer_id as string,
          fencerLastName: f.last_name as string,
          fencerFirstName: f.first_name as string,
          teamOrder: Number(f.team_order),
          isReserve: f.is_reserve === 1,
        })),
      };
    });
  }

  public deleteTeam(teamId: string): void {
    if (!this.sql.db) return;
    this.sql.run('DELETE FROM teams WHERE id = ?', [teamId]);
  }

  public upsertTeamFencer(
    teamId: string,
    fencerId: string,
    teamOrder: number,
    isReserve: boolean
  ): void {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    this.sql.run(
      `INSERT INTO team_fencers (id, team_id, fencer_id, team_order, is_reserve)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(team_id, fencer_id) DO UPDATE SET team_order = excluded.team_order, is_reserve = excluded.is_reserve`,
      [gen(), teamId, fencerId, teamOrder, isReserve ? 1 : 0]
    );
  }

  public removeTeamFencer(teamId: string, fencerId: string): void {
    if (!this.sql.db) return;
    this.sql.run('DELETE FROM team_fencers WHERE team_id = ? AND fencer_id = ?', [
      teamId,
      fencerId,
    ]);
  }

  // `round` : calendrier de poule figé (format arène Sabre Laser, 8/12 équipes)
  // — optionnel, reste `NULL` pour la génération round-robin générique existante.
  public createTeamMatch(
    competitionId: string,
    poolNumber: number,
    teamAId: string,
    teamBId: string,
    round?: number
  ): { id: string } {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const matchId = gen();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO team_matches (id, competition_id, pool_number, round, team_a_id, team_b_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?)`,
      [matchId, competitionId, poolNumber, round ?? null, teamAId, teamBId, now, now]
    );
    return { id: matchId };
  }

  public createTeamTableauMatch(
    competitionId: string,
    tableId: string,
    round: number,
    position: number,
    teamAId: string,
    teamBId: string
  ): { id: string } {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const matchId = gen();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO team_matches (id, competition_id, pool_number, team_a_id, team_b_id, status, table_id, round, position, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, 'not_started', ?, ?, ?, ?, ?)`,
      [matchId, competitionId, teamAId, teamBId, tableId, round, position, now, now]
    );
    return { id: matchId };
  }

  public getTeamTableauMatches(
    competitionId: string,
    tableId: string
  ): Array<{
    id: string;
    round: number;
    position: number;
    teamAId: string;
    teamBId: string;
    scoreBoutsA: number;
    scoreBoutsB: number;
    status: string;
    winnerId: string | null;
    currentBoutIndex: number;
    bouts: Array<{
      id: string;
      boutOrder: number;
      fencerAId: string;
      fencerBId: string;
      scoreA: number;
      scoreB: number;
      maxScore: number;
      status: string;
      winnerId: string | null;
    }>;
  }> {
    if (!this.sql.db) return [];
    const matches = this.sql.queryAll<any>(
      'SELECT * FROM team_matches WHERE competition_id = ? AND table_id = ? ORDER BY round DESC, position',
      [competitionId, tableId]
    );
    return matches.map(m => {
      const bouts = this.sql.queryAll<any>(
        'SELECT * FROM team_bouts WHERE match_id = ? ORDER BY bout_order',
        [m.id]
      );
      return {
        id: m.id as string,
        round: Number(m.round),
        position: Number(m.position),
        teamAId: m.team_a_id as string,
        teamBId: m.team_b_id as string,
        scoreBoutsA: Number(m.score_bouts_a),
        scoreBoutsB: Number(m.score_bouts_b),
        status: m.status as string,
        winnerId: (m.winner_id as string) ?? null,
        currentBoutIndex: Number(m.current_bout_index),
        bouts: bouts.map(b => ({
          id: b.id as string,
          boutOrder: Number(b.bout_order),
          fencerAId: b.fencer_a_id as string,
          fencerBId: b.fencer_b_id as string,
          scoreA: Number(b.score_a),
          scoreB: Number(b.score_b),
          maxScore: Number(b.max_score),
          status: b.status as string,
          winnerId: (b.winner_id as string) ?? null,
        })),
      };
    });
  }

  public getTeamMatchesByCompetition(competitionId: string): Array<{
    id: string;
    poolNumber: number;
    round: number | null;
    teamAId: string;
    teamBId: string;
    scoreBoutsA: number;
    scoreBoutsB: number;
    status: string;
    winnerId: string | null;
    currentBoutIndex: number;
    bouts: Array<{
      id: string;
      boutOrder: number;
      fencerAId: string;
      fencerBId: string;
      scoreA: number;
      scoreB: number;
      maxScore: number;
      status: string;
      winnerId: string | null;
    }>;
  }> {
    if (!this.sql.db) return [];
    const matches = this.sql.queryAll<any>(
      'SELECT * FROM team_matches WHERE competition_id = ? AND table_id IS NULL ORDER BY pool_number, created_at',
      [competitionId]
    );
    return matches.map(m => {
      const bouts = this.sql.queryAll<any>(
        'SELECT * FROM team_bouts WHERE match_id = ? ORDER BY bout_order',
        [m.id]
      );
      return {
        id: m.id as string,
        poolNumber: Number(m.pool_number),
        round: m.round != null ? Number(m.round) : null,
        teamAId: m.team_a_id as string,
        teamBId: m.team_b_id as string,
        scoreBoutsA: Number(m.score_bouts_a),
        scoreBoutsB: Number(m.score_bouts_b),
        status: m.status as string,
        winnerId: (m.winner_id as string) ?? null,
        currentBoutIndex: Number(m.current_bout_index),
        bouts: bouts.map(b => ({
          id: b.id as string,
          boutOrder: Number(b.bout_order),
          fencerAId: b.fencer_a_id as string,
          fencerBId: b.fencer_b_id as string,
          scoreA: Number(b.score_a),
          scoreB: Number(b.score_b),
          maxScore: Number(b.max_score),
          status: b.status as string,
          winnerId: (b.winner_id as string) ?? null,
        })),
      };
    });
  }

  public createTeamBout(
    matchId: string,
    boutOrder: number,
    fencerAId: string,
    fencerBId: string,
    maxScore: number
  ): { id: string } {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const id = gen();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO team_bouts (id, match_id, bout_order, fencer_a_id, fencer_b_id, max_score, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?)`,
      [id, matchId, boutOrder, fencerAId, fencerBId, maxScore, now, now]
    );
    return { id };
  }

  public updateTeamBout(
    boutId: string,
    scoreA: number,
    scoreB: number,
    status: string,
    winnerId: string | null
  ): void {
    if (!this.sql.db) return;
    const now = new Date().toISOString();
    this.sql.run(
      `UPDATE team_bouts SET score_a = ?, score_b = ?, status = ?, winner_id = ?, updated_at = ? WHERE id = ?`,
      [scoreA, scoreB, status, winnerId, now, boutId]
    );
    // Recompute match bouts score if bout finished
    if (status === 'finished') {
      const bout = this.sql.queryOne<any>('SELECT match_id FROM team_bouts WHERE id = ?', [boutId]);
      if (bout) this.recomputeTeamMatchScore(bout.match_id as string);
    }
  }

  private recomputeTeamMatchScore(matchId: string): void {
    const match = this.sql.queryOne<any>(
      'SELECT team_a_id, team_b_id FROM team_matches WHERE id = ?',
      [matchId]
    );
    if (!match) return;

    const allBouts = this.sql.queryAll<any>(
      'SELECT status, score_a, score_b FROM team_bouts WHERE match_id = ? ORDER BY bout_order',
      [matchId]
    );
    // Score équipe = total des touches cumulées sur tous les relais (règle FIE),
    // pas le nombre d'assauts individuellement gagnés.
    const scoreA = allBouts.reduce((sum, b) => sum + Number(b.score_a), 0);
    const scoreB = allBouts.reduce((sum, b) => sum + Number(b.score_b), 0);
    const finishedCount = allBouts.filter(b => b.status === 'finished').length;
    const allFinished = allBouts.length > 0 && finishedCount === allBouts.length;
    const newStatus = allFinished ? 'finished' : finishedCount > 0 ? 'in_progress' : 'not_started';
    const winnerId = allFinished
      ? scoreA > scoreB
        ? match.team_a_id
        : scoreB > scoreA
          ? match.team_b_id
          : null
      : null;
    const now = new Date().toISOString();
    this.sql.run(
      `UPDATE team_matches SET score_bouts_a = ?, score_bouts_b = ?, status = ?, winner_id = ?, current_bout_index = ?, updated_at = ? WHERE id = ?`,
      [scoreA, scoreB, newStatus, winnerId, finishedCount, now, matchId]
    );
  }

  // ── Cartons d'équipe "E" (format arène Sabre Laser) ─────────────────────────
  // Traçabilité uniquement : ces cartons n'affectent pas encore le score
  // (impact en points pas encore tranché par le règlement).

  public createTeamMatchCard(
    matchId: string,
    teamId: string,
    type: 'white' | 'yellow' | 'red' | 'black',
    reason: string
  ): { id: string } {
    if (!this.sql.db) throw new Error('Database not open');
    const { v4: gen } = require('uuid');
    const id = gen();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO team_match_cards (id, match_id, team_id, type, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, matchId, teamId, type, reason, now]
    );
    return { id };
  }

  // ── Cartons individuels des relais par équipes (#1086) ─────────────────────

  public createTeamBoutCard(boutId: string, card: Card): { id: string } {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run(
      `INSERT INTO team_bout_cards (id, match_id, bout_id, fencer_id, card_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.matchId,
        boutId,
        card.fencerId,
        JSON.stringify(card),
        new Date(card.timestamp).toISOString(),
      ]
    );
    return { id: card.id };
  }

  /** Cartons d'une rencontre, groupés par relais (ordre chronologique). */
  public getTeamBoutCards(matchId: string): Array<{ boutId: string; card: Card }> {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<{ bout_id: string; card_json: string }>(
      'SELECT bout_id, card_json FROM team_bout_cards WHERE match_id = ? ORDER BY created_at',
      [matchId]
    );
    return rows.map(r => {
      const card = JSON.parse(r.card_json) as Card;
      return {
        boutId: r.bout_id,
        card: { ...card, timestamp: new Date(card.timestamp) },
      };
    });
  }

  public getTeamMatchCards(matchId: string): Array<{
    id: string;
    matchId: string;
    teamId: string;
    type: string;
    reason: string;
    createdAt: string;
  }> {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<any>(
      'SELECT * FROM team_match_cards WHERE match_id = ? ORDER BY created_at',
      [matchId]
    );
    return rows.map(r => ({
      id: r.id as string,
      matchId: r.match_id as string,
      teamId: r.team_id as string,
      type: r.type as string,
      reason: r.reason as string,
      createdAt: r.created_at as string,
    }));
  }

  // ── Format arène Sabre Laser : saisie temps réel (tablette arbitre) ─────────
  // Résout un match d'équipe avec noms d'équipes/tireurs pour la diffusion en
  // direct, sans que le renderer ait à repousser ces données via IPC : le
  // serveur de score distant lit directement la DB (il en a déjà l'accès).

  public getTeamMatchDetail(matchId: string): {
    id: string;
    competitionId: string;
    teamAId: string;
    teamAName: string;
    teamBId: string;
    teamBName: string;
    status: string;
    currentBoutIndex: number;
    bouts: Array<{
      id: string;
      boutOrder: number;
      fencerAId: string;
      fencerAName: string;
      fencerBId: string;
      fencerBName: string;
      scoreA: number;
      scoreB: number;
      maxScore: number;
      status: string;
      winnerId: string | null;
    }>;
  } | null {
    if (!this.sql.db) return null;
    const m = this.sql.queryOne<any>('SELECT * FROM team_matches WHERE id = ?', [matchId]);
    if (!m) return null;
    const teamA = this.sql.queryOne<any>('SELECT name FROM teams WHERE id = ?', [m.team_a_id]);
    const teamB = this.sql.queryOne<any>('SELECT name FROM teams WHERE id = ?', [m.team_b_id]);
    const bouts = this.sql.queryAll<any>(
      `SELECT b.*, fa.last_name AS fa_last, fa.first_name AS fa_first, fb.last_name AS fb_last, fb.first_name AS fb_first
       FROM team_bouts b
       JOIN fencers fa ON b.fencer_a_id = fa.id
       JOIN fencers fb ON b.fencer_b_id = fb.id
       WHERE b.match_id = ? ORDER BY b.bout_order`,
      [matchId]
    );
    return {
      id: m.id as string,
      competitionId: m.competition_id as string,
      teamAId: m.team_a_id as string,
      teamAName: (teamA?.name as string) ?? '—',
      teamBId: m.team_b_id as string,
      teamBName: (teamB?.name as string) ?? '—',
      status: m.status as string,
      currentBoutIndex: Number(m.current_bout_index),
      bouts: bouts.map(b => ({
        id: b.id as string,
        boutOrder: Number(b.bout_order),
        fencerAId: b.fencer_a_id as string,
        fencerAName: `${b.fa_last} ${b.fa_first ?? ''}`.trim(),
        fencerBId: b.fencer_b_id as string,
        fencerBName: `${b.fb_last} ${b.fb_first ?? ''}`.trim(),
        scoreA: Number(b.score_a),
        scoreB: Number(b.score_b),
        maxScore: Number(b.max_score),
        status: b.status as string,
        winnerId: (b.winner_id as string) ?? null,
      })),
    };
  }
}
