/**
 * BellePoule Modern - Journal des événements par épreuve (#1980)
 * Ajout seul ; une révision croissante par épreuve. Les événements portent des
 * identifiants, jamais de noms (RGPD #1882) ; purge et archive .bpm suivent competition_id.
 * Licensed under GPL-3.0
 */
import type { SqlExecutor } from './sqlExecutor';

/** Origine d'une écriture */
export type EventSource = 'screen' | 'mcp' | 'tablet' | 'cyrano' | 'engine';

export interface NewCompetitionEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface CompetitionEvent extends NewCompetitionEvent {
  competitionId: string;
  revision: number;
  author: string | null;
  source: EventSource;
  at: string;
}

export interface EventAuthor {
  source: EventSource;
  author?: string;
}

interface Row {
  competition_id: string;
  revision: number;
  type: string;
  payload: string;
  author: string | null;
  source: string;
  at: string;
}

const MAX_PAGE = 5000;

function toEvent(r: Row): CompetitionEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(r.payload) as Record<string, unknown>;
  } catch {
    /* charge illisible : vide */
  }
  return {
    competitionId: r.competition_id,
    revision: Number(r.revision),
    type: r.type,
    payload,
    author: r.author,
    source: r.source as EventSource,
    at: r.at,
  };
}

export class EventLogRepo {
  constructor(private readonly sql: SqlExecutor) {}

  /** Dernière révision de l'épreuve (0 : journal vide) */
  public getRevision(competitionId: string): number {
    if (!this.sql.db) return 0;
    const row = this.sql.queryOne<{ r: number | null }>(
      'SELECT MAX(revision) AS r FROM competition_events WHERE competition_id = ?',
      [competitionId]
    );
    return Number(row?.r ?? 0);
  }

  /** Ajoute des événements à la suite ; rend la dernière révision */
  public append(
    competitionId: string,
    events: NewCompetitionEvent[],
    by: EventAuthor,
    at = new Date().toISOString()
  ): number {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql.transaction(() => {
      let revision = this.getRevision(competitionId);
      for (const e of events) {
        revision += 1;
        this.sql.run(
          `INSERT INTO competition_events
             (competition_id, revision, type, payload, author, source, at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            competitionId,
            revision,
            e.type,
            JSON.stringify(e.payload ?? {}),
            by.author ?? null,
            by.source,
            at,
          ]
        );
      }
      return revision;
    });
  }

  /** Événements postérieurs à `since`, par révision croissante */
  public getSince(competitionId: string, since = 0, limit = 1000): CompetitionEvent[] {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<Row>(
      `SELECT competition_id, revision, type, payload, author, source, at
         FROM competition_events
        WHERE competition_id = ? AND revision > ?
        ORDER BY revision
        LIMIT ?`,
      [competitionId, since, Math.max(1, Math.min(limit, MAX_PAGE))]
    );
    return rows.map(toEvent);
  }

  /** Historique d'un match (audit) : événements dont la charge porte ce matchId */
  public getMatchHistory(competitionId: string, matchId: string): CompetitionEvent[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<Row>(
        `SELECT competition_id, revision, type, payload, author, source, at
           FROM competition_events
          WHERE competition_id = ? AND json_extract(payload, '$.matchId') = ?
          ORDER BY revision`,
        [competitionId, matchId]
      )
      .map(toEvent);
  }
}
