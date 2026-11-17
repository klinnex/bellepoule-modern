// @vitest-environment jsdom
/**
 * AppTabBar (#1897) : accueil, onglet Club, onglets de compétition, réordonnancement.
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
import { AppTabBar } from './AppTabBar';
import type { OpenCompetition } from '../../hooks/useAppState';

const comp = (id: string, title: string) =>
  ({
    competition: { id, title, phases: [], currentPhaseIndex: 0 },
    isDirty: false,
  }) as unknown as OpenCompetition;

describe('AppTabBar', () => {
  it('affiche les onglets et relaie les actions', () => {
    const props = {
      view: 'competition',
      activeTabId: 'a',
      openCompetitions: [comp('a', 'Open A'), comp('b', 'Open B')],
      setOpenCompetitions: vi.fn(),
      clubTabOpen: true,
      clubIcon: () => <span />,
      clubName: 'CE Gratien',
      onHome: vi.fn(),
      onOpenClub: vi.fn(),
      onCloseClub: vi.fn(),
      onSwitchTab: vi.fn(),
      onCloseTab: vi.fn(),
    };
    render(<AppTabBar {...props} />);
    fireEvent.click(screen.getByText('Open B'));
    expect(props.onSwitchTab).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByText('app.home'));
    expect(props.onHome).toHaveBeenCalled();
    fireEvent.click(screen.getByText('CE Gratien'));
    expect(props.onOpenClub).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('app.club_close'));
    expect(props.onCloseClub).toHaveBeenCalled();
    fireEvent.click(screen.getAllByLabelText('app.close_tab')[0]);
    expect(props.onCloseTab).toHaveBeenCalledWith('a', expect.anything());
  });

  it('glisser-déposer : réordonne les onglets', () => {
    const setOpenCompetitions = vi.fn();
    const list = [comp('a', 'Open A'), comp('b', 'Open B')];
    render(
      <AppTabBar
        view="competition"
        activeTabId="a"
        openCompetitions={list}
        setOpenCompetitions={setOpenCompetitions}
        clubTabOpen={false}
        clubIcon={() => null}
        onHome={vi.fn()}
        onOpenClub={vi.fn()}
        onCloseClub={vi.fn()}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    );
    const tabA = screen.getByText('Open A').closest('.tab')!;
    const tabB = screen.getByText('Open B').closest('.tab')!;
    fireEvent.dragStart(tabA);
    fireEvent.drop(tabB);
    const update = setOpenCompetitions.mock.calls[0][0] as (
      p: OpenCompetition[]
    ) => OpenCompetition[];
    expect(update(list).map(o => o.competition.id)).toEqual(['b', 'a']);
  });
});
