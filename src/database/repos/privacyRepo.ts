/**
 * BellePoule Modern - RGPD : droits des personnes et durée de conservation (#1882).
 * Recherche d'une personne (tireurs de toutes les compétitions + membres du Mode Club),
 * export de ses données (accès / portabilité), anonymisation, effacement, purge des
 * compétitions et membres inactifs au-delà de la durée de conservation.
 * Les tables portant une référence de tireur sont découvertes par introspection :
 * une future table `…fencer_id` est couverte sans modifier ce fichier.
 * Licensed under GPL-3.0
 */
import { randomBytes } from 'crypto';
import type { SqlExecutor } from './sqlExecutor';
import type { SqlRow } from './rowMappers';
import type {
  PersonalDataExport,
  PrivacyPerson,
  PrivacyPersonRef,
  RetentionCandidates,
} from '../../shared/types/privacy';

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Colonnes désignant un tireur (`fencer_id`, `fencer_a_id`, `fencer_b_id`) */
const FENCER_REF = /^fencer(_[ab])?_id$/;

/** Clés d'identité remplacées dans les instantanés JSON (session_state, arena_state…) */
const IDENTITY_KEYS = ['lastName', 'firstName', 'birthDate', 'license', 'photo'] as const;

/** Libellé d'un tireur effacé dans les instantanés JSON qu'on ne peut pas restructurer */
export const ERASED_LABEL = '—';

const MAX_SEARCH_RESULTS = 50;

/** Minuscules sans accents ni espaces superflus */
export function normalizeIdentity(text: unknown): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clé de regroupement : licence si connue, sinon nom + prénom + date de naissance */
export function identityKey(p: {
  license?: string | null;
  lastName?: string | null;
  firstName?: string | null;
  birthDate?: string | null;
}): string {
  const license = normalizeIdentity(p.license).replace(/\s/g, '');
  if (license) return `lic:${license}`;
  return `name:${normalizeIdentity(p.lastName)}|${normalizeIdentity(p.firstName)}|${String(
    p.birthDate ?? ''
  ).slice(0, 10)}`;
}

