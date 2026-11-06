// @vitest-environment jsdom
/**
 * Tests de composant - panneaux extraits de RemoteScoreManager (#1241)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));
vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
import { OrgNotePanel } from './OrgNotePanel';
import { ConnectedScreensPanel } from './ConnectedScreensPanel';

let remote: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  remote = {
    setOrgNote: vi.fn().mockResolvedValue({ success: true }),
    clearOrgNote: vi.fn().mockResolvedValue({ success: true }),
    getConnectedClients: vi.fn().mockResolvedValue({
      success: true,
      clients: [{ socketId: 'abcdefgh123', clientType: 'kiosk', label: 'Hall', ip: '10.0.0.2' }],
    }),
    onClientListUpdate: vi.fn(() => () => {}),
    renameClient: vi.fn().mockResolvedValue({ success: true }),
    identifyClient: vi.fn(),
    setClientKioskMode: vi.fn().mockResolvedValue({ success: true }),
  };
  (window as any).electronAPI = { remote };
});

afterEach(() => {
  delete (window as any).electronAPI;
});

describe('OrgNotePanel', () => {
  it('publie puis masque la note', async () => {
    render(<OrgNotePanel competitionId="c1" />);
    const show = screen.getByText('rsm.org_note_show');
    expect(show).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('rsm.org_note_placeholder'), {
      target: { value: '  Pause  ' },
    });
    fireEvent.click(show);
    await waitFor(() => expect(screen.getByText('rsm.org_note_visible')).toBeInTheDocument());
    expect(remote.setOrgNote).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ type: 'free', message: 'Pause' })
    );
    fireEvent.click(screen.getByText('rsm.hide'));
    await waitFor(() => expect(remote.clearOrgNote).toHaveBeenCalledWith('c1'));
  });
});

describe('ConnectedScreensPanel', () => {
  it('ne requête rien hors session distante', () => {
    render(<ConnectedScreensPanel competitionId="c1" isRemoteActive={false} />);
    expect(remote.getConnectedClients).not.toHaveBeenCalled();
  });

  it("ignore la liste poussée par le serveur d'une autre compétition (#1292)", async () => {
    let push: (c: any[], id?: string | null) => void = () => {};
    remote.onClientListUpdate.mockImplementation(((cb: typeof push) => {
      push = cb;
      return () => {};
    }) as any);
    render(<ConnectedScreensPanel competitionId="c1" isRemoteActive />);
    expect(await screen.findByText('Hall')).toBeInTheDocument();
    act(() => push([{ socketId: 'zzzzzzzz1', clientType: 'kiosk', label: 'Autre' }], 'c2'));
    expect(screen.queryByText('Autre')).not.toBeInTheDocument();
    act(() => push([{ socketId: 'zzzzzzzz1', clientType: 'kiosk', label: 'Propre' }], 'c1'));
    expect(screen.getByText('Propre')).toBeInTheDocument();
  });

  it('liste les écrans, renomme et envoie le mode kiosk', async () => {
    render(<ConnectedScreensPanel competitionId="c1" isRemoteActive />);
    expect(await screen.findByText('Hall')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('rsm.rename_placeholder'), {
      target: { value: 'Entrée' },
    });
    fireEvent.click(screen.getByTitle('rsm.rename'));
    await waitFor(() =>
      expect(remote.renameClient).toHaveBeenCalledWith('c1', 'abcdefgh123', 'Entrée')
    );
    fireEvent.click(screen.getByText('rsm.kiosk_mode'));
    fireEvent.click(screen.getByText('rsm.send_kiosk'));
    await waitFor(() =>
      expect(remote.setClientKioskMode).toHaveBeenCalledWith(
        'c1',
        'abcdefgh123',
        expect.objectContaining({ rotationSec: 15 })
      )
    );
  });
});
