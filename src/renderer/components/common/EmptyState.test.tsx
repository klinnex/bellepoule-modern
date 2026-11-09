// @vitest-environment jsdom
/**
 * Tests - EmptyState commun (#1535)
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('rend titre, description et déclenche l’action principale', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="Aucun tireur"
        description="Ajoutez-en"
        actionLabel="Ajouter"
        onAction={onAction}
      />
    );
    expect(screen.getByText('Aucun tireur')).toBeInTheDocument();
    expect(screen.getByText('Ajoutez-en')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ajouter'));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('sans action : aucun bouton', () => {
    render(<EmptyState title="Vide" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
