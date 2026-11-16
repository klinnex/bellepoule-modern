import { randomBytes } from 'crypto';
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
  ClubMemberFeedback,
  ClubMemberInput,
  ClubSession,
  ClubSessionInput,
  ClubSessionStatus,
  Club,
  ClubSummary,
  ClubUpdate,
  Laterality,
} from '../../shared/types/club';
import { normalizeCardCode } from '../../shared/utils/clubQr';
import { cleanLongText, normalizeFeedback, normalizePlan } from '../../shared/utils/clubPlan';
import { safeJsonParse } from './dbUtils';
import { planClubImport, type ClubImportResult } from '../../shared/utils/clubImport';
import { isIsoDate, winnerFromScore } from '../../shared/utils/clubStats';
import { parseWeapons, serializeWeapons } from '../../shared/utils/eventDay';
import { sanitizeText } from '../validation';
import type { SqlExecutor } from './sqlExecutor';

interface ClubRow {
  id: string;
  name: string | null;
  logo: string | null;
  strip_count: number | null;
  created_at: string;
  updated_at: string;
}

interface MemberRow {
  id: string;
  club_id: string | null;
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
  card_code: string | null;
  photo: string | null;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  objectives: string | null;
  plan: string | null;
  notes: string | null;
  feedback: string | null;
  club_id: string | null;
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
const newCardCode = (): string => randomBytes(5).toString('hex').toUpperCase();
/** Logo accepté : data URL image base64, 2 Mo max */
const LOGO_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_LENGTH = 2_800_000;
/** Photo de membre : data URL png/jpeg/webp, ≈ 1 Mo max */
const PHOTO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO_LENGTH = 1_400_000;
const validPhoto = (p: unknown): p is string =>
  typeof p === 'string' && p.length <= MAX_PHOTO_LENGTH && PHOTO_RE.test(p);

function rowToMember(r: MemberRow): ClubMember {
  return {
    id: r.id,
    clubId: r.club_id ?? '',
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
    cardCode: r.card_code ?? '',
    photo: opt(r.photo),
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

  // ─── Clubs ───────────────────────────────────────────────────────────────────

  private rowToClub(r: ClubRow): Club {
    return {
      id: r.id,
      name: r.name ?? '',
      logo: opt(r.logo),
      stripCount: clampInt(r.strip_count ?? 1, 1, MAX_STRIPS, 1),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /** Clubs par nom, avec effectif actif et date de la séance ouverte */
  public listClubs(): ClubSummary[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<ClubRow & { members_count: number; open_date: string | null }>(
        `SELECT c.*,
           (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.active = 1) AS members_count,
           (SELECT MAX(s.date) FROM club_sessions s WHERE s.club_id = c.id AND s.status = 'open') AS open_date
         FROM clubs c ORDER BY c.name COLLATE NOCASE, c.created_at`
      )
      .map(r => ({
        ...this.rowToClub(r),
        membersCount: r.members_count ?? 0,
        openSessionDate: r.open_date ?? null,
      }));
  }

  public getClub(id: string): Club | null {
    if (!this.sql.db) return null;
    const r = this.sql.queryOne<ClubRow>('SELECT * FROM clubs WHERE id = ?', [id]);
    return r ? this.rowToClub(r) : null;
  }

  private requireClub(id: string): Club {
    const c = this.getClub(id);
    if (!c) throw new Error('Club inconnu');
    return c;
  }

  public createClub(data: { name: string; stripCount?: number }): Club {
    this.ensureOpen();
    const name = str(data?.name);
    if (!name) throw new Error('Nom du club requis');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      'INSERT INTO clubs (id, name, logo, strip_count, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)',
      [id, name, clampInt(data.stripCount ?? 1, 1, MAX_STRIPS, 1), now, now]
    );
    return this.getClub(id)!;
  }

  /** logo: null efface le logo ; logo invalide refusé ; nom vide refusé */
  public updateClub(id: string, data: ClubUpdate): Club | null {
    this.ensureOpen();
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) {
      const name = str(data.name);
      if (!name) throw new Error('Nom du club requis');
      sets.push('name = ?');
      values.push(name);
    }
    if (data.logo !== undefined) {
      if (
        data.logo !== null &&
        (typeof data.logo !== 'string' ||
          data.logo.length > MAX_LOGO_LENGTH ||
          !LOGO_RE.test(data.logo))
      ) {
        throw new Error('Logo invalide (image PNG, JPEG, WebP ou SVG, 2 Mo max)');
      }
      sets.push('logo = ?');
      values.push(data.logo);
    }
    if (data.stripCount !== undefined) {
      sets.push('strip_count = ?');
      values.push(clampInt(data.stripCount, 1, MAX_STRIPS, 1));
    }
    if (sets.length > 0) {
      this.sql.run(`UPDATE clubs SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
        ...values,
        new Date().toISOString(),
        id,
      ]);
    }
    return this.getClub(id);
  }

  /** Suppression définitive : club, membres, séances, présences, combats */
  public deleteClub(id: string): void {
    this.ensureOpen();
    this.sql.transaction(() => {
      this.sql.run(
        'DELETE FROM club_attendance WHERE session_id IN (SELECT id FROM club_sessions WHERE club_id = ?)',
        [id]
      );
      this.sql.run('DELETE FROM club_bouts WHERE club_id = ?', [id]);
      this.sql.run('DELETE FROM club_sessions WHERE club_id = ?', [id]);
      this.sql.run('DELETE FROM club_members WHERE club_id = ?', [id]);
      this.sql.run('DELETE FROM clubs WHERE id = ?', [id]);
    });
  }

  // ─── Membres ─────────────────────────────────────────────────────────────────

  public listMembers(clubId: string, includeInactive = false): ClubMember[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<MemberRow>(
        `SELECT * FROM club_members WHERE club_id = ? ${includeInactive ? '' : 'AND active = 1'}
         ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE`,
        [clubId]
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
    if (data.photo !== undefined) {
      if (data.photo !== null && !validPhoto(data.photo)) {
        throw new Error('Photo invalide (image PNG, JPEG ou WebP, 1 Mo max)');
      }
      cols.photo = data.photo;
    }
    return cols;
  }

  public createMember(clubId: string, data: ClubMemberInput): ClubMember {
    this.ensureOpen();
    this.requireClub(clubId);
    const cols = this.memberColumns({ weapons: [], active: true, ...data });
    if (!cols.first_name && !cols.last_name) throw new Error('Nom du membre requis');
    const id = uuidv4();
    const now = new Date().toISOString();
    const all = {
      id,
      club_id: clubId,
      ...cols,
      card_code: this.uniqueCardCode(),
      created_at: now,
      updated_at: now,
    };
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

  private uniqueCardCode(): string {
    for (;;) {
      const code = newCardCode();
      if (!this.sql.queryOne('SELECT 1 FROM club_members WHERE card_code = ?', [code])) return code;
    }
  }

  /** Membre actif correspondant au code de carte lu (QR ou saisie) */
  public findMemberByCardCode(code: string, clubId?: string): ClubMember | null {
    if (!this.sql.db) return null;
    const c = normalizeCardCode(code);
    if (!c) return null;
    const r = this.sql.queryOne<MemberRow>(
      'SELECT * FROM club_members WHERE card_code = ? AND active = 1',
      [c]
    );
    if (!r || (clubId && r.club_id !== clubId)) return null;
    return rowToMember(r);
  }

  /** Carte perdue : nouveau code, l'ancienne carte n'est plus reconnue */
  public regenerateCardCode(id: string): ClubMember | null {
    this.ensureOpen();
    this.sql.run('UPDATE club_members SET card_code = ?, updated_at = ? WHERE id = ?', [
      this.uniqueCardCode(),
      new Date().toISOString(),
      id,
    ]);
    return this.getMember(id);
  }

  /** Photos par licence (ZIP) : membres actifs ou archivés, licence identique */
  public setPhotosByLicense(
    clubId: string,
    photos: { license: string; photo: string }[]
  ): {
    matched: number;
    total: number;
  } {
    this.ensureOpen();
    let matched = 0;
    const now = new Date().toISOString();
    this.sql.transaction(() => {
      for (const { license, photo } of photos) {
        const lic = typeof license === 'string' ? license.trim() : '';
        if (!lic || !validPhoto(photo)) continue;
        const r = this.sql.run(
          'UPDATE club_members SET photo = ?, updated_at = ? WHERE club_id = ? AND license = ?',
          [photo, now, clubId, lic]
        );
        if (r.changes > 0) matched++;
      }
    });
    return { matched, total: photos.length };
  }

  /** Import en lot (fichier FFE…) : crée les nouveaux, complète les existants, ignore les doublons */
  public importMembers(clubId: string, inputs: ClubMemberInput[]): ClubImportResult {
    this.ensureOpen();
    this.requireClub(clubId);
    const list = Array.isArray(inputs) ? inputs.slice(0, 5000) : [];
    const plan = planClubImport(this.listMembers(clubId, true), list);
    let created = 0;
    let skipped = plan.skipped;
    this.sql.transaction(() => {
      for (const m of plan.create) {
        try {
          this.createMember(clubId, m);
          created++;
        } catch {
          skipped++; // ligne sans nom exploitable
        }
      }
      for (const u of plan.update) this.updateMember(u.id, u.data);
    });
    return { created, updated: plan.update.length, skipped };
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

  private memberFeedbackOf(sessionId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.sql.queryAll<{ member_id: string; feedback: string | null }>(
      'SELECT member_id, feedback FROM club_attendance WHERE session_id = ? AND feedback IS NOT NULL',
      [sessionId]
    )) {
      if (r.feedback) out[r.member_id] = r.feedback;
    }
    return out;
  }

  /** Remarque pour un tireur présent à la séance ; texte vide = effacée */
  public setMemberFeedback(sessionId: string, memberId: string, text: string): void {
    this.ensureOpen();
    const r = this.sql.run(
      'UPDATE club_attendance SET feedback = ? WHERE session_id = ? AND member_id = ?',
      [cleanLongText(text, 1000) ?? null, sessionId, memberId]
    );
    if (r.changes === 0) throw new Error('Tireur absent de la séance');
  }

  /** Remarques reçues par un tireur, plus récentes d'abord */
  public getMemberFeedback(memberId: string): ClubMemberFeedback[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<{ session_id: string; date: string; label: string | null; feedback: string }>(
        `SELECT a.session_id, s.date, s.label, a.feedback
         FROM club_attendance a JOIN club_sessions s ON s.id = a.session_id
         WHERE a.member_id = ? AND a.feedback IS NOT NULL AND a.feedback <> ''
         ORDER BY s.date DESC, s.opened_at DESC`,
        [memberId]
      )
      .map(r => ({
        sessionId: r.session_id,
        date: r.date,
        label: opt(r.label),
        text: r.feedback,
      }));
  }

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
      clubId: r.club_id ?? '',
      date: r.date,
      label: opt(r.label),
      weapon: opt(oneWeapon(r.weapon)),
      stripCount: r.strip_count ?? 1,
      status: (['planned', 'closed'].includes(r.status) ? r.status : 'open') as ClubSessionStatus,
      openedAt: r.opened_at,
      closedAt: opt(r.closed_at),
      attendeeIds: this.attendees(r.id),
      objectives: opt(r.objectives),
      plan: normalizePlan(safeJsonParse(r.plan, [], 'club_sessions.plan')),
      notes: opt(r.notes),
      feedback: normalizeFeedback(safeJsonParse(r.feedback, null, 'club_sessions.feedback')),
      memberFeedback: this.memberFeedbackOf(r.id),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  /** Séances, plus récentes d'abord ; bornes from/to incluses (AAAA-MM-JJ) */
  public listSessions(clubId: string, range: { from?: string; to?: string } = {}): ClubSession[] {
    if (!this.sql.db) return [];
    const where: string[] = ['club_id = ?'];
    const params: unknown[] = [clubId];
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
        `SELECT * FROM club_sessions WHERE ${where.join(' AND ')}
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

  public createSession(clubId: string, data: ClubSessionInput): ClubSession {
    this.ensureOpen();
    const club = this.requireClub(clubId);
    if (!isIsoDate(data.date)) throw new Error(`Date de séance invalide : ${data.date}`);
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO club_sessions (id, club_id, date, label, weapon, strip_count, status,
         objectives, plan, notes, opened_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        clubId,
        data.date,
        str(data.label),
        oneWeapon(data.weapon),
        clampInt(data.stripCount ?? club.stripCount, 1, MAX_STRIPS, 1),
        data.planned ? 'planned' : 'open',
        cleanLongText(data.objectives) ?? null,
        JSON.stringify(normalizePlan(data.plan)),
        cleanLongText(data.notes) ?? null,
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
    if (updates.objectives !== undefined) {
      sets.push('objectives = ?');
      values.push(cleanLongText(updates.objectives) ?? null);
    }
    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      values.push(cleanLongText(updates.notes) ?? null);
    }
    if (updates.feedback !== undefined) {
      const fb = normalizeFeedback(updates.feedback);
      sets.push('feedback = ?');
      values.push(fb ? JSON.stringify(fb) : null);
    }
    if (updates.plan !== undefined) {
      sets.push('plan = ?');
      values.push(JSON.stringify(normalizePlan(updates.plan)));
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

  /** Séance préparée → ouverte maintenant ; refusé si une autre séance du club est ouverte */
  public startSession(id: string): ClubSession | null {
    this.ensureOpen();
    const s = this.getSession(id);
    if (!s || s.status !== 'planned') return s;
    if (
      this.sql.queryOne(
        `SELECT 1 FROM club_sessions WHERE club_id = ? AND status = 'open' AND id <> ?`,
        [s.clubId, id]
      )
    ) {
      throw new Error('Une séance est déjà ouverte');
    }
    const now = new Date().toISOString();
    this.sql.run(
      `UPDATE club_sessions SET status = 'open', opened_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
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
      const m = this.getMember(memberId);
      const s = this.getSession(sessionId);
      if (!m || !s || m.clubId !== s.clubId) throw new Error('Membre inconnu');
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
    if (filter.clubId) {
      where.push('club_id = ?');
      params.push(filter.clubId);
    }
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
    const ma = this.getMember(data.memberAId);
    const mb = this.getMember(data.memberBId);
    if (!ma || !mb || ma.clubId !== session.clubId || mb.clubId !== session.clubId) {
      throw new Error('Membre inconnu');
    }
    const strip = optInt(data.strip, 1, session.stripCount);
    if (
      strip !== null &&
      this.sql.queryOne(
        `SELECT 1 FROM club_bouts WHERE session_id = ? AND strip = ? AND status IN ('pending', 'in_progress')`,
        [session.id, strip]
      )
    ) {
      throw new Error(`Piste ${strip} occupée`);
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    this.sql.run(
      `INSERT INTO club_bouts (id, club_id, session_id, date, strip, member_a_id, member_b_id, max_score,
         status, entry_mode, weapon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [
        id,
        session.clubId,
        session.id,
        session.date,
        strip,
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
