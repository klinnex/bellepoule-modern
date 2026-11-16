// @vitest-environment jsdom
/**
 * Tests de composant - PoolSignaturesModal (#1826)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
import { PoolSignaturesModal } from './PoolSignaturesModal';
import { Fencer, Gender, FencerStatus } from '../../../shared/types';

const fencer = (id: string, last: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: last,
  firstName: 'Prenom',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('PoolSignaturesModal', () => {
  it('liste les tireurs, signature affichée ou « non signé », sans édition', async () => {
    const getPoolSignatures = vi
      .fn()
      .mockResolvedValue([{ fencerId: '1', signatureData: 'data:image/png;base64,AAA' }]);
    (window as unknown as { electronAPI: unknown }).electronAPI = { db: { getPoolSignatures } };
    render(
      <PoolSignaturesModal
        poolId="p1"
        poolNumber={2}
        fencers={[fencer('1', 'DUPONT'), fencer('2', 'MARTIN')]}
        onClose={() => {}}
      />
    );
    expect(getPoolSignatures).toHaveBeenCalledWith('p1');
    const img = await screen.findByAltText('DUPONT Prenom');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAA');
    expect(screen.getByText('poolView.not_signed')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
