// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CyranoPanel } from './CyranoPanel';

vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

describe('CyranoPanel — alerte BAD MATCH (#1720)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'bellepoule-cyrano-pistes',
      JSON.stringify([{ piste: '1', ip: '127.0.0.1', port: 50101, arena: 1, protocol: 'auto' }])
    );
    (window as any).electronAPI = {
      cyrano: {
        getStatus: vi.fn().mockResolvedValue({
          running: true,
          port: 50100,
          pistes: [
            {
              piste: '1',
              ip: '127.0.0.1',
              port: 50101,
              arena: 1,
              protocol: 'auto',
              status: 'online',
              lastSeen: Date.now(),
              detectedProtocol: 'EFP1.1',
              alert: { kind: 'bad_match', since: Date.now(), device: 'DUVAL J – MOREL L' },
            },
          ],
        }),
      },
    };
  });

  it('signale la piste dont l’appareil affiche un autre match', async () => {
    render(<CyranoPanel />);
    const badge = await screen.findByText('BAD MATCH');
    expect(badge.closest('.cyrano-alert')).toHaveAttribute(
      'title',
      expect.stringContaining('DUVAL J – MOREL L')
    );
  });
});

describe('CyranoPanel — secours et journal (#1829)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'bellepoule-cyrano-pistes',
      JSON.stringify([{ piste: '1', ip: '127.0.0.1', port: 50101, arena: 1, protocol: 'auto' }])
    );
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      cyrano: {
        getStatus: vi.fn().mockResolvedValue({
          running: true,
          port: 50100,
          pistes: [
            {
              piste: '1',
              ip: '127.0.0.1',
              port: 50101,
              arena: 1,
              protocol: 'auto',
              status: 'online',
              lastSeen: Date.now(),
              detectedProtocol: 'EFP1.1',
              alert: null,
            },
          ],
        }),
        getLog: vi
          .fn()
          .mockResolvedValue([
            { ts: 0, dir: 'in', ip: '127.0.0.1', port: 50101, piste: '1', raw: '|EFP1.1|INFO|1|' },
          ]),
        pisteAction: vi.fn().mockResolvedValue(true),
      },
      remote: {
        getNetworkInterfaces: vi.fn().mockResolvedValue({
          success: true,
          interfaces: [{ name: 'eth0', address: '10.1.1.1' }],
        }),
      },
    };
  });

  it('actions de secours envoyées pour la piste', async () => {
    render(<CyranoPanel />);
    fireEvent.click(await screen.findByText('ACK'));
    expect(
      (window as unknown as { electronAPI: { cyrano: { pisteAction: unknown } } }).electronAPI
        .cyrano.pisteAction
    ).toHaveBeenCalledWith('1', 'ack');
  });

  it('journal affiché à la demande ; interfaces proposées', async () => {
    render(<CyranoPanel />);
    fireEvent.click(await screen.findByText('Journal des trames'));
    expect(await screen.findByText(/\|EFP1\.1\|INFO\|1\|/)).toBeInTheDocument();
    expect(await screen.findByText('10.1.1.1 (eth0)')).toBeInTheDocument();
  });
});
