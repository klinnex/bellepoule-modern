import { v4 as uuidv4 } from 'uuid';
import type { Weapon } from '../../shared/types';
import type {
  DayReferee,
  DayRefereeAssignment,
  DayRefereeInput,
  DaySyncResult,
  EventDay,
} from '../../shared/types/eventDay';
import {
  canOfficiate,
  dayRefereeFullName,
  parseWeapons,
  serializeWeapons,
} from '../../shared/utils/eventDay';
import type { SqlExecutor } from './sqlExecutor';
import { parsePoolRefereeIds } from './rowMappers';

interface DayRow {
  id: string;
  name: string;
  date: string;
  strip_count: number | null;
  created_at: string;
  updated_at: string;
}

interface DayRefereeRow {
  id: string;
  event_day_id: string;
  first_name: string | null;
  last_name: string | null;
  club: string | null;
  license: string | null;
  category: string | null;
  weapons: string | null;
  created_at: string;
  updated_at: string;
}

interface CompetitionRefereeRow {
  id: string;
  name: string | null;
  club: string | null;
  license: string | null;
  category: string | null;
  day_referee_id: string | null;
}

interface PoolOccupationRow {
  number: number;
  strip: number | null;
  referee_id: string | null;
  referee_ids: string | null;
  competition_id: string;
  title: string;
}

interface MatchOccupationRow {
  number: number;
  strip: number | null;
  referee_id: string;
  competition_id: string;
  title: string;
}

function rowToDayReferee(row: DayRefereeRow): DayReferee {
  return {
    id: row.id,
    eventDayId: row.event_day_id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    club: row.club ?? undefined,
    license: row.license ?? undefined,
    category: row.category ?? undefined,
    weapons: parseWeapons(row.weapons),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const clampStrips = (n: unknown): number => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 999) : 0;
};

/**
 * Journée multi-épreuves (#1714) : regroupement d'épreuves, pistes de la salle,
 * arbitres partagés. Chaque épreuve garde sa table referees ; le lien
 * referees.day_referee_id relie l'arbitre de l'épreuve à celui de la journée.
 */
export class EventDayRepo {
  constructor(private readonly sql: SqlExecutor) {}

  // ─── Journées ────────────────────────────────────────────────────────────────

