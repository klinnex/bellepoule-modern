/**
 * BellePoule Modern - Pistes d'une journée multi-épreuves (#1878) : réservation par piste
 * (épreuves et phases autorisées) et affectation automatique des pistes libérées.
 * Licensed under GPL-3.0
 */
import type { SqlExecutor } from './sqlExecutor';
import type { StripRule } from '../../shared/types/eventDay';
import { isDefaultStripRule, normalizeStripRule } from '../../shared/utils/stripRules';

export class StripRuleRepo {
  constructor(private readonly sql: SqlExecutor) {}

  /** Réservations d'une journée, par numéro de piste (pistes sans réservation absentes) */
  public getStripRules(dayId: string): Record<number, StripRule> {
    if (!this.sql.db || !dayId) return {};
    const rows = this.sql.queryAll<{ strip: number; rule: string }>(
      'SELECT strip, rule FROM event_day_strip_rules WHERE event_day_id = ?',
      [dayId]
    );
    const out: Record<number, StripRule> = {};
    for (const row of rows) {
      try {
        out[row.strip] = normalizeStripRule(JSON.parse(row.rule));
      } catch {
        /* règle illisible : piste sans réservation */
      }
    }
    return out;
  }

  /** Enregistre la réservation d'une piste ; règle par défaut (ou null) = réservation retirée */
  public setStripRule(dayId: string, strip: number, rule: StripRule | null): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run('DELETE FROM event_day_strip_rules WHERE event_day_id = ? AND strip = ?', [
      dayId,
      strip,
    ]);
    const r = rule ? normalizeStripRule(rule) : null;
    if (!r || isDefaultStripRule(r)) return;
    this.sql.run('INSERT INTO event_day_strip_rules (event_day_id, strip, rule) VALUES (?, ?, ?)', [
      dayId,
      strip,
      JSON.stringify(r),
    ]);
  }

  public getAutoAssign(dayId: string): boolean {
    if (!this.sql.db) return false;
    const row = this.sql.queryOne<{ auto_assign: number }>(
      'SELECT auto_assign FROM event_days WHERE id = ?',
      [dayId]
    );
    return row?.auto_assign === 1;
  }

  public setAutoAssign(dayId: string, on: boolean): void {
    if (!this.sql.db) throw new Error('Database not open');
    this.sql.run('UPDATE event_days SET auto_assign = ? WHERE id = ?', [on ? 1 : 0, dayId]);
  }

  /** Journées en affectation automatique */
  public listAutoAssignDays(): string[] {
    if (!this.sql.db) return [];
    return this.sql
      .queryAll<{ id: string }>('SELECT id FROM event_days WHERE auto_assign = 1')
      .map(r => r.id);
  }
}
