// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  clubSummaryHtml,
  groupByClub,
  matchTouchesChartHtml,
  zoneFiguresHtml,
} from './statsCharts';
import { touchZoneFigureSvg, zonePaints } from '../touchZoneFigure';
import type { FencerCompetitionStats } from '../../types';

const stat = (id: string, club: string | undefined, g: number[], r: number[]) =>
  ({
    fencerId: id,
    fencerLastName: id.toUpperCase(),
    fencerFirstName: 'X',
    fencerClub: club,
    touchesZoneA: g[0],
    touchesZoneB: g[1],
    touchesZoneC: g[2],
    totalTouchPoints: g[0] + g[1] * 3 + g[2] * 5,
    receivedZoneA: r[0],
    receivedZoneB: r[1],
    receivedZoneC: r[2],
    receivedTouchPoints: r[0] + r[1] * 3 + r[2] * 5,
    whiteCards: 0,
    yellowCards: 1,
    redCards: 0,
    matchesPlayed: 2,
    totalDurationSeconds: 300,
    averageDurationSeconds: 150,
  }) as FencerCompetitionStats;

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('touchZoneFigure', () => {
  it('mannequin SVG : zone la plus touchée en foncé, zone vide en gris', () => {
    const paints = zonePaints([0, 2, 7]);
    expect(paints.c.shade).toBe('dark');
    expect(paints.b.shade).toBe('light');
    expect(paints.a.shade).toBe('none');
    const svg = doc(touchZoneFigureSvg([0, 2, 7])).querySelector('svg')!;
    expect(svg.querySelectorAll('ellipse, rect, circle, line').length).toBe(11);
    expect(svg.querySelector('ellipse')!.getAttribute('fill')).toBe(paints.c.fill);
  });
});

describe('statsCharts', () => {
  it('les 2 corps : touches données puis reçues', () => {
    const d = doc(zoneFiguresHtml([1, 2, 3], [4, 0, 1]));
    const labels = [...d.querySelectorAll('svg')].map(s => s.getAttribute('aria-label'));
    expect(labels).toEqual(['Touches données A=1 B=2 C=3', 'Touches reçues A=4 B=0 C=1']);
    expect(d.querySelector('.figure-card.received')).not.toBeNull();
  });

  it('touches par match : une ligne par match joué, noms échappés', () => {
    const d = doc(
      matchTouchesChartHtml([
        { label: '<b>X</b>', given: 5, received: 3, isVictory: true },
        { label: 'Y', given: 0, received: 0, isVictory: false },
      ])
    );
    expect(d.querySelectorAll('.match-chart-row').length).toBe(1);
    expect(d.querySelector('.match-chart-name b')).toBeNull();
    expect(matchTouchesChartHtml([])).toBe('');
  });

  it('résumé par club : tri alphabétique, « sans club » en dernier, totaux', () => {
    const fencers = [
      stat('a', 'Sith', [1, 0, 0], [0, 1, 0]),
      stat('b', 'Jedi', [0, 1, 0], [0, 0, 1]),
      stat('c', undefined, [0, 0, 1], [1, 0, 0]),
      stat('d', 'Jedi', [2, 0, 0], [0, 0, 0]),
    ];
    expect([...groupByClub(fencers).keys()]).toEqual(['Jedi', 'Sith', '']);
    const results = new Map([
      ['a', { victories: 1, defeats: 1, td: 8, tr: 6 }],
      ['b', { victories: 2, defeats: 0, td: 10, tr: 4 }],
      ['d', { victories: 0, defeats: 2, td: 3, tr: 10 }],
    ]);
    const d = doc(clubSummaryHtml(fencers, results, true, 'T', '2026-11-13'));
    const rows = [...d.querySelectorAll('.ranking-table')[0].querySelectorAll('tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent)
    );
    expect(rows[0]).toEqual(['Jedi', '2', '2', '2', '50%', '13', '14', '-1', '2']);
    expect(rows[2][0]).toBe('Sans club');
    expect(d.querySelectorAll('.club-block').length).toBe(3);
    expect(d.querySelectorAll('.club-block svg').length).toBe(6);
  });
});
