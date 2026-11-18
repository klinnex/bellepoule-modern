// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import type { ClubMember } from '../../../shared/types/club';
import { ClubMemberQrModal } from './ClubMemberQrModal';

const member: ClubMember = {
  id: 'm1',
  clubId: 'c1',
  firstName: 'Léa',
  lastName: 'NEUF',
  weapons: [],
  active: true,
  cardCode: '0123456789',
  createdAt: '',
  updatedAt: '',
};

describe('ClubMemberQrModal (#1872)', () => {
  it('affiche le QR du membre et imprime sa seule carte', async () => {
    const onPrint = vi.fn().mockResolvedValue(undefined);
    render(<ClubMemberQrModal member={member} onPrint={onPrint} onClose={vi.fn()} />);
    expect(await screen.findByRole('img', { name: /Léa NEUF/ })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png/)
    );
    expect(screen.getByText('0123456789')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer sa carte' }));
    expect(onPrint).toHaveBeenCalledWith('print');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer sa carte en PDF' }));
    expect(onPrint).toHaveBeenCalledWith('pdf');
  });

  it('membre archivé : impression désactivée', () => {
    render(
      <ClubMemberQrModal
        member={{ ...member, active: false }}
        onPrint={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Imprimer sa carte' })).toBeDisabled();
  });
});
