// @vitest-environment jsdom
/**
 * Tests de composant - PoolRankingView : rang affiché des exclus (#1440)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import PoolRankingView from './PoolRankingView';
import { TranslationProvider } from '../contexts/TranslationContext';
import { FencerStatus, PoolRanking, Weapon } from '../../shared/types';

const row = (
  id: string,
  rank: number,
  status: FencerStatus,
  exclusionReason?: 'black_card'
): PoolRanking =>
  ({
    fencer: {
      id,
      lastName: `NOM${id}`,
      firstName: 'Prénom',
      status,
      exclusionReason,
    },
    rank,
    victories: 0,
    defeats: 0,
    ratio: 0,
    touchesScored: 0,
    touchesReceived: 0,
    index: 0,
  }) as unknown as PoolRanking;

describe('PoolRankingView – exclusions (#1440)', () => {
  it('carton noir → rang « - » + icône ; exclusion simple → DNF', () => {
    const ranking = [
      row('1', 1, FencerStatus.QUALIFIED),
      row('2', 2, FencerStatus.EXCLUDED, 'black_card'),
      row('3', 3, FencerStatus.EXCLUDED),
    ];
    const { container } = render(
      <TranslationProvider>
        <PoolRankingView pools={[]} weapon={Weapon.EPEE} ranking={ranking} />
      </TranslationProvider>
    );
    const rows = [...container.querySelectorAll('tbody tr')];
    const rowOf = (name: string) => rows.find(r => r.textContent?.includes(name))!;
    expect(rowOf('NOM2').querySelector('td')?.textContent?.trim()).toBe('-');
    expect(rowOf('NOM2').querySelector('.card-icon-black')).not.toBeNull();
    expect(rowOf('NOM3').querySelector('td')?.textContent?.trim()).toBe('DNF');
    expect(rowOf('NOM3').querySelector('.card-icon-black')).toBeNull();
    expect(screen.getByText('NOM1').closest('tr')?.querySelector('td')?.textContent?.trim()).toBe(
      '1'
    );
  });
});
