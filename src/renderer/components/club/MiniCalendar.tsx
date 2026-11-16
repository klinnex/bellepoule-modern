/**
 * BellePoule Modern - Mini-calendrier de choix de date (séances du Mode Club, #1872).
 * Mois navigable, aujourd'hui entouré, jours déjà occupés par une séance marqués.
 * Licensed under GPL-3.0
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getActiveLocale } from '../../../shared/utils/localeFormat';
import {
  monthGrid,
  monthTitle,
  shiftMonth,
  weekdayLabels,
} from '../../../shared/utils/miniCalendar';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../common/Button';

export type DayMark = 'planned' | 'open' | 'closed';

interface MiniCalendarProps {
  /** Date choisie AAAA-MM-JJ */
  value: string;
  onChange: (iso: string) => void;
  /** Aujourd'hui (AAAA-MM-JJ) */
  today: string;
  /** Jours ayant déjà une séance */
  marks?: Readonly<Record<string, DayMark>>;
  label?: string;
}

export const MiniCalendar: React.FC<MiniCalendarProps> = ({
  value,
  onChange,
  today,
  marks = {},
  label,
}) => {
  const { t } = useTranslation();
  const locale = getActiveLocale();
  const [y0, m0] = (value || today).split('-').map(Number);
  const [view, setView] = useState({ year: y0, month: m0 });
  const go = (delta: number) => setView(v => shiftMonth(v.year, v.month, delta));

  return (
    <div className="mini-cal" role="group" aria-label={label ?? t('miniCalendar.label')}>
      <div className="mini-cal-head">
        <Button
          size="sm"
          variant="ghost"
          icon={<ChevronLeft size={16} aria-hidden="true" />}
          aria-label={t('miniCalendar.prev')}
          title={t('miniCalendar.prev')}
          onClick={() => go(-1)}
        />
        <span className="mini-cal-title" aria-live="polite">
          {monthTitle(view.year, view.month, locale)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={<ChevronRight size={16} aria-hidden="true" />}
          aria-label={t('miniCalendar.next')}
          title={t('miniCalendar.next')}
          onClick={() => go(1)}
        />
      </div>
      <table className="mini-cal-grid" role="grid">
        <thead>
          <tr>
            {weekdayLabels(locale).map((d, i) => (
              <th key={i} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(view.year, view.month).map(week => (
            <tr key={week[0].iso}>
              {week.map(c => {
                const mark = marks[c.iso];
                const cls = [
                  'mini-cal-day',
                  c.inMonth ? '' : 'is-out',
                  c.iso === today ? 'is-today' : '',
                  c.iso === value ? 'is-selected' : '',
                  mark ? `has-${mark}` : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td key={c.iso}>
                    <button
                      type="button"
                      className={cls}
                      aria-pressed={c.iso === value}
                      aria-label={`${c.iso}${mark ? ` — ${t(`miniCalendar.mark_${mark}`)}` : ''}`}
                      onClick={() => onChange(c.iso)}
                    >
                      {c.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
