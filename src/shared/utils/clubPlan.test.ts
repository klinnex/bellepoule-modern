import { describe, it, expect } from 'vitest';
import {
  cleanLongText,
  formatMinutes,
  normalizeFeedback,
  normalizePlan,
  planDuration,
} from './clubPlan';

describe('plan de cours et bilan (#1872)', () => {
  it('plan : titre requis, durée bornée, consignes multilignes, chevrons retirés', () => {
    const plan = normalizePlan([
      { id: 'a', title: ' Échauffement ', minutes: 15, details: 'Course\n<b>Étirements</b>' },
      { title: '', minutes: 5 },
      { title: 'Assauts', minutes: 9999, done: true },
      'x',
    ]);
    expect(plan).toEqual([
      { id: 'a', title: 'Échauffement', minutes: 15, details: 'Course\nbÉtirements/b' },
      expect.objectContaining({ title: 'Assauts', minutes: 600, done: true }),
    ]);
    expect(normalizePlan('nope')).toEqual([]);
    expect(normalizePlan(Array.from({ length: 80 }, (_, i) => ({ title: `E${i}` })))).toHaveLength(
      50
    );
  });

  it('durée totale et format', () => {
    expect(
      planDuration([
        { id: 'a', title: 'x', minutes: 20 },
        { id: 'b', title: 'y', minutes: 70 },
      ])
    ).toBe(90);
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(95)).toBe('1 h 35');
  });

  it('bilan : note 1..5, textes nettoyés, vide → undefined', () => {
    expect(normalizeFeedback({ rating: 4.4, wentWell: ' bien ', toImprove: '' })).toEqual({
      rating: 4,
      wentWell: 'bien',
    });
    expect(normalizeFeedback({ rating: 9 })).toBeUndefined();
    expect(normalizeFeedback(null)).toBeUndefined();
    expect(cleanLongText('  ')).toBeUndefined();
  });
});
