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

  beforeEach(() => {
    listeners = [];
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onUpdateAvailable: (cb: (info: typeof INFO) => void) => {
        listeners.push(cb);
        return () => {};
      },
      onUpdateProgress: () => () => {},
      updater: { downloadAndInstall: vi.fn() },
    };
  });

  it('absent sans mise à jour, affiché (classe clignotante) dès update:available', () => {
    render(<UpdateMenuButton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => listeners.forEach(l => l(INFO)));
    const btn = screen.getByRole('button', { name: /v1\.3\.0/ });
    expect(btn).toHaveClass('update-menu-button');
  });

  it('clic : réaffiche la bannière fermée', () => {
    render(
      <>
        <UpdateMenuButton />
        <UpdateNotification />
      </>
    );
    act(() => listeners.forEach(l => l(INFO)));
    fireEvent.click(screen.getByRole('button', { name: '✖️' }));
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
