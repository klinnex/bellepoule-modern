import { v4 as uuidv4 } from 'uuid';
import type { Weapon } from '../../shared/types';
import type {
  ClubBout,
  ClubBoutFilter,
  ClubBoutInput,
  ClubBoutResult,
  ClubBoutStatus,
  ClubEntryMode,
  ClubMember,
  ClubMemberInput,
  ClubSession,
  ClubSessionInput,
  ClubSessionStatus,
  Laterality,
} from '../../shared/types/club';
import { isIsoDate, winnerFromScore } from '../../shared/utils/clubStats';
import { parseWeapons, serializeWeapons } from '../../shared/utils/eventDay';
import { sanitizeText } from '../validation';
import type { SqlExecutor } from './sqlExecutor';

interface MemberRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  license: string | null;
  gender: string | null;
  birth_year: number | null;
  weapons: string | null;
  laterality: string | null;
  category: string | null;
  notes: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  date: string;
  label: string | null;
  weapon: string | null;
  strip_count: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BoutRow {
  id: string;
  session_id: string;
  date: string;
  strip: number | null;
  member_a_id: string;
  member_b_id: string;
  score_a: number;
  score_b: number;
  max_score: number;
  winner_id: string | null;
  status: string;
  entry_mode: string;
  weapon: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration: number | null;
  created_at: string;
  updated_at: string;
}

const ENTRY_MODES: readonly ClubEntryMode[] = ['referee', 'self', 'master'];
const MAX_STRIPS = 99;
const MAX_SCORE = 99;

/** Texte court normalisé (#1147), null si vide */
const str = (v: unknown, max = 100): string | null => {
  if (typeof v !== 'string') return null;
  const t = sanitizeText(v).slice(0, max);
  return t ? t : null;
};
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const optInt = (v: unknown, min: number, max: number): number | null =>
  v === undefined || v === null || v === '' ? null : clampInt(v, min, max, min);
const laterality = (v: unknown): Laterality | null => (v === 'L' || v === 'R' ? v : null);
const entryMode = (v: unknown): ClubEntryMode =>
  ENTRY_MODES.includes(v as ClubEntryMode) ? (v as ClubEntryMode) : 'master';
const oneWeapon = (v: unknown): Weapon | null =>
  parseWeapons(typeof v === 'string' ? v : null)[0] ?? null;
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

