// @vitest-environment jsdom
/**
 * Tests unitaires - useExport (exportFencersList)
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExport } from './useExport';
import { Fencer, Gender, FencerStatus, Competition, Weapon, Category } from '../../shared/types';

const fencer = (id: string): Fencer => ({
  id,
  ref: Number(id),
  lastName: 'Nom' + id,
  firstName: 'P',
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const competition = { id: 'c1', title: 'Open Test' } as unknown as Competition;

let saveFile: ReturnType<typeof vi.fn>;
let writeContent: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn>;

beforeEach(() => {
  saveFile = vi.fn(async () => ({ canceled: false, filePath: '/tmp/out.fff' }));
  writeContent = vi.fn(async () => {});
  showToast = vi.fn();
  (window as any).electronAPI = { dialog: { saveFile }, file: { writeContent } };
});

afterEach(() => {
  delete (window as any).electronAPI;
});

const setup = () =>
  renderHook(() =>
    useExport({ competition, showToast: showToast as unknown as (m: string, t?: any) => void })
  ).result.current;

describe('exportFencersList', () => {
  it('écrit un contenu FFF et notifie le succès', async () => {
    await setup().exportFencersList([fencer('1')], 'fff');
    expect(writeContent).toHaveBeenCalledTimes(1);
    const [, content] = writeContent.mock.calls[0];
    expect(content.split('\n')[0]).toBe('FFF;UTF8;competition;;individuel');
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('FFF'), 'success');
  });

  it('écrit un contenu TXT incluant le titre de la compétition', async () => {
    saveFile.mockResolvedValue({ canceled: false, filePath: '/tmp/out.txt' });
    await setup().exportFencersList([fencer('1')], 'txt');
    const [, content] = writeContent.mock.calls[0];
    expect(content).toContain('Open Test');
    expect(content).toContain('Nombre de tireurs : 1');
  });

  it('n’écrit rien si la boîte de dialogue est annulée', async () => {
    saveFile.mockResolvedValue({ canceled: true, filePath: undefined });
    await setup().exportFencersList([fencer('1')], 'fff');
    expect(writeContent).not.toHaveBeenCalled();
  });

  it('notifie une erreur si l’écriture échoue', async () => {
    writeContent.mockRejectedValue(new Error('disk full'));
    await setup().exportFencersList([fencer('1')], 'fff');
    expect(showToast).toHaveBeenCalledWith('Export des tireurs échoué', 'error');
  });
});
