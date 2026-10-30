// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompetitionList from './CompetitionList';
import { readTourFlag, writeTourFlag } from './guidedTourFlags';

vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('./ConfirmDialog', () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));

describe('CompetitionList (accueil vide)', () => {
  beforeEach(() => localStorage.clear());

  it('propose de créer une compétition avec le parcours guidé', () => {
    writeTourFlag('done');
    const onNew = vi.fn();
    render(
      <CompetitionList
        competitions={[]}
        isLoading={false}
        onSelect={() => {}}
        onDelete={() => {}}
        onNewCompetition={onNew}
      />
    );
    fireEvent.click(screen.getByText('competitionList.guided_start'));
    expect(readTourFlag()).toBe('active');
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
