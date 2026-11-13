// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ThemeEditor from '../ThemeEditor';

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k);
vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t }) }));

const save = vi.fn(() => Promise.resolve());

beforeEach(() => {
  save.mockClear();
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    themes: { list: () => Promise.resolve([]), save, delete: () => Promise.resolve() },
  };
});

const renderEditor = () =>
  render(
    <ThemeEditor targetArenaId="all" targetType="arena" onApply={vi.fn()} onClose={vi.fn()} />
  );

describe('ThemeEditor – thèmes prédéfinis', () => {
  it('liste les thèmes prédéfinis de la section', () => {
    renderEditor();
    expect(screen.getByText('themeEditor.builtin')).toBeInTheDocument();
    for (const k of ['dark', 'light', 'neon', 'steampunk']) {
      expect(screen.getByText(`rsm.theme_${k}`)).toBeInTheDocument();
    }
  });

  it('thème prédéfini chargé en lecture seule', () => {
    renderEditor();
    fireEvent.click(screen.getByText('rsm.theme_neon'));
    expect(screen.getByRole('status')).toHaveTextContent('themeEditor.readonly_hint');
    expect(screen.getByText('themeEditor.save')).toBeDisabled();
    expect(screen.getByDisplayValue('rsm.theme_neon')).toHaveAttribute('readonly');
  });

  it('dupliquer → copie modifiable sauvegardée sous un nouvel id', async () => {
    renderEditor();
    fireEvent.click(screen.getByText('rsm.theme_neon'));
    fireEvent.click(within(screen.getByRole('status')).getByRole('button'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const save_btn = screen.getByText('themeEditor.save');
    expect(save_btn).toBeEnabled();
    fireEvent.click(save_btn);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const theme = (
      save.mock.calls[0] as unknown as [
        { id: string; name: string; variables: Record<string, string> },
      ]
    )[0];
    expect(theme.id.startsWith('builtin:')).toBe(false);
    expect(theme.name).toBe('themeEditor.copy_of {"name":"rsm.theme_neon"}');
    expect(theme.variables['--bg']).toBe('#0a0a0a');
  });
});
