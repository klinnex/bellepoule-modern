// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('../../../renderer/services/offlineSync', () => ({
  offlineSync: {
    isCurrentlyOnline: vi.fn().mockReturnValue(true),
    isCurrentlySyncing: vi.fn().mockReturnValue(false),
    onSyncComplete: vi.fn(),
    triggerSync: vi
      .fn()
      .mockResolvedValue({ success: true, synced: 0, failed: 0, conflicts: 0, errors: [] }),
  },
}));

vi.mock('../../../renderer/services/offlineStorage', () => ({
  offlineStorage: {
    getSyncStatus: vi.fn().mockResolvedValue({
      pendingActions: 0,
      conflicts: 0,
      lastSync: null,
    }),
  },
}));

vi.mock('@shared/services/cloudSyncService', () => ({
  SyncConflict: {},
}));

vi.mock('../ConflictResolutionModal', () => ({
  ConflictResolutionModal: () => null,
}));

// Import après les mocks
import { OfflineStatus } from '../OfflineStatus';
import { offlineSync } from '../../../renderer/services/offlineSync';
import { offlineStorage } from '../../../renderer/services/offlineStorage';

describe('OfflineStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (offlineSync.isCurrentlyOnline as any).mockReturnValue(true);
    (offlineSync.isCurrentlySyncing as any).mockReturnValue(false);
    (offlineSync.onSyncComplete as any).mockImplementation(() => {});
    (offlineStorage.getSyncStatus as any).mockResolvedValue({
      pendingActions: 0,
      conflicts: 0,
      lastSync: null,
    });
  });

  it('se rend sans crash', async () => {
    await act(async () => {
      render(<OfflineStatus />);
    });
    // Le composant doit être monté sans exception
    expect(document.body).toBeTruthy();
  });

  it('affiche "Connecté" quand en ligne sans actions en attente', async () => {
    await act(async () => {
      render(<OfflineStatus />);
    });
    expect(screen.getByText('Connecté')).toBeInTheDocument();
  });

  it('affiche "Hors ligne" quand hors ligne', async () => {
    (offlineSync.isCurrentlyOnline as any).mockReturnValue(false);

    await act(async () => {
      render(<OfflineStatus />);
    });

    expect(screen.getByText('Hors ligne')).toBeInTheDocument();
  });

  it('le clic sur le status toggle affiche les détails', async () => {
    await act(async () => {
      render(<OfflineStatus />);
    });

    const toggle =
      screen.getByText('Connecté').closest('[class*="cursor-pointer"]') ??
      screen.getByText('Connecté').parentElement?.parentElement;

    expect(toggle).toBeTruthy();

    await act(async () => {
      fireEvent.click(toggle!);
    });

    expect(screen.getByText('Connexion:')).toBeInTheDocument();
  });

  it("affiche le nombre d'actions en attente", async () => {
    (offlineStorage.getSyncStatus as any).mockResolvedValue({
      pendingActions: 3,
      conflicts: 0,
      lastSync: null,
    });

    await act(async () => {
      render(<OfflineStatus />);
    });

    expect(screen.getByText('3 en attente')).toBeInTheDocument();
  });

  it('affiche "Synchronisation..." pendant la synchro', async () => {
    (offlineSync.isCurrentlySyncing as any).mockReturnValue(true);

    await act(async () => {
      render(<OfflineStatus />);
    });

    expect(screen.getByText('Synchronisation...')).toBeInTheDocument();
  });
});
