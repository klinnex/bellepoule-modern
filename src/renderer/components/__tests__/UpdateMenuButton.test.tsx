// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UpdateMenuButton from '../UpdateMenuButton';
import UpdateNotification from '../UpdateNotification';

vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

const INFO = {
  hasUpdate: true,
  currentBuild: 10,
  latestBuild: 12,
  latestVersion: '1.3.0',
  downloadUrl: '',
  releaseNotes: '',
};

describe('UpdateMenuButton — bouton clignotant de l’en-tête', () => {
  let listeners: Array<(info: typeof INFO) => void>;
  let check: ReturnType<typeof vi.fn>;
  let getAutoCheck: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = [];
    check = vi.fn().mockResolvedValue({ ...INFO, hasUpdate: false });
    getAutoCheck = vi.fn().mockResolvedValue({ enabled: true });
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onUpdateAvailable: (cb: (info: typeof INFO) => void) => {
        listeners.push(cb);
        return () => {};
      },
      onUpdateProgress: () => () => {},
      updater: { downloadAndInstall: vi.fn(), check, getAutoCheck },
    };
  });

  it('« À jour » après vérification ; clic → revérifie', async () => {
    await act(async () => {
      render(<UpdateMenuButton />);
    });
    const btn = screen.getByRole('button', { name: /À jour/ });
    expect(btn).not.toHaveClass('update-menu-button');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('« Mise à jour dispo » clignotant dès update:available', async () => {
    await act(async () => {
      render(<UpdateMenuButton />);
    });
    act(() => listeners.forEach(l => l(INFO)));
    const btn = screen.getByRole('button', { name: /v1\.3\.0/ });
    expect(btn).toHaveClass('update-menu-button');
    expect(btn).toHaveTextContent('Mise à jour dispo');
  });

  it('vérification au lancement désactivée : pas de requête, bouton « Vérifier »', async () => {
    getAutoCheck.mockResolvedValue({ enabled: false });
    await act(async () => {
      render(<UpdateMenuButton />);
    });
    expect(check).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Vérifier les mises à jour/ })).toBeInTheDocument();
  });

  it('mise à jour trouvée au lancement : clic ouvre la bannière avec la version', async () => {
    check.mockResolvedValue(INFO);
    await act(async () => {
      render(
        <>
          <UpdateMenuButton />
          <UpdateNotification />
        </>
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /v1\.3\.0/ }));
    expect(screen.getByRole('button', { name: /Installer/ })).toBeInTheDocument();
  });

  it('clic : réaffiche la bannière fermée', async () => {
    await act(async () => {
      render(
        <>
          <UpdateMenuButton />
          <UpdateNotification />
        </>
      );
    });
    act(() => listeners.forEach(l => l(INFO)));
    fireEvent.click(screen.getByRole('button', { name: /actions\.close|Fermer/ }));
    expect(screen.queryByRole('button', { name: /Installer/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /v1\.3\.0/ }));
    expect(screen.getByRole('button', { name: /Installer/ })).toBeInTheDocument();
  });

  it('animation de clignotement définie (et coupée si mouvement réduit)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../styles/components.css'), 'utf8');
    expect(css).toMatch(/\.update-menu-button \{[^}]*animation: update-menu-blink/);
    expect(css).toMatch(
      /prefers-reduced-motion[^{]*\{\s*\.update-menu-button \{[^}]*animation: none/
    );
  });
});
