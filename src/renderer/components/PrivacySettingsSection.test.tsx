// @vitest-environment jsdom
/**
 * Paramètres → Confidentialité (RGPD, #1882) : recherche d'une personne, anonymisation
 * confirmée, archive chiffrée (mots de passe vérifiés avant l'appel au main).
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import PrivacySettingsSection from './PrivacySettingsSection';
import { ConfirmProvider } from './ConfirmDialog';
import { ToastProvider } from './Toast';

const person = {
  key: 'lic:777',
  lastName: 'LEFEVRE',
  firstName: 'Zoé',
  birthDate: null,
  license: '777',
  club: 'CE',
  fencers: [
    { fencerId: 'f1', competitionId: 'c1', competitionTitle: 'Open', competitionDate: null },
  ],
  members: [{ memberId: 'm1', clubId: 'k', clubName: 'CE' }],
};

let privacy: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  privacy = {
    getSettings: vi.fn(async () => ({
      nameMasking: 'full',
      competitionRetentionMonths: 0,
      memberRetentionMonths: 0,
      retentionAction: 'anonymize',
      autoPurge: false,
    })),
    findPersons: vi.fn(async () => [person]),
    anonymizePerson: vi.fn(async () => ({ fencers: 1, members: 1, pseudonym: 'Anonyme X' })),
    exportEncryptedBpm: vi.fn(async () => ({ success: true })),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    privacy,
    db: { getAllCompetitions: vi.fn(async () => []) },
  };
});

const wrap = (item: React.ComponentProps<typeof PrivacySettingsSection>['item']) =>
  render(
    <ToastProvider>
      <ConfirmProvider>
        <PrivacySettingsSection item={item} />
      </ConfirmProvider>
    </ToastProvider>
  );

describe('PrivacySettingsSection', () => {
  it('trouve une personne et l’anonymise après confirmation', async () => {
    wrap('privacy_person');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'lef' } });
    await screen.findByText(/LEFEVRE Zoé/);
    fireEvent.click(screen.getByRole('button', { name: 'Anonymiser' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Anonymiser')!
    );
    await waitFor(() =>
      expect(privacy.anonymizePerson).toHaveBeenCalledWith({ fencerIds: ['f1'], memberIds: ['m1'] })
    );
  });

  it('archive chiffrée : refuse des mots de passe différents', async () => {
    wrap('privacy_bpm');
    const [p1, p2] = screen.getAllByLabelText(/Mot de passe|Confirmation/);
    fireEvent.change(p1, { target: { value: 'motdepasse1' } });
    fireEvent.change(p2, { target: { value: 'motdepasse2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter chiffré' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Les mots de passe diffèrent.');
    expect(privacy.exportEncryptedBpm).not.toHaveBeenCalled();
    fireEvent.change(p2, { target: { value: 'motdepasse1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter chiffré' }));
    await waitFor(() =>
      expect(privacy.exportEncryptedBpm).toHaveBeenCalledWith(null, 'motdepasse1')
    );
  });
});
