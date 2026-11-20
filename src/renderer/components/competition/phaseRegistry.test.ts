import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerPhases, getPhaseTargets, selectPhase } from './phaseRegistry';

describe('phaseRegistry', () => {
  let off: (() => void) | null = null;
  afterEach(() => off?.());

  it('liste les phases accessibles hors phase courante, avec leur position', () => {
    const select = vi.fn();
    off = registerPhases({
      phases: [
        { id: 'checkin', label: 'Appel', disabled: false },
        { id: 'pools', label: 'Poules', disabled: false },
        { id: 'tableau', label: 'Tableau', disabled: true },
      ],
      currentId: 'checkin',
      select,
    });
    expect(getPhaseTargets()).toEqual([{ id: 'pools', label: 'Poules', position: 2 }]);
    selectPhase('pools');
    expect(select).toHaveBeenCalledWith('pools');
  });

  it('se vide au retrait', () => {
    registerPhases({ phases: [], currentId: '', select: vi.fn() })();
    expect(getPhaseTargets()).toEqual([]);
  });
});
