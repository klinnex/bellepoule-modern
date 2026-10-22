// @vitest-environment jsdom
/**
 * Tests - primitives Modal / Button / Card (#1157)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import Modal from './Modal';
import Button from './Button';
import Card from './Card';

describe('Modal', () => {
  it('rend titre, corps et pied ; le dialogue est nommé par son titre', () => {
    render(
      <Modal title="Titre" onClose={() => {}} footer={<button>OK</button>}>
        Corps
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('Corps')).toHaveClass('modal-body');
    expect(screen.getByText('OK').parentElement).toHaveClass('modal-footer');
  });

  it('ferme via le bouton, Échap et l’overlay ; pas via un clic dans la boîte', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal title="T" onClose={onClose}>
        Corps
      </Modal>
    );
    fireEvent.click(screen.getByText('Corps'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('actions.close'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('classes de taille, défilement et overlay au premier plan', () => {
    const { container } = render(
      <Modal title="T" onClose={() => {}} size="lg" scroll elevated closeOnOverlay={false}>
        x
      </Modal>
    );
    expect(container.querySelector('.modal')).toHaveClass('modal--lg', 'modal--scroll');
    expect(container.querySelector('.modal-overlay')).toHaveClass('modal-overlay--top');
  });
});

describe('Button', () => {
  it('variante, taille et type="button" par défaut', () => {
    render(
      <Button variant="primary" size="sm">
        Go
      </Button>
    );
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn).toHaveClass('btn', 'btn-primary', 'btn-sm');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('secondaire par défaut, icône + libellé', () => {
    render(<Button icon={<span>*</span>}>Lbl</Button>);
    expect(screen.getByRole('button')).toHaveClass('btn-secondary', 'btn-icon-label');
  });
});

describe('Card', () => {
  it('en-tête, corps et pied', () => {
    const { container } = render(
      <Card title="Titre" actions={<button>A</button>} footer="Pied">
        Contenu
      </Card>
    );
    expect(container.querySelector('.card-title')).toHaveTextContent('Titre');
    expect(screen.getByText('Contenu')).toHaveClass('card-body');
    expect(screen.getByText('Pied')).toHaveClass('card-footer');
  });

  it('sans titre ni actions : pas d’en-tête', () => {
    const { container } = render(<Card>Seul</Card>);
    expect(container.querySelector('.card-header')).toBeNull();
  });
});
