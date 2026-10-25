// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Fencer } from '../../shared/types';
import { useRapieresTeams } from './useRapieresTeams';

vi.mock('../../renderer/hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../../renderer/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const CSV = [
  ';;;Nom participant',
  ...['Alpha', 'Beta'].map(
    team => `;;;${team}1;Ana;;;;;;;;;;;;01/01/1990;F;;${team}2;Bob;01/01/1980;H;;${team}`
  ),
].join('\n');

describe('useRapieresTeams : import des équipes (#1211)', () => {
  it('ouvre la fenêtre de sélection puis ajoute toutes les équipes en un lot', async () => {
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      dialog: { openFile: vi.fn(async () => ({ filePath: '/tmp/export.csv', content: CSV })) },
    };
    const addFencer = vi.fn();
    const bulkAddFencers = vi.fn(async (list: unknown[]) =>
      list.map((_, i) => ({ id: `f${i}` }) as Fencer)
    );
    const setRapieresTeam = vi.fn();
    const { result } = renderHook(() =>
      useRapieresTeams({
        competitionDate: '2026-10-26',
        addFencer,
        bulkAddFencers,
        updateFencer: vi.fn(),
        setRapieresTeam,
      })
    );
    await act(() => result.current.handleImportRapieresTeams());
    const pending = result.current.rapieresImportModal;
    expect(pending?.filename).toBe('export.csv');
    expect(pending?.teams.map(t => t.name)).toEqual(['Alpha', 'Beta']);
    expect(bulkAddFencers).not.toHaveBeenCalled();

    await act(() => pending!.onImport(pending!.teams));
    expect(addFencer).not.toHaveBeenCalled();
    expect(bulkAddFencers).toHaveBeenCalledTimes(1);
    expect(bulkAddFencers.mock.calls[0][0].map((f: Fencer) => f.lastName)).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(setRapieresTeam).toHaveBeenCalledWith('f0', pending!.teams[0].info);
    expect(setRapieresTeam).toHaveBeenCalledWith('f1', pending!.teams[1].info);
  });
});
