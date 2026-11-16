import { describe, it, expect } from 'vitest';
import { monthGrid, monthTitle, shiftMonth, weekdayLabels } from './miniCalendar';

describe('mini-calendrier (#1872)', () => {
  it('novembre 2026 : commence le lundi 26 octobre, 6 semaines', () => {
    const g = monthGrid(2026, 11);
    expect(g).toHaveLength(6);
    expect(g[0][0]).toEqual({ iso: '2026-10-26', day: 26, inMonth: false });
    expect(g[0][6]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(g.flat().filter(c => c.inMonth)).toHaveLength(30);
  });

  it('mois commençant un lundi (juin 2026)', () => {
    expect(monthGrid(2026, 6)[0][0]).toMatchObject({ iso: '2026-06-01', inMonth: true });
  });

  it('février bissextile', () => {
    expect(
      monthGrid(2028, 2)
        .flat()
        .filter(c => c.inMonth)
    ).toHaveLength(29);
  });

  it('navigation entre années', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('libellés localisés', () => {
    expect(weekdayLabels('fr-FR')).toHaveLength(7);
    expect(weekdayLabels('en-GB')[0]).toBe('M');
    expect(monthTitle(2026, 11, 'fr-FR')).toBe('novembre 2026');
  });
});
