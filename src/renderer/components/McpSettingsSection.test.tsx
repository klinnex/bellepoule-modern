// @vitest-environment jsdom
/**
 * Paramètres → Système → Agent IA (MCP) (#1880) : jeton illisible, dossiers accessibles
 * à l'agent (défauts, ajout par le main, retrait).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('../hooks/useTranslation', () => import('../testUtils/i18nMock'));
import McpSettingsSection, { mcpClientConfig } from './McpSettingsSection';
import type { McpStatus } from '../../shared/types/mcp';

const status: McpStatus = {
  enabled: true,
  allowWrite: false,
  running: true,
  port: 8067,
  url: 'http://127.0.0.1:8067/mcp',
  token: 'jeton-secret',
};
const defaults = ['/home/dt/Documents'];

let mcp: Record<string, ReturnType<typeof vi.fn>>;
let settings: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  mcp = {
    getStatus: vi.fn(async () => status),
    setSettings: vi.fn(async () => status),
    regenerateToken: vi.fn(async () => status),
    getLog: vi.fn(async () => []),
  };
  settings = {
    getAgentFolders: vi.fn(async () => ({ folders: [], defaults })),
    addAgentFolder: vi.fn(async () => ({ folders: ['/media/usb'], defaults })),
    removeAgentFolder: vi.fn(async () => ({ folders: [], defaults })),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { mcp, settings };
});
afterEach(cleanup);

describe('McpSettingsSection', () => {
  it('configuration du client : URL locale et jeton porteur', () => {
    expect(JSON.parse(mcpClientConfig(status)).mcpServers.bellepoule).toEqual({
      type: 'http',
      url: 'http://127.0.0.1:8067/mcp',
      headers: { Authorization: 'Bearer jeton-secret' },
    });
  });

  it('jeton illisible : message dédié plutôt que l’erreur brute', async () => {
    mcp.getStatus.mockResolvedValue({
      ...status,
      running: false,
      url: null,
      token: '',
      error: 'token_unreadable',
    });
    render(<McpSettingsSection />);
    expect(await screen.findByRole('status')).toHaveTextContent(/Jeton illisible dans ce contexte/);
  });

  it('dossiers de l’agent : défauts, ajout par le main, retrait', async () => {
    render(<McpSettingsSection />);
    expect(await screen.findByText('/home/dt/Documents')).toBeInTheDocument();
    expect(screen.getByText('par défaut')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ajouter un dossier'));
    expect(await screen.findByText('/media/usb')).toBeInTheDocument();
    expect(screen.queryByText('/home/dt/Documents')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Retirer /media/usb'));
    await waitFor(() => expect(settings.removeAgentFolder).toHaveBeenCalledWith('/media/usb'));
    expect(await screen.findByText('/home/dt/Documents')).toBeInTheDocument();
  });
});
