// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubImportModal } from './ClubImportModal';

const rows = [
  { lastName: 'NEUF', firstName: 'Léa' },
  { lastName: 'MARTIN', firstName: 'Anne', license: '1' },
  { lastName: 'ROUX', firstName: 'Zoé' },
  { lastName: 'NEUF', firstName: 'Lea' },
];
const statuses = [
  { kind: 'new' as const },
  { kind: 'update' as const, id: 'a', data: { birthYear: 2010 } },
  { kind: 'present' as const, id: 'r' },
  { kind: 'duplicate' as const },
];

describe('ClubImportModal (#1872)', () => {
  it('coche par défaut nouveaux et à compléter, décoche, importe la sélection', () => {
    const onConfirm = vi.fn();
    render(
      <ClubImportModal
        fileName="club.fff"
        rows={rows}
        statuses={statuses}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'NEUF Léa' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'MARTIN Anne' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'ROUX Zoé' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'NEUF Lea' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'NEUF Léa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Importer la sélection (1)' }));
    expect(onConfirm).toHaveBeenCalledWith([rows[1]]);
  });

  it('tout décocher / tout cocher (lignes filtrées)', () => {
    render(
      <ClubImportModal
        fileName="club.fff"
        rows={rows}
        statuses={statuses}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tout décocher' }));
    expect(screen.getByRole('button', { name: 'Importer la sélection (0)' })).toBeDisabled();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'martin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tout cocher' }));
    expect(screen.getByRole('button', { name: 'Importer la sélection (1)' })).toBeEnabled();
  });
});
