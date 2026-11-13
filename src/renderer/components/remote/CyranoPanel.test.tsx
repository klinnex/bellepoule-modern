// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
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
