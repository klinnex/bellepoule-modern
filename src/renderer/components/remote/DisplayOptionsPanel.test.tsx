// @vitest-environment jsdom
/**
 * Tests du panneau d'options d'affichage extrait de RemoteScoreManager (#1414)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DisplayOptionsPanel } from './DisplayOptionsPanel';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const updateTheme = vi.fn().mockResolvedValue(undefined);
const updateKioskViews = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    remote: { updateTheme, updateKioskViews, setWallpaper: vi.fn() },
  };
});

const views = { poules: true, classement: false, direct: false, suivants: false };

describe('DisplayOptionsPanel', () => {
  it('change le thème et le synchronise avec le serveur', async () => {
    const setDisplayTheme = vi.fn();
    render(
      <DisplayOptionsPanel
        competitionId="c1"
        displayTheme="dark"
        setDisplayTheme={setDisplayTheme}
        arenaWallpaper={null}
        setArenaWallpaper={vi.fn()}
        kioskViews={views}
        setKioskViews={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/rsm.theme_light/));
    expect(setDisplayTheme).toHaveBeenCalledWith('light');
    await waitFor(() => expect(updateTheme).toHaveBeenCalledWith('c1', 'light'));
  });

  it('bascule une vue du kiosk', async () => {
    const setKioskViews = vi.fn();
    render(
      <DisplayOptionsPanel
        competitionId="c1"
        displayTheme="dark"
        setDisplayTheme={vi.fn()}
        arenaWallpaper={null}
        setArenaWallpaper={vi.fn()}
        kioskViews={views}
        setKioskViews={setKioskViews}
      />
    );
    fireEvent.click(screen.getByText('rsm.view_ranking'));
    expect(setKioskViews).toHaveBeenCalledWith({ ...views, classement: true });
    await waitFor(() => expect(updateKioskViews).toHaveBeenCalled());
  });
});