/** Pseudonyme aléatoire stable pour une personne (« Anonyme 3FA9C2 ») */
export function randomPseudonym(): string {
  return `Anonyme ${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Remplace l'identité des tireurs `ids` dans une structure JSON (copie). Un objet est
 * reconnu par `id` ∈ ids et la présence d'au moins une clé d'identité.
 */
export function scrubIdentityInJson(
  value: unknown,
  replacements: Map<string, string>,
  depth = 0
): { value: unknown; changed: boolean } {
  if (value === null || typeof value !== 'object' || depth > 32) return { value, changed: false };
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map(v => {
      const r = scrubIdentityInJson(v, replacements, depth + 1);
      changed ||= r.changed;
      return r.value;
    });
    return { value: changed ? out : value, changed };
  }
  const obj = value as Record<string, unknown>;
  let changed = false;
  const out: Record<string, unknown> = {};
  const id = typeof obj.id === 'string' ? obj.id : null;
  const pseudonym = id !== null ? replacements.get(id) : undefined;
  const isIdentity = pseudonym !== undefined && IDENTITY_KEYS.some(k => k in obj);
  for (const [k, child] of Object.entries(obj)) {
    if (isIdentity && (IDENTITY_KEYS as readonly string[]).includes(k)) {
      const next = k === 'lastName' ? pseudonym : k === 'firstName' ? '' : null;
      if (child !== next) changed = true;
      if (next !== null) out[k] = next;
      else if (child !== undefined && child !== null) changed = true;
      continue;
    }
    const r = scrubIdentityInJson(child, replacements, depth + 1);
    changed ||= r.changed;
    out[k] = r.value;
  }
  return { value: changed ? out : value, changed };
}

interface FencerIdentityRow {
  id: string;
  competition_id: string;
  last_name: string;
  first_name: string;
  birth_date: string | null;
  license: string | null;
  club: string | null;
  title: string | null;
  date: string | null;
}

interface MemberIdentityRow {
  id: string;
  club_id: string | null;
  last_name: string;
  first_name: string;
  birth_date: string | null;
  birth_year: number | null;
  license: string | null;
  club_name: string | null;
}

export class PrivacyRepo {
  constructor(private readonly sql: SqlExecutor) {}

  private ensureOpen(): void {
    if (!this.sql.db) throw new Error('Database not open');
  }

  private tables(): string[] {
    return this.sql
      .queryAll<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
      )
      .map(r => r.name);
  }

  private columns(table: string): string[] {
    return this.sql
      .queryAll<{ name: string }>(`PRAGMA table_info(${quote(table)})`)
      .map(r => r.name);
  }

  /** Tables (hors `fencers`) et colonnes qui référencent un tireur */
  private fencerRefTables(): Array<{ table: string; cols: string[] }> {
    const out: Array<{ table: string; cols: string[] }> = [];
    for (const table of this.tables()) {
      if (table === 'fencers') continue;
      const cols = this.columns(table).filter(c => FENCER_REF.test(c));
      if (cols.length) out.push({ table, cols });
    }
    return out;
  }

  private hasTable(name: string): boolean {
    return this.tables().includes(name);
  }

  private placeholders(n: number): string {
    return Array.from({ length: n }, () => '?').join(', ');
  }

  // ─── Recherche ───────────────────────────────────────────────────────────────

  /**
   * Personnes dont le nom, le prénom ou la licence contient `query` (accents ignorés),
   * regroupées par licence (sinon nom + prénom + date de naissance).
   */
  public findPersons(query: string): PrivacyPerson[] {
    this.ensureOpen();
    const q = normalizeIdentity(query);
    if (q.length < 2) return [];
    const matches = (...fields: Array<string | null>) =>
      fields.some(f => normalizeIdentity(f).includes(q)) ||
      normalizeIdentity(`${fields[0] ?? ''} ${fields[1] ?? ''}`).includes(q) ||
      normalizeIdentity(`${fields[1] ?? ''} ${fields[0] ?? ''}`).includes(q);

    const groups = new Map<string, PrivacyPerson>();
    const group = (key: string, base: Omit<PrivacyPerson, 'key' | 'fencers' | 'members'>) => {
      let g = groups.get(key);
      if (!g) {
        g = { key, ...base, fencers: [], members: [] };
        groups.set(key, g);
      }
      return g;
    };

    const fencers = this.sql.queryAll<FencerIdentityRow>(
      `SELECT f.id, f.competition_id, f.last_name, f.first_name, f.birth_date, f.license, f.club,
              c.title, c.date
       FROM fencers f LEFT JOIN competitions c ON c.id = f.competition_id
       ORDER BY c.date DESC`
    );
    for (const f of fencers) {
      if (!matches(f.last_name, f.first_name, f.license)) continue;
      const key = identityKey({
        license: f.license,
        lastName: f.last_name,
        firstName: f.first_name,
        birthDate: f.birth_date,
      });
      const g = group(key, {
        lastName: f.last_name,
        firstName: f.first_name,
        birthDate: f.birth_date ? f.birth_date.slice(0, 10) : null,
        license: f.license,
        club: f.club,
      });
      g.fencers.push({
        fencerId: f.id,
        competitionId: f.competition_id,
        competitionTitle: f.title ?? '',
        competitionDate: f.date ?? null,
      });
    }

    if (this.hasTable('club_members')) {
      const members = this.sql.queryAll<MemberIdentityRow>(
        `SELECT m.id, m.club_id, m.last_name, m.first_name, m.birth_date, m.birth_year, m.license,
                cl.name AS club_name
         FROM club_members m LEFT JOIN clubs cl ON cl.id = m.club_id`
      );
      for (const m of members) {
        if (!matches(m.last_name, m.first_name, m.license)) continue;
        // Licence commune → même personne ; sinon nom + prénom (+ date si connue)
        const byLicense = identityKey({ license: m.license });
        const byName = identityKey({
          lastName: m.last_name,
          firstName: m.first_name,
          birthDate: m.birth_date,
        });
        const key = m.license
          ? byLicense
          : ((groups.has(byName) ? byName : null) ??
            [...groups.keys()].find(k =>
              k.startsWith(
                `name:${normalizeIdentity(m.last_name)}|${normalizeIdentity(m.first_name)}|`
              )
            ) ??
            byName);
        const g = group(key, {
          lastName: m.last_name,
          firstName: m.first_name,
          birthDate: m.birth_date ? m.birth_date.slice(0, 10) : null,
          license: m.license,
          club: m.club_name,
        });
        g.members.push({ memberId: m.id, clubId: m.club_id, clubName: m.club_name ?? '' });
      }
    }

    return [...groups.values()]
      .sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')
      )
      .slice(0, MAX_SEARCH_RESULTS);
  }

  /** Garde uniquement les identifiants existants (le renderer n'est pas de confiance) */
  private resolveRef(ref: PrivacyPersonRef): { fencerIds: string[]; memberIds: string[] } {
    const uniq = (ids: unknown) =>
      Array.isArray(ids)
        ? [...new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0))]
        : [];
    const fencerIds = uniq(ref?.fencerIds).filter(
      id => this.sql.queryOne('SELECT 1 AS x FROM fencers WHERE id = ?', [id]) !== null
    );
    const memberIds = this.hasTable('club_members')
      ? uniq(ref?.memberIds).filter(
          id => this.sql.queryOne('SELECT 1 AS x FROM club_members WHERE id = ?', [id]) !== null
        )
      : [];
    return { fencerIds, memberIds };
  }

  // ─── Droit d'accès / portabilité ─────────────────────────────────────────────

  /** Toutes les données d'une personne, lignes brutes par table (JSON lisible par machine) */
  public exportPerson(ref: PrivacyPersonRef): PersonalDataExport {
    this.ensureOpen();
    const { fencerIds, memberIds } = this.resolveRef(ref);
    const refTables = this.fencerRefTables();

    const competitions = fencerIds.map(fencerId => {
      const fencer = this.sql.queryOne<SqlRow>('SELECT * FROM fencers WHERE id = ?', [fencerId])!;
      const competition = this.sql.queryOne<SqlRow>(
        `SELECT id, title, short_title, date, location, organizer, weapon, gender, category,
                championship, status
         FROM competitions WHERE id = ?`,
        [fencer.competition_id]
      );
      const related: Record<string, SqlRow[]> = {};
      for (const { table, cols } of refTables) {
        const where = cols.map(c => `${quote(c)} = ?`).join(' OR ');
        const rows = this.sql.queryAll<SqlRow>(
          `SELECT * FROM ${quote(table)} WHERE ${where}`,
          cols.map(() => fencerId)
        );
        if (rows.length) related[table] = rows;
      }
      // Lisibilité : nom de l'adversaire de chaque match (résultat public)
      for (const m of related.matches ?? []) {
        const opp = m.fencer_a_id === fencerId ? m.fencer_b_id : m.fencer_a_id;
        const o = opp
          ? this.sql.queryOne<{ last_name: string; first_name: string }>(
              'SELECT last_name, first_name FROM fencers WHERE id = ?',
              [opp]
            )
          : null;
        m.opponent_name = o ? `${o.last_name} ${o.first_name}`.trim() : null;
      }
      return { competition, fencer, related };
    });

    const club = memberIds.map(memberId => {
      const member = this.sql.queryOne<SqlRow>('SELECT * FROM club_members WHERE id = ?', [
        memberId,
      ])!;
      const clubRow = member.club_id
        ? this.sql.queryOne<SqlRow>('SELECT id, name FROM clubs WHERE id = ?', [member.club_id])
        : null;
      const attendance = this.sql.queryAll<SqlRow>(
        `SELECT a.*, s.date AS session_date, s.label AS session_label
         FROM club_attendance a LEFT JOIN club_sessions s ON s.id = a.session_id
         WHERE a.member_id = ? ORDER BY s.date`,
        [memberId]
      );
      const bouts = this.sql.queryAll<SqlRow>(
        `SELECT * FROM club_bouts WHERE member_a_id = ? OR member_b_id = ? ORDER BY date`,
        [memberId, memberId]
      );
      return { club: clubRow, member, attendance, bouts };
    });

    const first = competitions[0]?.fencer ?? club[0]?.member ?? null;
    return {
      format: 'bellepoule-modern/personal-data',
      version: 1,
      exportedAt: new Date().toISOString(),
      subject: {
        lastName: (first?.last_name as string) ?? '',
        firstName: (first?.first_name as string) ?? '',
        license: (first?.license as string | null) ?? null,
      },
      competitions,
      club,
    };
  }

  // ─── Anonymisation ───────────────────────────────────────────────────────────

  /** Remplace l'identité dans les instantanés JSON des compétitions concernées */
  private scrubSnapshots(replacements: Map<string, string>, competitionIds: string[]): void {
    if (replacements.size === 0 || competitionIds.length === 0) return;
    const ph = this.placeholders(competitionIds.length);
    const rewrite = (table: string, key: string, cols: string[]) => {
      if (!this.hasTable(table)) return;
      const rows = this.sql.queryAll<SqlRow>(
        `SELECT ${quote(key)} AS k, ${cols.map(quote).join(', ')} FROM ${quote(table)}
         WHERE competition_id IN (${ph})`,
        competitionIds
      );
      for (const row of rows) {
        for (const col of cols) {
          const raw = row[col];
          if (typeof raw !== 'string' || !raw) continue;
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            continue;
          }
          const r = scrubIdentityInJson(parsed, replacements);
          if (r.changed) {
            this.sql.run(`UPDATE ${quote(table)} SET ${quote(col)} = ? WHERE ${quote(key)} = ?`, [
              JSON.stringify(r.value),
              row.k,
            ]);
          }
        }
      }
    };
    rewrite('session_state', 'competition_id', ['state_json']);
    rewrite('arena_state', 'arena_id', ['current_match', 'match_queue']);
    rewrite('fencer_abandons', 'id', ['match_snapshots']);
  }

  /** Anonymise des tireurs : `replacements` = id → pseudonyme */
  private anonymizeFencers(replacements: Map<string, string>): number {
    if (replacements.size === 0) return 0;
    const now = new Date().toISOString();
    const ids = [...replacements.keys()];
    const competitionIds = this.sql
      .queryAll<{ competition_id: string }>(
        `SELECT DISTINCT competition_id FROM fencers WHERE id IN (${this.placeholders(ids.length)})`,
        ids
      )
      .map(r => r.competition_id);
    for (const [id, pseudonym] of replacements) {
      this.sql.run(
        `UPDATE fencers SET last_name = ?, first_name = '', birth_date = NULL, license = NULL,
                photo = NULL, updated_at = ? WHERE id = ?`,
        [pseudonym, now, id]
      );
      if (this.hasTable('season_results')) {
        this.sql.run(
          `UPDATE season_results SET fencer_last_name = ?, fencer_first_name = '' WHERE fencer_id = ?`,
          [pseudonym, id]
        );
      }
    }
    // Signatures manuscrites : donnée identifiante non pseudonymisable
    const ph = this.placeholders(ids.length);
    for (const table of ['pool_signatures', 'de_match_signatures']) {
      if (this.hasTable(table)) {
        this.sql.run(`DELETE FROM ${quote(table)} WHERE fencer_id IN (${ph})`, ids);
      }
    }
    this.scrubSnapshots(replacements, competitionIds);
    return ids.length;
  }

  private anonymizeMembers(memberIds: string[], pseudonym: (id: string) => string): number {
    const now = new Date().toISOString();
    for (const id of memberIds) {
      this.sql.run(
        `UPDATE club_members SET last_name = ?, first_name = '', license = NULL, birth_year = NULL,
                birth_date = NULL, photo = NULL, notes = NULL,
                card_code = upper(hex(randomblob(5))), anonymized_at = ?, updated_at = ?
         WHERE id = ?`,
        [pseudonym(id), now, now, id]
      );
      this.sql.run('UPDATE club_attendance SET feedback = NULL WHERE member_id = ?', [id]);
    }
    return memberIds.length;
  }

  /**
   * Remplace nom, prénom, date de naissance, licence et photo par un pseudonyme
   * (identique dans toutes les compétitions) ; résultats et statistiques conservés.
   */
  public anonymizePerson(
    ref: PrivacyPersonRef,
    pseudonym = randomPseudonym()
  ): { fencers: number; members: number; pseudonym: string } {
    this.ensureOpen();
    const { fencerIds, memberIds } = this.resolveRef(ref);
    return this.sql.transaction(() => ({
      fencers: this.anonymizeFencers(new Map(fencerIds.map(id => [id, pseudonym]))),
      members: this.anonymizeMembers(memberIds, () => pseudonym),
      pseudonym,
    }));
  }

  // ─── Droit d'effacement ──────────────────────────────────────────────────────

  /** Supprime des tireurs et tout ce qui les référence (matchs, touches, signatures…) */
  private eraseFencers(ids: string[]): number {
    if (ids.length === 0) return 0;
    const ph = this.placeholders(ids.length);
    const competitionIds = this.sql
      .queryAll<{ competition_id: string }>(
        `SELECT DISTINCT competition_id FROM fencers WHERE id IN (${ph})`,
        ids
      )
      .map(r => r.competition_id);
    // Instantanés JSON : impossible de retirer l'objet sans casser l'état → libellé neutre
    this.scrubSnapshots(new Map(ids.map(id => [id, ERASED_LABEL])), competitionIds);

    const matchIds = this.sql
      .queryAll<{ id: string }>(
        `SELECT id FROM matches WHERE fencer_a_id IN (${ph}) OR fencer_b_id IN (${ph})`,
        [...ids, ...ids]
      )
      .map(r => r.id);
    if (matchIds.length) {
      const mph = this.placeholders(matchIds.length);
      for (const table of this.tables()) {
        // team_* : match_id désigne un match d'équipe, traité par les colonnes fencer_*
        if (table === 'matches' || table.startsWith('team_')) continue;
        if (!this.columns(table).includes('match_id')) continue;
        if (table === 'bracket_nodes') {
          // Structure du tableau conservée : la case devient vide
          this.sql.run(
            `UPDATE bracket_nodes SET match_id = NULL WHERE match_id IN (${mph})`,
            matchIds
          );
        } else {
          this.sql.run(`DELETE FROM ${quote(table)} WHERE match_id IN (${mph})`, matchIds);
        }
      }
    }
    if (this.hasTable('team_bout_cards') && this.hasTable('team_bouts')) {
      this.sql.run(
        `DELETE FROM team_bout_cards WHERE bout_id IN (
           SELECT id FROM team_bouts WHERE fencer_a_id IN (${ph}) OR fencer_b_id IN (${ph}))`,
        [...ids, ...ids]
      );
    }
    for (const { table, cols } of this.fencerRefTables()) {
      if (table === 'bracket_nodes') {
        this.sql.run(`UPDATE bracket_nodes SET fencer_id = NULL WHERE fencer_id IN (${ph})`, ids);
        continue;
      }
      const where = cols.map(c => `${quote(c)} IN (${ph})`).join(' OR ');
      this.sql.run(
        `DELETE FROM ${quote(table)} WHERE ${where}`,
        cols.flatMap(() => ids)
      );
    }
    this.sql.run(`DELETE FROM fencers WHERE id IN (${ph})`, ids);
    return ids.length;
  }

  private eraseMembers(ids: string[]): number {
    for (const id of ids) {
      this.sql.run('DELETE FROM club_bouts WHERE member_a_id = ? OR member_b_id = ?', [id, id]);
      this.sql.run('DELETE FROM club_attendance WHERE member_id = ?', [id]);
      this.sql.run('DELETE FROM club_members WHERE id = ?', [id]);
    }
    return ids.length;
  }

  /** Efface définitivement une personne de toutes les compétitions et du Mode Club */
  public erasePerson(ref: PrivacyPersonRef): { fencers: number; members: number } {
    this.ensureOpen();
    const { fencerIds, memberIds } = this.resolveRef(ref);
    return this.sql.transaction(() => ({
      fencers: this.eraseFencers(fencerIds),
      members: this.eraseMembers(memberIds),
    }));
  }

  // ─── Durée de conservation ───────────────────────────────────────────────────

  /**
   * Compétitions antérieures à `competitionCutoff` et membres sans activité (présence,
   * combat, modification) depuis `memberCutoff`, non encore anonymisés. Dates ISO.
   */
  public listRetentionCandidates(
    competitionCutoff: string | null,
    memberCutoff: string | null
  ): RetentionCandidates {
    this.ensureOpen();
    const competitions = competitionCutoff
      ? this.sql
          .queryAll<{ id: string; title: string; date: string; n: number }>(
            `SELECT c.id, c.title, c.date,
                    (SELECT COUNT(*) FROM fencers f WHERE f.competition_id = c.id) AS n
             FROM competitions c
             WHERE c.date < ? AND c.anonymized_at IS NULL
             ORDER BY c.date`,
            [competitionCutoff]
          )
          .map(r => ({ id: r.id, title: r.title, date: r.date, fencerCount: r.n }))
      : [];
    const members =
      memberCutoff && this.hasTable('club_members')
        ? this.sql
            .queryAll<{
              id: string;
              last_name: string;
              first_name: string;
              club_name: string | null;
              last_activity: string;
            }>(
              `SELECT * FROM (
                 SELECT m.id, m.last_name, m.first_name, cl.name AS club_name,
                   MAX(m.updated_at,
                       COALESCE((SELECT MAX(a.checked_in_at) FROM club_attendance a
                                 WHERE a.member_id = m.id), ''),
                       COALESCE((SELECT MAX(b.date) FROM club_bouts b
                                 WHERE b.member_a_id = m.id OR b.member_b_id = m.id), '')
                   ) AS last_activity
                 FROM club_members m LEFT JOIN clubs cl ON cl.id = m.club_id
                 WHERE m.anonymized_at IS NULL
               ) WHERE last_activity < ? ORDER BY last_activity`,
              [memberCutoff]
            )
            .map(r => ({
              id: r.id,
              lastName: r.last_name,
              firstName: r.first_name,
              clubName: r.club_name ?? '',
              lastActivity: r.last_activity,
            }))
        : [];
    return { competitions, members };
  }

  /** Anonymise tous les tireurs et arbitres d'une compétition (résultats conservés) */
  public anonymizeCompetition(competitionId: string): number {
    this.ensureOpen();
    return this.sql.transaction(() => {
      const fencers = this.sql.queryAll<{ id: string; ref: number }>(
        'SELECT id, ref FROM fencers WHERE competition_id = ?',
        [competitionId]
      );
      const n = this.anonymizeFencers(new Map(fencers.map(f => [f.id, `Anonyme ${f.ref}`])));
      this.sql.run(
        `UPDATE referees SET name = 'Arbitre ' || ref, license = NULL WHERE competition_id = ?`,
        [competitionId]
      );
      if (this.columns('score_audit_log').includes('ip_address')) {
        this.sql.run(
          `UPDATE score_audit_log SET referee_name = NULL, ip_address = NULL
           WHERE match_id IN (SELECT m.id FROM matches m JOIN fencers f ON f.id = m.fencer_a_id
                              WHERE f.competition_id = ?)`,
          [competitionId]
        );
      }
      this.sql.run('UPDATE competitions SET anonymized_at = ? WHERE id = ?', [
        new Date().toISOString(),
        competitionId,
      ]);
      return n;
    });
  }

  /** Anonymise des membres du club (combats et présences conservés pour les statistiques) */
  public anonymizeMembersById(memberIds: string[]): number {
    this.ensureOpen();
    const { memberIds: ids } = this.resolveRef({ memberIds });
    return this.sql.transaction(() => this.anonymizeMembers(ids, () => randomPseudonym()));
  }

  /** Efface des membres du club (présences et combats compris) */
  public eraseMembersById(memberIds: string[]): number {
    this.ensureOpen();
    const { memberIds: ids } = this.resolveRef({ memberIds });
    return this.sql.transaction(() => this.eraseMembers(ids));
  }

  /**
   * Supprime toutes les lignes d'une compétition, données personnelles comprises
   * (poules, matchs de poule, touches, signatures, instantanés de session…).
   * `keepSeason` : conserve les résultats déjà versés au classement saisonnier.
   */
  public purgeCompetition(competitionId: string, keepSeason = true): void {
    this.ensureOpen();
    const db = this.sql;
    const tables = new Set(this.tables());
    const has = (t: string) => tables.has(t);
    db.transaction(() => {
      const fencerIds = db
        .queryAll<{ id: string }>('SELECT id FROM fencers WHERE competition_id = ?', [
          competitionId,
        ])
        .map(r => r.id);
      const poolIds = has('pools')
        ? db
            .queryAll<{ id: string }>(
              `SELECT p.id FROM pools p JOIN phases ph ON ph.id = p.phase_id
               WHERE ph.competition_id = ?`,
              [competitionId]
            )
            .map(r => r.id)
        : [];
      const fph = this.placeholders(fencerIds.length);
      const pph = this.placeholders(poolIds.length);
      const matchIds = db
        .queryAll<{ id: string }>(
          `SELECT id FROM matches WHERE table_id = ?
           ${poolIds.length ? `OR pool_id IN (${pph})` : ''}
           ${fencerIds.length ? `OR fencer_a_id IN (${fph}) OR fencer_b_id IN (${fph})` : ''}`,
          [competitionId, ...poolIds, ...fencerIds, ...fencerIds]
        )
        .map(r => r.id);
      if (matchIds.length) {
        const mph = this.placeholders(matchIds.length);
        for (const t of tables) {
          if (t === 'matches' || t.startsWith('team_')) continue;
          if (this.columns(t).includes('match_id')) {
            db.run(`DELETE FROM ${quote(t)} WHERE match_id IN (${mph})`, matchIds);
          }
        }
        db.run(`DELETE FROM matches WHERE id IN (${mph})`, matchIds);
      }
      if (poolIds.length) {
        for (const t of ['pool_signatures', 'pool_fencers']) {
          if (has(t)) db.run(`DELETE FROM ${quote(t)} WHERE pool_id IN (${pph})`, poolIds);
        }
        db.run(`DELETE FROM pools WHERE id IN (${pph})`, poolIds);
      }
      if (has('team_matches')) {
        const tm = 'SELECT id FROM team_matches WHERE competition_id = ?';
        for (const t of ['team_bout_cards', 'team_bouts', 'team_match_cards']) {
          if (has(t)) db.run(`DELETE FROM ${quote(t)} WHERE match_id IN (${tm})`, [competitionId]);
        }
      }
      if (has('team_fencers') && has('teams')) {
        db.run(
          'DELETE FROM team_fencers WHERE team_id IN (SELECT id FROM teams WHERE competition_id = ?)',
          [competitionId]
        );
      }
      if (fencerIds.length) {
        for (const { table, cols } of this.fencerRefTables()) {
          if (keepSeason && table === 'season_results') continue;
          const where = cols.map(c => `${quote(c)} IN (${fph})`).join(' OR ');
          db.run(
            `DELETE FROM ${quote(table)} WHERE ${where}`,
            cols.flatMap(() => fencerIds)
          );
        }
      }
      for (const t of tables) {
        if (t === 'competitions' || t === 'fencers') continue;
        if (keepSeason && t === 'season_results') continue;
        if (this.columns(t).includes('competition_id')) {
          db.run(`DELETE FROM ${quote(t)} WHERE competition_id = ?`, [competitionId]);
        }
      }
      db.run('DELETE FROM fencers WHERE competition_id = ?', [competitionId]);
      db.run('DELETE FROM competitions WHERE id = ?', [competitionId]);
    });
  }
}
