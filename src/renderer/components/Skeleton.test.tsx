// @vitest-environment jsdom
/**
 * Tests Skeleton : TableSkeleton accessible (#1535).
 */
import '@testing-library/jest-dom';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TableSkeleton } from './Skeleton';

describe('TableSkeleton', () => {
  it('annonce le chargement et rend le nombre de lignes demandé', () => {
    render(<TableSkeleton label="Chargement tableau…" rows={3} columns={4} />);
    const status = screen.getByRole('status', { name: 'Chargement tableau…' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status.children).toHaveLength(3);
  });
});
