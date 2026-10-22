// @vitest-environment jsdom
/**
 * Tests de composant - ImportModal
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));
import ImportModal from './ImportModal';

const setup = (over: Partial<Record<string, any>> = {}) => {
  const onImport = vi.fn();
  const onClose = vi.fn();
  render(
    <ImportModal
      format="txt"
      filepath="/chemin/tireurs.txt"
      content={'DUPONT;Jean\nMARTIN;Marie'}
      fencers={[]}
      onImport={onImport}
      onClose={onClose}
      {...(over as any)}
    />
  );
  return { onImport, onClose };
};

describe('ImportModal', () => {
  it('affiche le fichier et la liste des tireurs parsés', () => {
    setup();
    expect(screen.getByText(/tireurs\.txt/)).toBeInTheDocument();
    expect(screen.getByText('DUPONT')).toBeInTheDocument();
    expect(screen.getByText('MARTIN')).toBeInTheDocument();
  });

  it('importe les tireurs sélectionnés (tous par défaut) puis ferme', () => {
    const { onImport, onClose } = setup();
    fireEvent.click(screen.getByText('importModal.import_n {"count":2}'));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toHaveLength(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('le bouton fermer déclenche onClose', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });
});
