// @vitest-environment jsdom
/**
 * Tests unitaires - CollapseToggle / useCollapsed
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapseToggle, useCollapsed } from './CollapseToggle';

const Harness: React.FC = () => {
  const [collapsed, toggle] = useCollapsed('test-view');
  return (
    <div>
      <CollapseToggle collapsed={collapsed} onToggle={toggle} />
      {!collapsed && <span>contenu</span>}
    </div>
  );
};

describe('CollapseToggle', () => {
  beforeEach(() => localStorage.clear());

  it('compacte puis déplie le contenu', () => {
    render(<Harness />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(screen.queryByText('contenu')).not.toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(screen.getByText('contenu')).toBeInTheDocument();
  });

  it("mémorise l'état entre deux montages", () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button'));
    unmount();
    render(<Harness />);
    expect(screen.queryByText('contenu')).not.toBeInTheDocument();
  });
});
