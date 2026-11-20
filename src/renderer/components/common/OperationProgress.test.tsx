// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { vi } from 'vitest';
import { OperationProvider, OPERATION_DELAY_MS, useOperation } from './OperationProgress';

let run: ReturnType<typeof useOperation>['runOperation'];
const Probe: React.FC = () => {
  run = useOperation().runOperation;
  return null;
};

describe('OperationProgress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opération rapide : aucune barre', async () => {
    render(
      <OperationProvider>
        <Probe />
      </OperationProvider>
    );
    await act(async () => {
      await run('export', async () => 1);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opération longue : barre affichée après 1 s puis retirée', async () => {
    render(
      <OperationProvider>
        <Probe />
      </OperationProvider>
    );
    let finish!: (v: number) => void;
    let result: Promise<number>;
    act(() => {
      result = run('import', () => new Promise<number>(r => (finish = r)));
    });
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(OPERATION_DELAY_MS + 10);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => {
      finish(42);
      await expect(result).resolves.toBe(42);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('propage l’erreur de la tâche et retire la barre', async () => {
    render(
      <OperationProvider>
        <Probe />
      </OperationProvider>
    );
    await act(async () => {
      vi.useFakeTimers();
      await expect(
        run('sync', async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('hors provider : exécute la tâche', async () => {
    const Outside: React.FC = () => {
      run = useOperation().runOperation;
      return null;
    };
    render(<Outside />);
    await expect(run('export', async () => 'ok')).resolves.toBe('ok');
  });
});
