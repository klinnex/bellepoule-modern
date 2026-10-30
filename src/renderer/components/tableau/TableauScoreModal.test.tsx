// @vitest-environment jsdom
/**
 * Tests de composant - TableauScoreModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

import TableauScoreModal from './TableauScoreModal';

const match = {
  id: 'm1',
  round: 8,
  fencerA: { id: 'a', lastName: 'Dupont', firstName: 'Jean' },
  fencerB: { id: 'b', lastName: 'Martin', firstName: 'Marie' },
} as any;

const setup = (over: Partial<Record<string, any>> = {}) => {
  const props = {
    match,
    editScoreA: '',
    setEditScoreA: vi.fn(),
    editScoreB: '',
    setEditScoreB: vi.fn(),
    maxScore: 15,
    isUnlimitedScore: false,
    modalRef: React.createRef<HTMLDivElement>(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onSpecialStatus: vi.fn(),
    getRoundName: (r: number) => `Tour ${r}`,
    ...over,
  };
  const utils = render(<TableauScoreModal {...(props as any)} />);
  return { props, utils };
};

describe('TableauScoreModal', () => {
  it('affiche le nom du tour et les tireurs', () => {
    setup();
    expect(screen.getByText('Tour 8 - Saisie rapide')).toBeInTheDocument();
    expect(screen.getByText(/Dupont/)).toBeInTheDocument();
    expect(screen.getByText(/Martin/)).toBeInTheDocument();
  });

  it('saisir un score appelle setEditScoreA', () => {
    const { props, utils } = setup();
    const inputs = utils.baseElement.querySelectorAll('input[type="number"]');
    fireEvent.change(inputs[0], { target: { value: '15' } });
    expect(props.setEditScoreA).toHaveBeenCalledWith('15');
  });

  it('Valider déclenche onSubmit', () => {
    const { props } = setup();
    fireEvent.click(screen.getByText('Valider'));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('bouton Médical : croix rouge médicale (#1256)', () => {
    setup();
    const btn = screen.getByText('Médical').closest('button')!;
    expect(btn.querySelector('[data-testid="medical-cross-icon"]')).not.toBeNull();
  });

  it('Échap ferme la modale', () => {
    const { props } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('le clic hors de la fenêtre ne ferme pas (#1115)', () => {
    const { props, utils } = setup();
    fireEvent.click(utils.baseElement.querySelector('.modal-overlay') as Element);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  describe('égalité Sabre Laser', () => {
    const laserSetup = (over: Partial<Record<string, any>> = {}) =>
      setup({ isLaserSabre: true, editScoreA: '10', editScoreB: '10', ...over });

    it('hors Laser : aucun bouton V ni tirage au sort, même en égalité', () => {
      setup({ isLaserSabre: false, editScoreA: '10', editScoreB: '10' });
      expect(screen.queryByText(/V · /)).toBeNull();
      expect(screen.queryByText('Tirage au sort')).toBeNull();
    });

    it('Laser sans égalité : pas de bloc vainqueur', () => {
      setup({ isLaserSabre: true, editScoreA: '10', editScoreB: '9' });
      expect(screen.queryByText(/V · /)).toBeNull();
    });

    it('Laser sans score saisi : pas de bloc vainqueur', () => {
      setup({ isLaserSabre: true, editScoreA: '', editScoreB: '' });
      expect(screen.queryByText(/V · /)).toBeNull();
    });

    it('égalité : V manuel pour chaque tireur', () => {
      const onVictoryChange = vi.fn();
      laserSetup({ onVictoryChange });
      fireEvent.click(screen.getByText('V · Dupont'));
      expect(onVictoryChange).toHaveBeenCalledWith('A');
      fireEvent.click(screen.getByText('V · Martin'));
      expect(onVictoryChange).toHaveBeenCalledWith('B');
    });

    it('V déjà actif : un second clic le retire', () => {
      const onVictoryChange = vi.fn();
      laserSetup({ victoryA: true, onVictoryChange });
      fireEvent.click(screen.getByText('V · Dupont'));
      expect(onVictoryChange).toHaveBeenCalledWith(null);
    });

    it('tirage au sort : le résultat désigne le vainqueur', () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        const onVictoryChange = vi.fn();
        laserSetup({ onVictoryChange });
        fireEvent.click(screen.getByRole('button', { name: /Tirage au sort/ }));
        act(() => {
          vi.advanceTimersByTime(3700);
        });
        fireEvent.click(screen.getByText('Continuer'));
        expect(onVictoryChange).toHaveBeenCalledTimes(1);
        expect(['A', 'B']).toContain(onVictoryChange.mock.calls[0][0]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
