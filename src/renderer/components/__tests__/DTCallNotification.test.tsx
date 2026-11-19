// @vitest-environment jsdom
/**
 * DTCallNotification : appel DT pour abandon signalé par l'appareil de piste (#2000).
 */
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DTCallNotification from '../DTCallNotification';
import { DT_CONFIRM_ABANDON_EVENT } from '../../services/dtCallEvents';
import type { DtConfirmAbandonDetail } from '../../services/dtCallEvents';

vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

type Call = Parameters<Parameters<Window['electronAPI']['onDTCall']>[0]>[0];

describe('DTCallNotification — abandon (#2000)', () => {
  let emitCall: (d: Call) => void;
  let acknowledgeDTCall: ReturnType<typeof vi.fn>;

  const abandonCall: Call = {
    arenaId: 'arena1',
    arenaNumber: 1,
    matchNumber: 4,
    competitionId: 'c1',
    timestamp: 1_700_000_000_000,
    reason: 'abandon',
    fencerId: 'f9',
    fencerName: 'DUPONT Alice',
  };

  beforeEach(() => {
    acknowledgeDTCall = vi.fn().mockResolvedValue(undefined);
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      onDTCall: (cb: typeof emitCall) => {
        emitCall = cb;
        return () => {};
      },
      onDTCallCancel: () => () => {},
      remote: { acknowledgeDTCall },
    };
  });

  it("affiche « Abandon — NOM Prénom (à confirmer par le DT) » et le bouton d'enregistrement", () => {
    render(<DTCallNotification />);
    act(() => emitCall(abandonCall));
    expect(screen.getByText('Abandon — DUPONT Alice (à confirmer par le DT)')).toBeInTheDocument();
    expect(screen.getByText("Enregistrer l'abandon")).toBeInTheDocument();
  });

  it("pas de bouton d'abandon pour un carton noir", () => {
    render(<DTCallNotification />);
    act(() => emitCall({ ...abandonCall, reason: 'black_card' }));
    expect(screen.queryByText("Enregistrer l'abandon")).toBeNull();
  });

  it("le bouton demande l'abandon du tireur à la compétition puis solde l'appel", async () => {
    const received: DtConfirmAbandonDetail[] = [];
    const onConfirm = (e: Event) => {
      const d = (e as CustomEvent<DtConfirmAbandonDetail>).detail;
      received.push({ ...d });
      d.handled = true;
    };
    window.addEventListener(DT_CONFIRM_ABANDON_EVENT, onConfirm);
    try {
      render(<DTCallNotification />);
      act(() => emitCall(abandonCall));
      await act(async () => {
        fireEvent.click(screen.getByText("Enregistrer l'abandon"));
      });
      expect(received).toEqual([{ fencerId: 'f9', competitionId: 'c1', handled: false }]);
      expect(acknowledgeDTCall).toHaveBeenCalledWith('c1', 'arena1');
      expect(screen.queryByText("Enregistrer l'abandon")).toBeNull();
    } finally {
      window.removeEventListener(DT_CONFIRM_ABANDON_EVENT, onConfirm);
    }
  });

  it("sans compétition ouverte pour traiter l'abandon, l'appel reste affiché", async () => {
    render(<DTCallNotification />);
    act(() => emitCall(abandonCall));
    await act(async () => {
      fireEvent.click(screen.getByText("Enregistrer l'abandon"));
    });
    expect(acknowledgeDTCall).not.toHaveBeenCalled();
    expect(screen.getByText("Enregistrer l'abandon")).toBeInTheDocument();
  });
});
