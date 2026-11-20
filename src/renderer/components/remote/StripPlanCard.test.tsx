// @vitest-environment jsdom
/**
 * Tests du plan des pistes et du store des pistes indisponibles (#1501)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StripPlanCard } from './StripPlanCard';
import { useStripAvailability } from '../../hooks/useStripAvailability';
import { availableStrips, stripAtIndex } from '../../../shared/utils/stripRange';
import { computePoolStrips } from '../../../shared/utils/poolStrips';
import { buildSessionMatches } from './sessionMatches';
import type { Pool } from '../../../shared/types';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

beforeEach(() => {
  localStorage.clear();
  useStripAvailability.setState({ competitionId: null, unavailable: [] });
  useStripAvailability.getState().load('c1');
});

describe('StripPlanCard', () => {
  it('est replié par défaut puis affiche les pistes de l’intervalle', () => {
    render(<StripPlanCard start={5} end={7} />);
    expect(screen.queryByText('5')).toBeNull();
    fireEvent.click(screen.getByText(/rsm.strip_plan$/));
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('4')).toBeNull();
  });

  it('passe une piste en indisponible (rouge) et la persiste', () => {
    render(<StripPlanCard start={1} end={3} />);
    fireEvent.click(screen.getByText(/rsm.strip_plan$/));
    fireEvent.click(screen.getByText('2'));
    expect(screen.getByText('2')).toHaveClass('is-unavailable');
    expect(useStripAvailability.getState().unavailable).toEqual([2]);
    expect(localStorage.getItem('bellepoule-strips-unavailable-c1')).toBe('[2]');
    fireEvent.click(screen.getByText('2'));
    expect(screen.getByText('2')).not.toHaveClass('is-unavailable');
  });

  it('recharge les pistes indisponibles d’une compétition', () => {
    localStorage.setItem('bellepoule-strips-unavailable-c2', '[3,4]');
    useStripAvailability.getState().load('c2');
    expect(useStripAvailability.getState().unavailable).toEqual([3, 4]);
  });
});

describe('répartition automatique avec pistes indisponibles', () => {
  it('availableStrips exclut les indisponibles, sans jamais renvoyer une liste vide', () => {
    expect(availableStrips(5, 8, [6, 7])).toEqual([5, 8]);
    expect(availableStrips(1, 2, [1, 2])).toEqual([1, 2]);
  });

  it('stripAtIndex tourne sur les pistes disponibles', () => {
    expect([0, 1, 2].map(i => stripAtIndex(5, 8, i, [6, 7]))).toEqual([5, 8, 5]);
  });

  it('computePoolStrips saute les pistes indisponibles', () => {
    const res = computePoolStrips(
      [
        { id: 'a', number: 1 },
        { id: 'b', number: 2 },
      ],
      6,
      5,
      [5]
    );
    expect(res.get('a')).toBe(6);
    expect(res.has('b')).toBe(false);
  });

  it('buildSessionMatches applique les pistes calculées', () => {
    const pool = { id: 'p1', number: 1, fencers: [], matches: [] } as unknown as Pool;
    const out = buildSessionMatches([pool], [], new Map([['p1', 6]]));
    expect(out.poolMatches[0]).toMatchObject({ __poolFencers: true, strip: 6 });
    expect(out.allMatches).toHaveLength(1);
  });
});
