// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, string>) => (p ? `${k}:${Object.values(p).join(',')}` : k),
  }),
}));

const taskDestroy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('./pdfjsLoader', () => ({
  loadPdfJs: vi.fn().mockResolvedValue({
    GlobalWorkerOptions: { workerSrc: '' },
    // pdf.js ≥ 5 : destroy() est sur la tâche de chargement, pas sur le document
    getDocument: () => ({
      destroy: taskDestroy,
      promise: Promise.resolve({
        numPages: 3,
        // getContext peut renvoyer un contexte si le paquet canvas est compilé (CI) : render requis
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 140 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    }),
  }),
}));

import PrintDialog from './PrintDialog';
import PrintDialogHost from './PrintDialogHost';
import { isValidPageRanges, pageRangesBeyond, PRINT_SETTINGS_KEY } from './printSettings';

const api = {
  getPrinters: vi.fn(),
  render: vi.fn(),
  execute: vi.fn(),
  savePdf: vi.fn(),
  systemDialog: vi.fn(),
  setHandler: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.getPrinters.mockResolvedValue([
    { name: 'HP', displayName: 'HP LaserJet', isDefault: false },
    { name: 'Canon', displayName: 'Canon', isDefault: true },
  ]);
  api.render.mockResolvedValue({ success: true, data: new Uint8Array([37, 80, 68, 70]) });
  api.execute.mockResolvedValue({ success: true });
  api.savePdf.mockResolvedValue({ success: true, path: '/x.pdf' });
  api.systemDialog.mockResolvedValue({ success: true });
  (window as unknown as { electronAPI: unknown }).electronAPI = { printDialog: api };
});

const open = async (html = '<html><title>Poule 1</title></html>') => {
  const onDone = vi.fn();
  render(<PrintDialog html={html} onDone={onDone} />);
  // Aperçu généré (3 pages) : boutons d'action activés
  await waitFor(() => expect(screen.getByText('print.pages_count:3')).toBeInTheDocument());
  return onDone;
};

describe('PrintDialog (#1214)', () => {
  it('présélectionne l’imprimante par défaut et génère l’aperçu avec les réglages', async () => {
    await open();
    expect(screen.getByDisplayValue('Canon')).toBeInTheDocument();
    expect(api.render).toHaveBeenCalledWith(
      '<html><title>Poule 1</title></html>',
      expect.objectContaining({ paperSize: 'auto', orientation: 'auto', scale: 100 })
    );
  });

  it('Imprimer : envoie les réglages choisis puis ferme et mémorise (sans pages)', async () => {
    const onDone = await open();
    fireEvent.change(screen.getByDisplayValue('Canon'), { target: { value: 'HP' } });
    fireEvent.change(screen.getByLabelText('print.copies'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('print.pages'), { target: { value: '1-2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('print.print'));
    });
    expect(api.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ printer: 'HP', copies: 3, pages: '1-2' })
    );
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ success: true }));
    expect(JSON.parse(localStorage.getItem(PRINT_SETTINGS_KEY)!)).toMatchObject({
      copies: 3,
      pages: '',
    });
  });

  it('plage invalide ou hors document : impression bloquée', async () => {
    await open();
    const pages = screen.getByLabelText('print.pages');
    fireEvent.change(pages, { target: { value: '3-1' } });
    expect(screen.getByText('print.pages_invalid')).toBeInTheDocument();
    expect(screen.getByText('print.print')).toBeDisabled();
    fireEvent.change(pages, { target: { value: '7' } });
    expect(screen.getByText('print.pages_beyond:3')).toBeInTheDocument();
    expect(screen.getByText('print.print')).toBeDisabled();
    fireEvent.change(pages, { target: { value: '2-3' } });
    expect(screen.getByText('print.print')).toBeEnabled();
  });

  it('échec d’impression : message affiché, boîte conservée', async () => {
    api.execute.mockResolvedValue({ success: false, error: 'print_failed' });
    const onDone = await open();
    await act(async () => {
      fireEvent.click(screen.getByText('print.print'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('print.failed (print_failed)');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('Enregistrer en PDF : titre du document proposé', async () => {
    const onDone = await open();
    await act(async () => {
      fireEvent.click(screen.getByText('print.save_pdf'));
    });
    expect(api.savePdf).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 'Poule 1');
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ success: true }));
  });

  it('enregistrement annulé dans le dialogue : la boîte reste ouverte', async () => {
    api.savePdf.mockResolvedValue({ success: false, canceled: true });
    const onDone = await open();
    await act(async () => {
      fireEvent.click(screen.getByText('print.save_pdf'));
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Boîte de dialogue système : bascule sur l’impression native', async () => {
    const onDone = await open();
    await act(async () => {
      fireEvent.click(screen.getByText('print.system_dialog'));
    });
    expect(api.systemDialog).toHaveBeenCalledWith('<html><title>Poule 1</title></html>');
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ success: true }));
  });

  it('Annuler : fermeture sans erreur (pas de toast d’échec chez l’appelant)', async () => {
    const onDone = await open();
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(onDone).toHaveBeenCalledWith({ success: true, canceled: true });
    expect(api.execute).not.toHaveBeenCalled();
  });

  it('fermeture après aperçu : libère pdf.js sans planter (croix ou Annuler)', async () => {
    const { unmount } = render(<PrintDialog html="<p>a</p>" onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('print.print')).toBeEnabled());
    expect(() => unmount()).not.toThrow();
    expect(taskDestroy).toHaveBeenCalled();
  });

  it('aperçu en échec : impression et enregistrement restent possibles', async () => {
    api.render.mockResolvedValue({ success: false, error: 'boom' });
    render(<PrintDialog html="<p>a</p>" onDone={vi.fn()} />);
    expect(await screen.findByText('print.preview_failed')).toBeInTheDocument();
    expect(screen.getByText('print.print')).toBeEnabled();
    expect(screen.getByText('print.save_pdf')).toBeEnabled();
  });
});

describe('PrintDialogHost (#1214)', () => {
  it('enregistre le gestionnaire, ouvre la boîte à la demande et renvoie le résultat', async () => {
    render(<PrintDialogHost />);
    expect(api.setHandler).toHaveBeenCalledTimes(1);
    const handler = api.setHandler.mock.calls[0][0] as (html: string) => Promise<unknown>;
    let result: Promise<unknown>;
    act(() => {
      result = handler('<p>x</p>');
    });
    await waitFor(() => expect(screen.getByText('print.title')).toBeInTheDocument());
    fireEvent.click(screen.getByText('actions.cancel'));
    await expect(result!).resolves.toEqual({ success: true, canceled: true });
    await waitFor(() => expect(screen.queryByText('print.title')).not.toBeInTheDocument());
  });

  it('désenregistre le gestionnaire au démontage', () => {
    const { unmount } = render(<PrintDialogHost />);
    unmount();
    expect(api.setHandler).toHaveBeenLastCalledWith(null);
  });
});

describe('plages de pages côté renderer (#1214)', () => {
  it.each([
    ['', true],
    ['1-3, 5', true],
    ['3-1', false],
    ['a', false],
    ['0', false],
  ])('isValidPageRanges(%j) = %s', (input, ok) => expect(isValidPageRanges(input)).toBe(ok));
  it('pageRangesBeyond', () => {
    expect(pageRangesBeyond('1-3', 3)).toBe(false);
    expect(pageRangesBeyond('1, 4', 3)).toBe(true);
    expect(pageRangesBeyond('9', 0)).toBe(false);
  });
});
