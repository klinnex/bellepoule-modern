/**
 * BellePoule Modern - Libellé d'une occupation d'arbitre sur la journée (#1714).
 * Licensed under GPL-3.0
 */
import type { DayRefereeAssignment } from '../../shared/types/eventDay';

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** "Piste 3 · M15 Fleuret (Poule 2)" */
export function formatAssignment(a: DayRefereeAssignment, t: TFn): string {
  const what =
    a.kind === 'pool' ? t('eventDay.pool', { n: a.number }) : t('eventDay.match', { n: a.number });
  const where = a.strip != null ? `${t('eventDay.strip', { n: a.strip })} · ` : '';
  return `${where}${a.competitionTitle} (${what})`;
}