  public listDays(): EventDay[] {
    if (!this.sql.db) return [];
    const days = this.sql.queryAll<DayRow>('SELECT * FROM event_days ORDER BY date DESC, name ASC');
    const links = this.sql.queryAll<{ id: string; event_day_id: string }>(
      'SELECT id, event_day_id FROM competitions WHERE event_day_id IS NOT NULL'
    );
    return days.map(d => ({
      id: d.id,
      name: d.name,
      date: d.date,
      stripCount: d.strip_count ?? 0,
      competitionIds: links.filter(l => l.event_day_id === d.id).map(l => l.id),
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }

  public getDay(id: string): EventDay | null {
    return this.listDays().find(d => d.id === id) ?? null;
  }

  public createDay(data: { name: string; date: string; stripCount?: number }): EventDay {
    if (!this.sql.db) throw new Error('Database not open');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      'INSERT INTO event_days (id, name, date, strip_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.name.trim(), data.date, clampStrips(data.stripCount), now, now]
    );
    return this.getDay(id)!;
  }

  public updateDay(
    id: string,
    updates: { name?: string; date?: string; stripCount?: number }
  ): EventDay | null {
    if (!this.sql.db) throw new Error('Database not open');
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.date !== undefined) {
      sets.push('date = ?');
      values.push(updates.date);
    }
    if (updates.stripCount !== undefined) {
      sets.push('strip_count = ?');
      values.push(clampStrips(updates.stripCount));
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?');
      values.push(new Date().toISOString(), id);
      this.sql.run(`UPDATE event_days SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    return this.getDay(id);
  }

  /** Supprime la journée : les épreuves restent, leurs arbitres sont déliés */
  public deleteDay(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      this.sql.run(
        `UPDATE referees SET day_referee_id = NULL
         WHERE day_referee_id IN (SELECT id FROM event_day_referees WHERE event_day_id = ?)`,
        [id]
      );
      this.sql.run('UPDATE competitions SET event_day_id = NULL WHERE event_day_id = ?', [id]);
      this.sql.run('DELETE FROM event_day_referees WHERE event_day_id = ?', [id]);
      this.sql.run('DELETE FROM event_days WHERE id = ?', [id]);
    });
  }

  /** Rattache (dayId) ou détache (null) une épreuve ; détacher délie ses arbitres */
  public setCompetitionDay(competitionId: string, dayId: string | null): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      if (dayId === null) {
        this.sql.run('UPDATE referees SET day_referee_id = NULL WHERE competition_id = ?', [
          competitionId,
        ]);
      }
      this.sql.run('UPDATE competitions SET event_day_id = ? WHERE id = ?', [dayId, competitionId]);
    });
  }

  public getCompetitionDayId(competitionId: string): string | null {
    if (!this.sql.db) return null;
    const row = this.sql.queryOne<{ event_day_id: string | null }>(
      'SELECT event_day_id FROM competitions WHERE id = ?',
      [competitionId]
    );
    return row?.event_day_id ?? null;
  }

  // ─── Arbitres de la journée ──────────────────────────────────────────────────

  public listReferees(dayId: string): DayReferee[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<DayRefereeRow>(
        'SELECT * FROM event_day_referees WHERE event_day_id = ? ORDER BY last_name, first_name',
        [dayId]
      )
      .map(rowToDayReferee);
  }

  public createReferee(dayId: string, data: DayRefereeInput): DayReferee {
    if (!this.sql.db) throw new Error('Database not open');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO event_day_referees
         (id, event_day_id, first_name, last_name, club, license, category, weapons, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dayId,
        (data.firstName ?? '').trim(),
        (data.lastName ?? '').trim(),
        data.club || null,
        data.license || null,
        data.category || null,
        serializeWeapons(data.weapons),
        now,
        now,
      ]
    );
    const row = this.sql.queryOne<DayRefereeRow>('SELECT * FROM event_day_referees WHERE id = ?', [
      id,
    ]);
    if (!row) throw new Error('Day referee not created');
    return rowToDayReferee(row);
  }

  public updateReferee(id: string, data: DayRefereeInput): void {
    if (!this.sql.db) throw new Error('Database not open');
    const map: Array<[keyof DayRefereeInput, string]> = [
      ['firstName', 'first_name'],
      ['lastName', 'last_name'],
      ['club', 'club'],
      ['license', 'license'],
      ['category', 'category'],
    ];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of map) {
      if (data[key] !== undefined) {
        sets.push(`${col} = ?`);
        const v = String(data[key]).trim();
        values.push(v || (col.endsWith('_name') ? '' : null));
      }
    }
    if (data.weapons !== undefined) {
      sets.push('weapons = ?');
      values.push(serializeWeapons(data.weapons));
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    values.push(new Date().toISOString(), id);
    this.sql.run(`UPDATE event_day_referees SET ${sets.join(', ')} WHERE id = ?`, values);
  }

  /** Supprime l'arbitre de la journée ; ses fiches dans les épreuves restent, déliées */
  public deleteReferee(id: string): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.transaction(() => {
      this.sql.run('UPDATE referees SET day_referee_id = NULL WHERE day_referee_id = ?', [id]);
      this.sql.run('DELETE FROM event_day_referees WHERE id = ?', [id]);
    });
  }

  // ─── Synchronisation vers les épreuves ───────────────────────────────────────

  /**
   * Reporte les arbitres de la journée dans une épreuve, selon son arme :
   * fiche liée mise à jour, fiche homonyme non liée reprise, sinon créée.
   * Les fiches existantes ne sont jamais supprimées (affectations conservées).
   */
  public syncCompetition(competitionId: string): DaySyncResult {
    if (!this.sql.db) throw new Error('Database not open');
    const comp = this.sql.queryOne<{ event_day_id: string | null; weapon: string }>(
      'SELECT event_day_id, weapon FROM competitions WHERE id = ?',
      [competitionId]
    );
    if (!comp?.event_day_id) return { added: 0, updated: 0 };
    const weapon = comp.weapon as Weapon;
    const dayRefs = this.listReferees(comp.event_day_id).filter(r => canOfficiate(r, weapon));
    return this.sql.transaction(() => {
      const existing = this.sql.queryAll<CompetitionRefereeRow>(
        'SELECT id, name, club, license, category, day_referee_id FROM referees WHERE competition_id = ?',
        [competitionId]
      );
      let added = 0;
      let updated = 0;
      const now = new Date().toISOString();
      for (const dr of dayRefs) {
        const name = dayRefereeFullName(dr);
        const values = [name, dr.club ?? null, dr.license ?? null, dr.category ?? null];
        let target = existing.find(r => r.day_referee_id === dr.id);
        if (!target) {
          target = existing.find(
            r => !r.day_referee_id && String(r.name ?? '').toLowerCase() === name.toLowerCase()
          );
        }
        if (target) {
          const same =
            target.day_referee_id === dr.id &&
            target.name === values[0] &&
            (target.club ?? null) === values[1] &&
            (target.license ?? null) === values[2] &&
            (target.category ?? null) === values[3];
          if (!same) {
            this.sql.run(
              `UPDATE referees SET name = ?, club = ?, license = ?, category = ?, day_referee_id = ?, updated_at = ?
               WHERE id = ?`,
              [...values, dr.id, now, target.id]
            );
            target.day_referee_id = dr.id;
            updated++;
          }
          continue;
        }
        const next = this.sql.queryOne<{ next_ref: number }>(
          'SELECT COALESCE(MAX(ref), 0) + 1 AS next_ref FROM referees WHERE competition_id = ?',
          [competitionId]
        );
        // Non pointé par défaut, comme une saisie manuelle (#1016)
        this.sql.run(
          `INSERT INTO referees (id, competition_id, ref, name, nationality, club, license, category, status, day_referee_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'FRA', ?, ?, ?, 'unavailable', ?, ?, ?)`,
          [uuidv4(), competitionId, next?.next_ref ?? 1, ...values, dr.id, now, now]
        );
        added++;
      }
      return { added, updated };
    });
  }

  // ─── Occupation des arbitres sur la journée ──────────────────────────────────

  /** Liens arbitre d'épreuve → arbitre de journée, pour une journée ou une épreuve */
  public getLinks(scope: { dayId?: string; competitionId?: string }): Record<string, string> {
    if (!this.sql.db) return {};
    const rows = scope.competitionId
      ? this.sql.queryAll<{ id: string; day_referee_id: string }>(
          'SELECT id, day_referee_id FROM referees WHERE competition_id = ? AND day_referee_id IS NOT NULL',
          [scope.competitionId]
        )
      : this.sql.queryAll<{ id: string; day_referee_id: string }>(
          `SELECT r.id, r.day_referee_id FROM referees r JOIN competitions c ON c.id = r.competition_id
           WHERE c.event_day_id = ? AND r.day_referee_id IS NOT NULL`,
          [scope.dayId]
        );
    return Object.fromEntries(rows.map(r => [r.id, r.day_referee_id]));
  }

  /** Occupations en cours : poules non terminées et matchs de tableau en cours */
  public getAssignments(dayId: string): DayRefereeAssignment[] {
    if (!this.sql.db) return [];
    const links = this.getLinks({ dayId });
    const out: DayRefereeAssignment[] = [];
    const pools = this.sql.queryAll<PoolOccupationRow>(
      `SELECT p.number, p.strip, p.referee_id, p.referee_ids, c.id AS competition_id, c.title
       FROM pools p
       JOIN phases ph ON ph.id = p.phase_id
       JOIN competitions c ON c.id = ph.competition_id
       WHERE c.event_day_id = ? AND COALESCE(p.is_complete, 0) = 0`,
      [dayId]
    );
    for (const p of pools) {
      for (const refereeId of parsePoolRefereeIds(p)) {
        const dayRefereeId = links[refereeId];
        if (!dayRefereeId) continue;
        out.push({
          dayRefereeId,
          refereeId,
          competitionId: p.competition_id,
          competitionTitle: p.title,
          kind: 'pool',
          number: p.number,
          strip: p.strip ?? null,
        });
      }
    }
    const matches = this.sql.queryAll<MatchOccupationRow>(
      `SELECT m.number, m.strip, m.referee_id, c.id AS competition_id, c.title
       FROM matches m
       JOIN fencers f ON f.id = m.fencer_a_id
       JOIN competitions c ON c.id = f.competition_id
       WHERE c.event_day_id = ? AND m.pool_id IS NULL AND m.status = 'in_progress'
         AND m.referee_id IS NOT NULL`,
      [dayId]
    );
    for (const m of matches) {
      const dayRefereeId = links[m.referee_id];
      if (!dayRefereeId) continue;
      out.push({
        dayRefereeId,
        refereeId: m.referee_id,
        competitionId: m.competition_id,
        competitionTitle: m.title,
        kind: 'match',
        number: m.number,
        strip: m.strip ?? null,
      });
    }
    return out;
  }

  /** Arme de chaque épreuve de la journée */
  public getCompetitionWeapons(dayId: string): Record<string, Weapon> {
    if (!this.sql.db) return {};
    const rows = this.sql.queryAll<{ id: string; weapon: string }>(
      'SELECT id, weapon FROM competitions WHERE event_day_id = ?',
      [dayId]
    );
    return Object.fromEntries(rows.map(r => [r.id, r.weapon as Weapon]));
  }
}
