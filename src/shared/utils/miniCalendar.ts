/**
 * BellePoule Modern - Mini-calendrier (Mode Club #1872) : grille d'un mois, semaines
 * commençant le lundi, dates ISO AAAA-MM-JJ (UTC, sans décalage de fuseau).
 * Licensed under GPL-3.0
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const isoOf = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

export interface CalendarCell {
  iso: string;
  day: number;
  /** Jour du mois affiché (sinon mois précédent / suivant) */
  inMonth: boolean;
}

/** Semaines (6 × 7 cellules) du mois `month` (1-12) de l'année `year` */
export function monthGrid(year: number, month: number): CalendarCell[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // Lundi = 0 … dimanche = 6
  const offset = (first.getUTCDay() + 6) % 7;
  const start = Date.UTC(year, month - 1, 1 - offset);
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start + (w * 7 + d) * 86_400_000);
      row.push({
        iso: isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month - 1,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Mois voisin : { year, month } décalé de delta mois */
export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Initiales des jours (lundi → dimanche) dans la langue donnée */
export function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  // 2024-01-01 est un lundi
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/** « novembre 2026 » dans la langue donnée */
export function monthTitle(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
