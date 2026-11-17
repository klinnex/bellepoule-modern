// @vitest-environment jsdom
/**
 * Tests de composant - NewCompetitionModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import NewCompetitionModal from './NewCompetitionModal';
import { Category, Gender, Weapon } from '../../shared/types';

const setup = () => {
  const onCreate = vi.fn();
  const onClose = vi.fn();
  const { container } = render(<NewCompetitionModal onCreate={onCreate} onClose={onClose} />);
  return { onCreate, onClose, container };
};

describe('NewCompetitionModal', () => {
  it('crée une compétition avec le titre saisi', () => {
    const { onCreate, container } = setup();
    fireEvent.change(screen.getByPlaceholderText('newCompetition.title_ph'), {
      target: { value: 'Mon Open' },
    });
    fireEvent.submit(container.querySelector('form')!);
    expect(onCreate).toHaveBeenCalledTimes(1);
    const data = onCreate.mock.calls[0][0];
    expect(data.title).toBe('Mon Open');
    expect(data.weapon).toBe(Weapon.EPEE);
    expect(data.date).toBeInstanceOf(Date);
  });

  it('génère un titre par défaut si vide', () => {
    const { onCreate, container } = setup();
    fireEvent.submit(container.querySelector('form')!);
    expect(onCreate.mock.calls[0][0].title).toMatch(/^Compétition du/);
  });

  it('propriétés saisies à la création : appliquées à cette compétition seulement', () => {
    const { onCreate, container } = setup();
    fireEvent.click(screen.getByText('competitionHeader.properties'));
    const propsTitle = document.getElementById('title') as HTMLInputElement;
    fireEvent.change(propsTitle, { target: { value: 'Titre via propriétés' } });
    fireEvent.click(screen.getByText('properties.save'));
    // La modale Propriétés se ferme après enregistrement, la création reste ouverte
    expect(document.getElementById('title')).toBeNull();
    fireEvent.submit(container.querySelector('form')!);
    expect(onCreate.mock.calls[0][0].title).toBe('Titre via propriétés');
  });

  it('le bouton annuler ferme la modale', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it("pré-remplit et verrouille les champs depuis le .zip de l'extranet (#1938)", async () => {
    const xml =
      '<BaseCompetitionParEquipes Type="E" Date="20.06.2027" Annee="2026 - 2027" TitreLong="Nationale exemple" Categorie="SENIOR" Domaine="C" Sexe="F" Arme="S" ID="654321" Championnat="FFE" Appel="8:30"><Tireurs>' +
      [1, 2, 3, 4]
        .map(
          i =>
            `<Tireur Nom="NOM${i}" Prenom="P${i}" Licence="90000${i}" Sexe="F" Club="CLUB" Equipe="CLUB 1"/>`
        )
        .join('') +
      '</Tireurs><Arbitres/><Equipes/></BaseCompetitionParEquipes>';
    (window as unknown as { electronAPI: unknown }).electronAPI = {
      dialog: {
        openFederalFiles: vi.fn().mockResolvedValue({
          names: ['EXEMPLE_equ.zip'],
          files: [{ name: 'EngardeSDSENIOR.xml', content: xml }],
        }),
      },
    };
    const { onCreate, container } = setup();
    fireEvent.click(screen.getByText('federalImport.choose'));
    await waitFor(() => expect(screen.getByTestId('federal-import-panel')).toBeInTheDocument());

    await waitFor(() =>
      expect(screen.getByPlaceholderText('newCompetition.title_ph')).toHaveValue(
        'Nationale exemple'
      )
    );
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
    expect(container.querySelector('#new-competition-check_in')).toHaveValue('08:30');

    fireEvent.submit(container.querySelector('form')!);
    const [data, imported] = onCreate.mock.calls[0];
    expect(data).toMatchObject({
      weapon: Weapon.SABRE,
      gender: Gender.FEMALE,
      category: Category.SENIOR,
      isTeamEvent: true,
    });
    expect(data.settings.federal).toMatchObject({ id: '654321', season: '2026 - 2027' });
    expect(data.settings.schedule).toEqual({ checkIn: '08:30' });
    expect(data.settings.teamReserveCount).toBe(1);
    expect(imported.fencers).toHaveLength(4);
    expect(imported.teams).toEqual([
      expect.objectContaining({ name: 'CLUB 1', members: expect.any(Array) }),
    ]);
  });
});
