// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
import { ClubExercisesPanel } from './ClubExercisesPanel';
import { buildExercisesFile } from '../../../shared/utils/clubShare';

const exercise = (id: string, title: string, category = 'warmup') => ({
  id,
  title,
  category,
  minutes: 10,
  images: [],
  createdAt: '',
  updatedAt: '',
});

let api: Record<string, ReturnType<typeof vi.fn>>;
let dialog: Record<string, ReturnType<typeof vi.fn>>;
let file: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    listExercises: vi
      .fn()
      .mockResolvedValue([exercise('a', 'Footing'), exercise('b', 'Assauts à thème', 'bouts')]),
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    deleteExercise: vi.fn(),
    importExercises: vi.fn().mockResolvedValue({ created: 1, skipped: 0 }),
  };
  dialog = {
    saveFile: vi.fn().mockResolvedValue({ filePath: '/tmp/ex.json' }),
    openFile: vi.fn().mockResolvedValue({
      filePath: '/tmp/in.json',
      content: buildExercisesFile([exercise('x', 'Corde à sauter') as never]),
    }),
  };
  file = { writeContent: vi.fn().mockResolvedValue(undefined) };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api, dialog, file };
});

describe('ClubExercisesPanel (#1872)', () => {
  it('liste, filtre par famille, création', async () => {
    render(<ClubExercisesPanel />);
    expect(await screen.findByText('Footing')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Famille'), { target: { value: 'bouts' } });
    expect(screen.queryByText('Footing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nouvel exercice' }));
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Jeux de jambes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() =>
      expect(api.createExercise).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Jeux de jambes', category: 'bouts' })
      )
    );
  });

  it('export des exercices affichés et import d’un fichier partagé', async () => {
    render(<ClubExercisesPanel />);
    await screen.findByText('Footing');
    fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
    await waitFor(() => expect(file.writeContent).toHaveBeenCalled());
    const content = JSON.parse(file.writeContent.mock.calls[0][1]);
    expect(content.format).toBe('bellepoule-club-exercises');
    expect(content.exercises.map((e: { title: string }) => e.title)).toEqual([
      'Footing',
      'Assauts à thème',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() =>
      expect(api.importExercises).toHaveBeenCalledWith([
        expect.objectContaining({ title: 'Corde à sauter' }),
      ])
    );
  });
});
