// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import UpdateNotification from '../UpdateNotification';
import type { UpdateProgressEvent } from '../../../shared/types/preload';

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

describe('UpdateNotification — mise à jour intégrée', () => {
  let emitAvailable: (info: typeof INFO) => void;
  let emitProgress: (d: UpdateProgressEvent) => void;
  let downloadAndInstall: ReturnType<typeof vi.fn>;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloadAndInstall = vi.fn().mockResolvedValue({ success: true });
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    (window as any).electronAPI = {
      onUpdateAvailable: (cb: typeof emitAvailable) => {
        emitAvailable = cb;
        return () => {};
      },
      onUpdateProgress: (cb: typeof emitProgress) => {
        emitProgress = cb;
        return () => {};
      },
      updater: { downloadAndInstall },
    };
  });

  it('s’affiche sur update:available et installe sans ouvrir le navigateur', async () => {
    render(<UpdateNotification />);
    expect(screen.queryByText(/1\.3\.0/)).not.toBeInTheDocument();

    act(() => emitAvailable(INFO));
    expect(screen.getByText(/v1\.3\.0/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Installer/ }));
    });
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('affiche la progression du téléchargement', () => {
    render(<UpdateNotification />);
    act(() => emitAvailable(INFO));
    act(() => emitProgress({ progress: 40 }));
    expect(screen.getByText(/40 %/)).toBeInTheDocument();
  });

  it('téléchargement lancé depuis le menu : bannière + barre de progression sans update:available', () => {
    render(<UpdateNotification />);
    act(() =>
      emitProgress({
        progress: 0,
        latestVersion: '1.3.0',
        latestBuild: 12,
        currentBuild: 10,
      })
    );
    act(() => emitProgress({ progress: 55 }));
    expect(screen.getByText(/v1\.3\.0/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '55');
  });

  it('ses styles sont dans une feuille chargée (components.css)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../styles/components.css'), 'utf8');
    expect(css).toMatch(/\.update-notification \{[^}]*position: fixed/);
  });
});
