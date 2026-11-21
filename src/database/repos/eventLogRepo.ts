/**
 * BellePoule Modern - Journal des événements par épreuve (#1980, format : docs/adr/0007)
 * Ajout seul ; une révision croissante par épreuve (ordre local) et un identifiant unique
 * par événement (event_id, stable entre postes) ; les événements d'une même commande
 * partagent command_id. Les événements portent des identifiants, jamais de noms
 * (RGPD #1882) ; purge et archive .bpm suivent competition_id.
 * Licensed under GPL-3.0
 */
import { v4 as uuidv4 } from 'uuid';
import type { EventSource, JournalEventBody } from '../../shared/api/events';
import type { SqlExecutor } from './sqlExecutor';

export type { EventSource };

/** Événement à écrire : type et charge typés par le contrat (shared/api/events) */
export type NewJournalEvent = Omit<JournalEventBody, 'schemaVersion'> & { schemaVersion?: 1 };

/** Événement stocké */
export type StoredJournalEvent = JournalEventBody & {
  eventId: string;
  commandId: string;
  competitionId: string;
  revision: number;
  author: string | null;
  source: EventSource;
  at: string;
};

export interface EventAuthor {
  source: EventSource;
  author?: string;
}

interface Row {
  event_id: string;
  command_id: string;
  competition_id: string;
  revision: number;
  type: string;
  schema_version: number;
  payload: string;
  author: string | null;
  source: string;
  at: string;
}

const COLUMNS =
  'event_id, command_id, competition_id, revision, type, schema_version, payload, author, source, at';
const MAX_PAGE = 5000;

function toEvent(r: Row): StoredJournalEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(r.payload) as Record<string, unknown>;
  } catch {
    /* charge illisible : vide */
  }
  return {
    eventId: r.event_id,
    commandId: r.command_id,
    competitionId: r.competition_id,
    revision: Number(r.revision),
    type: r.type,
    schemaVersion: Number(r.schema_version),
    payload,
    author: r.author,
    source: r.source as EventSource,
    at: r.at,
  } as StoredJournalEvent;
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

  /** Commande déjà inscrite au journal de l'épreuve (idempotence, ADR-0007) */
  public hasCommand(competitionId: string, commandId: string): boolean {
    if (!this.sql.db) return false;
    return !!this.sql.queryOne(
      'SELECT 1 AS x FROM competition_events WHERE competition_id = ? AND command_id = ? LIMIT 1',
      [competitionId, commandId]
    );
  }

  /** Ajoute les événements d'une commande à la suite ; rend la dernière révision */
  public append(
    competitionId: string,
    events: NewJournalEvent[],
    by: EventAuthor,
    commandId: string = uuidv4(),
    at = new Date().toISOString()
  ): number {
    if (!this.sql.db) throw new Error('Database not open');
    return this.sql.transaction(() => {
      let revision = this.getRevision(competitionId);
      for (const e of events) {
        revision += 1;
        this.sql.run(
          `INSERT INTO competition_events (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            commandId,
            competitionId,
            revision,
            e.type,
            e.schemaVersion ?? 1,
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
  public getSince(competitionId: string, since = 0, limit = 1000): StoredJournalEvent[] {
    if (!this.sql.db) return [];
    const rows = this.sql.queryAll<Row>(
      `SELECT ${COLUMNS} FROM competition_events
        WHERE competition_id = ? AND revision > ?
        ORDER BY revision
        LIMIT ?`,
      [competitionId, since, Math.max(1, Math.min(limit, MAX_PAGE))]
    );
    return rows.map(toEvent);
  }

  /** Historique d'un match (audit) : événements dont la charge porte ce matchId */
  public getMatchHistory(competitionId: string, matchId: string): StoredJournalEvent[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<Row>(
        `SELECT ${COLUMNS} FROM competition_events
          WHERE competition_id = ? AND json_extract(payload, '$.matchId') = ?
          ORDER BY revision`,
        [competitionId, matchId]
      )
      .map(toEvent);
  }
}
