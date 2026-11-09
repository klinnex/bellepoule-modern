// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompetitionList from './CompetitionList';
import { readTourFlag, writeTourFlag } from './guidedTourFlags';
import { Category, Competition, Gender, Weapon } from '../../shared/types';

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

describe('CompetitionList (export accueil)', () => {
  const comp = (id: string, title: string) =>
    ({
      id,
      title,
      date: '2026-01-01',
      weapon: Weapon.EPEE,
      category: Category.SENIOR,
      gender: Gender.MALE,
      fencers: [],
      color: '#3B5BDB',
    }) as unknown as Competition;

  it('bouton Exporter ouvre le choix de compétition puis appelle onExport avec l’identifiant', () => {
    const onExport = vi.fn();
    render(
      <CompetitionList
        competitions={[comp('c1', 'Alpha'), comp('c2', 'Beta')]}
        isLoading={false}
        onSelect={() => {}}
        onDelete={() => {}}
        onNewCompetition={() => {}}
        onExport={onExport}
      />
    );
    fireEvent.click(screen.getByText('competitionList.export'));
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onExport).toHaveBeenCalledWith('c2');
  });

  it('pas de bouton Exporter sans compétition', () => {
    render(
      <CompetitionList
        competitions={[]}
        isLoading={false}
        onSelect={() => {}}
        onDelete={() => {}}
        onNewCompetition={() => {}}
        onExport={() => {}}
      />
    );
    expect(screen.queryByText('competitionList.export')).toBeNull();
  });
});

describe('CompetitionList (filtres et tri #1534)', () => {
  beforeEach(() => localStorage.clear());
  const mk = (id: string, title: string, weapon: Weapon, date: string) =>
    ({
      id,
      title,
      date,
      weapon,
      category: Category.SENIOR,
      gender: Gender.MALE,
      status: 'draft',
      fencers: [],
      color: '#3B5BDB',
    }) as unknown as Competition;
  const renderList = () =>
    render(
      <CompetitionList
        competitions={[
          mk('a', 'Alpha', Weapon.EPEE, '2026-01-01'),
          mk('b', 'Bravo', Weapon.FOIL, '2026-03-01'),
        ]}
        isLoading={false}
        onSelect={() => {}}
        onDelete={() => {}}
        onNewCompetition={() => {}}
      />
    );

  it('filtre par arme avec une puce, puis réinitialise', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'weapons.foil' }));
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Bravo')).toBeTruthy();
    fireEvent.click(screen.getByText('competitionList.filters_reset'));
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('trie par nom et mémorise la préférence', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('competitionList.sort_aria'), {
      target: { value: 'name_asc' },
    });
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(titles).toEqual(['Alpha', 'Bravo']);
    expect(localStorage.getItem('bellepoule-competition-sort')).toBe('name_asc');
  });
});