function rowToMember(r: MemberRow): ClubMember {
  return {
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    license: opt(r.license),
    gender: opt(r.gender),
    birthYear: opt(r.birth_year),
    weapons: parseWeapons(r.weapons),
    laterality: opt(laterality(r.laterality)),
    category: opt(r.category),
    notes: opt(r.notes),
    active: r.active !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToBout(r: BoutRow): ClubBout {
  return {
    id: r.id,
    sessionId: r.session_id,
    date: r.date,
    strip: opt(r.strip),
    memberAId: r.member_a_id,
    memberBId: r.member_b_id,
    scoreA: r.score_a,
    scoreB: r.score_b,
    maxScore: r.max_score,
    winnerId: r.winner_id,
    status: r.status as ClubBoutStatus,
    entryMode: entryMode(r.entry_mode),
    weapon: opt(oneWeapon(r.weapon)),
    startedAt: opt(r.started_at),
    finishedAt: opt(r.finished_at),
    duration: opt(r.duration),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Mode Club (#1872) : annuaire des membres, séances (pistes, pointage) et combats
 * libres. Indépendant des compétitions ; combats conservés pour les stats de saison.
 */
export class ClubRepo {
  constructor(private readonly sql: SqlExecutor) {}

  private ensureOpen(): void {
    if (!this.sql.db) throw new Error('Database not open');
  }

  // ─── Membres ─────────────────────────────────────────────────────────────────

  public listMembers(includeInactive = false): ClubMember[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<MemberRow>(
        `SELECT * FROM club_members ${includeInactive ? '' : 'WHERE active = 1'}
         ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`
      )
      .map(rowToMember);
  }

  public getMember(id: string): ClubMember | null {
    if (!this.sql.db) return null;
    const r = this.sql.queryOne<MemberRow>('SELECT * FROM club_members WHERE id = ?', [id]);
    return r ? rowToMember(r) : null;
  }

  private memberColumns(data: Partial<ClubMemberInput>): Record<string, unknown> {
    const cols: Record<string, unknown> = {};
    if (data.firstName !== undefined) cols.first_name = str(data.firstName) ?? '';
    if (data.lastName !== undefined) cols.last_name = str(data.lastName) ?? '';
    if (data.license !== undefined) cols.license = str(data.license);
    if (data.gender !== undefined) cols.gender = str(data.gender);
    if (data.birthYear !== undefined) cols.birth_year = optInt(data.birthYear, 1900, 2100);
    if (data.weapons !== undefined) cols.weapons = serializeWeapons(data.weapons);
    if (data.laterality !== undefined) cols.laterality = laterality(data.laterality);
    if (data.category !== undefined) cols.category = str(data.category);
    if (data.notes !== undefined)
      cols.notes =
        typeof data.notes === 'string' && data.notes.trim()
          ? data.notes.replace(/[<>]/g, '').trim().slice(0, 2000)
          : null;
    if (data.active !== undefined) cols.active = data.active ? 1 : 0;
    return cols;
  }

  public createMember(data: ClubMemberInput): ClubMember {
    this.ensureOpen();
    const cols = this.memberColumns({ weapons: [], active: true, ...data });
    if (!cols.first_name && !cols.last_name) throw new Error('Nom du membre requis');
    const id = uuidv4();
    const now = new Date().toISOString();
    const all = { id, ...cols, created_at: now, updated_at: now };
    const keys = Object.keys(all);
    this.sql.run(
      `INSERT INTO club_members (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      Object.values(all)
    );
    return this.getMember(id)!;
  }

  public updateMember(id: string, updates: Partial<ClubMemberInput>): ClubMember | null {
    this.ensureOpen();
    const cols = this.memberColumns(updates);
    const keys = Object.keys(cols);
    if (keys.length > 0) {
      this.sql.run(
        `UPDATE club_members SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
        [...Object.values(cols), new Date().toISOString(), id]
      );
    }
    return this.getMember(id);
  }

  /** Effacement définitif (RGPD) : membre, présences et combats */
  public deleteMember(id: string): void {
    this.ensureOpen();
    this.sql.transaction(() => {
      this.sql.run('DELETE FROM club_bouts WHERE member_a_id = ? OR member_b_id = ?', [id, id]);
      this.sql.run('DELETE FROM club_attendance WHERE member_id = ?', [id]);
      this.sql.run('DELETE FROM club_members WHERE id = ?', [id]);
    });
  }

  // ─── Séances ─────────────────────────────────────────────────────────────────

  private attendees(sessionId: string): string[] {
    return this.sql
      .queryAll<{ member_id: string }>(
        'SELECT member_id FROM club_attendance WHERE session_id = ? ORDER BY checked_in_at, member_id',
        [sessionId]
      )
      .map(r => r.member_id);
  }

  private rowToSession(r: SessionRow): ClubSession {
    return {
      id: r.id,
      date: r.date,
      label: opt(r.label),
      weapon: opt(oneWeapon(r.weapon)),
      stripCount: r.strip_count ?? 1,
      status: (r.status === 'closed' ? 'closed' : 'open') as ClubSessionStatus,
      openedAt: r.opened_at,
      closedAt: opt(r.closed_at),
      attendeeIds: this.attendees(r.id),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /** Séances, plus récentes d'abord ; bornes from/to incluses (AAAA-MM-JJ) */
  public listSessions(range: { from?: string; to?: string } = {}): ClubSession[] {
    if (!this.sql.db) return [];
    const where: string[] = [];
    const params: unknown[] = [];
    if (isIsoDate(range.from)) {
      where.push('date >= ?');
      params.push(range.from);
    }
    if (isIsoDate(range.to)) {
      where.push('date <= ?');
      params.push(range.to);
    }
    return this.sql
      .queryAll<SessionRow>(
        `SELECT * FROM club_sessions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY date DESC, opened_at DESC`,
        params
      )
      .map(r => this.rowToSession(r));
  }

  public getSession(id: string): ClubSession | null {
    if (!this.sql.db) return null;
    const r = this.sql.queryOne<SessionRow>('SELECT * FROM club_sessions WHERE id = ?', [id]);
    return r ? this.rowToSession(r) : null;
  }

  public createSession(data: ClubSessionInput): ClubSession {
    this.ensureOpen();
    if (!isIsoDate(data.date)) throw new Error(`Date de séance invalide : ${data.date}`);
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO club_sessions (id, date, label, weapon, strip_count, status, opened_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [
        id,
        data.date,
        str(data.label),
        oneWeapon(data.weapon),
        clampInt(data.stripCount ?? 1, 1, MAX_STRIPS, 1),
        now,
        now,
        now,
      ]
    );
    return this.getSession(id)!;
  }

  public updateSession(id: string, updates: Partial<ClubSessionInput>): ClubSession | null {
    this.ensureOpen();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.date !== undefined) {
      if (!isIsoDate(updates.date)) throw new Error(`Date de séance invalide : ${updates.date}`);
      sets.push('date = ?');
      values.push(updates.date);
    }
    if (updates.label !== undefined) {
      sets.push('label = ?');
      values.push(str(updates.label));
    }
    if (updates.weapon !== undefined) {
      sets.push('weapon = ?');
      values.push(oneWeapon(updates.weapon));
    }
    if (updates.stripCount !== undefined) {
      sets.push('strip_count = ?');
      values.push(clampInt(updates.stripCount, 1, MAX_STRIPS, 1));
    }
    if (sets.length === 0) return this.getSession(id);
    this.sql.transaction(() => {
      this.sql.run(`UPDATE club_sessions SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
        ...values,
        new Date().toISOString(),
        id,
      ]);
      // Date dénormalisée dans les combats : garder les filtres par période cohérents
      if (updates.date !== undefined) {
        this.sql.run('UPDATE club_bouts SET date = ? WHERE session_id = ?', [updates.date, id]);
      }
    });
    return this.getSession(id);
  }

  /** Ferme la séance ; les combats non terminés sont annulés */
  public closeSession(id: string): ClubSession | null {
    this.ensureOpen();
    const now = new Date().toISOString();
    this.sql.transaction(() => {
      this.sql.run(
        `UPDATE club_bouts SET status = 'cancelled', updated_at = ?
         WHERE session_id = ? AND status IN ('pending', 'in_progress')`,
        [now, id]
      );
      this.sql.run(
        `UPDATE club_sessions SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, id]
      );
    });
    return this.getSession(id);
  }

  public reopenSession(id: string): ClubSession | null {
    this.ensureOpen();
    this.sql.run(
      `UPDATE club_sessions SET status = 'open', closed_at = NULL, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );
    return this.getSession(id);
  }

  public deleteSession(id: string): void {
    this.ensureOpen();
    this.sql.transaction(() => {
      this.sql.run('DELETE FROM club_bouts WHERE session_id = ?', [id]);
      this.sql.run('DELETE FROM club_attendance WHERE session_id = ?', [id]);
      this.sql.run('DELETE FROM club_sessions WHERE id = ?', [id]);
    });
  }

  /** Pointe (present=true) ou dépointe un membre */
  public setAttendance(sessionId: string, memberId: string, present: boolean): string[] {
    this.ensureOpen();
    if (present) {
      if (!this.getMember(memberId)) throw new Error('Membre inconnu');
      this.sql.run(
        'INSERT OR IGNORE INTO club_attendance (session_id, member_id, checked_in_at) VALUES (?, ?, ?)',
        [sessionId, memberId, new Date().toISOString()]
      );
    } else {
      this.sql.run('DELETE FROM club_attendance WHERE session_id = ? AND member_id = ?', [
        sessionId,
        memberId,
      ]);
    }
    return this.attendees(sessionId);
  }

  // ─── Combats ─────────────────────────────────────────────────────────────────

  public getBout(id: string): ClubBout | null {
    if (!this.sql.db) return null;
    const r = this.sql.queryOne<BoutRow>('SELECT * FROM club_bouts WHERE id = ?', [id]);
    return r ? rowToBout(r) : null;
  }

  public listBouts(filter: ClubBoutFilter = {}): ClubBout[] {
    if (!this.sql.db) return [];
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.sessionId) {
      where.push('session_id = ?');
      params.push(filter.sessionId);
    }
    if (filter.memberId) {
      where.push('(member_a_id = ? OR member_b_id = ?)');
      params.push(filter.memberId, filter.memberId);
    }
    if (isIsoDate(filter.from)) {
      where.push('date >= ?');
      params.push(filter.from);
    }
    if (isIsoDate(filter.to)) {
      where.push('date <= ?');
      params.push(filter.to);
    }
    const w = oneWeapon(filter.weapon);
    if (w) {
      where.push('weapon = ?');
      params.push(w);
    }
    if (!filter.includeUnfinished) where.push(`status = 'finished'`);
    return this.sql
      .queryAll<BoutRow>(
        `SELECT * FROM club_bouts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY date ASC, created_at ASC, rowid ASC`,
        params
      )
      .map(rowToBout);
  }

  /** Crée un combat (appariement manuel) sur une séance ouverte */
  public createBout(data: ClubBoutInput): ClubBout {
    this.ensureOpen();
    const session = this.getSession(data.sessionId);
    if (!session) throw new Error('Séance inconnue');
    if (session.status !== 'open') throw new Error('Séance fermée');
    if (data.memberAId === data.memberBId) throw new Error('Un membre ne peut pas se combattre');
    if (!this.getMember(data.memberAId) || !this.getMember(data.memberBId)) {
      throw new Error('Membre inconnu');
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO club_bouts (id, session_id, date, strip, member_a_id, member_b_id, max_score,
         status, entry_mode, weapon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        id,
        session.id,
        session.date,
        optInt(data.strip, 1, session.stripCount),
        data.memberAId,
        data.memberBId,
        clampInt(data.maxScore ?? 5, 1, MAX_SCORE, 5),
        entryMode(data.entryMode),
        session.weapon ?? null,
        now,
        now,
      ]
    );
    return this.getBout(id)!;
  }

  public startBout(id: string): ClubBout | null {
    this.ensureOpen();
    const now = new Date().toISOString();
    this.sql.run(
      `UPDATE club_bouts SET status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ?
       WHERE id = ? AND status = 'pending'`,
      [now, now, id]
    );
    return this.getBout(id);
  }

  /** Score en cours (tablette arbitre / tireurs), sans terminer */
  public updateBoutScore(id: string, scoreA: number, scoreB: number): ClubBout | null {
    this.ensureOpen();
    const b = this.getBout(id);
    if (!b || b.status === 'finished' || b.status === 'cancelled') return b;
    this.sql.run(
      `UPDATE club_bouts SET score_a = ?, score_b = ?, status = 'in_progress',
         started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?`,
      [
        clampInt(scoreA, 0, MAX_SCORE, 0),
        clampInt(scoreB, 0, MAX_SCORE, 0),
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      ]
    );
    return this.getBout(id);
  }

  /** Termine (ou corrige) un combat avec son score final */
  public finishBout(id: string, result: ClubBoutResult): ClubBout | null {
    this.ensureOpen();
    const b = this.getBout(id);
    if (!b) return null;
    if (b.status === 'cancelled') throw new Error('Combat annulé');
    const scoreA = clampInt(result.scoreA, 0, MAX_SCORE, 0);
    const scoreB = clampInt(result.scoreB, 0, MAX_SCORE, 0);
    const explicit =
      result.winnerId === b.memberAId || result.winnerId === b.memberBId
        ? result.winnerId
        : undefined;
    const winnerId = explicit ?? winnerFromScore(b.memberAId, b.memberBId, scoreA, scoreB);
    const now = new Date().toISOString();
    this.sql.run(
      `UPDATE club_bouts SET score_a = ?, score_b = ?, winner_id = ?, status = 'finished',
         entry_mode = ?, duration = ?, started_at = COALESCE(started_at, ?),
         finished_at = COALESCE(finished_at, ?), updated_at = ? WHERE id = ?`,
      [
        scoreA,
        scoreB,
        winnerId,
        result.entryMode ? entryMode(result.entryMode) : b.entryMode,
        optInt(result.duration, 0, 86400) ?? b.duration ?? null,
        now,
        now,
        now,
        id,
      ]
    );
    return this.getBout(id);
  }

  public cancelBout(id: string): ClubBout | null {
    this.ensureOpen();
    this.sql.run(`UPDATE club_bouts SET status = 'cancelled', updated_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      id,
    ]);
    return this.getBout(id);
  }

  public deleteBout(id: string): void {
    this.ensureOpen();
    this.sql.run('DELETE FROM club_bouts WHERE id = ?', [id]);
  }
}
