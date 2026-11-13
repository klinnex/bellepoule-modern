// @vitest-environment jsdom
/**
 * Tests du bouton « Tout déplier / Tout replier » de la Saisie distante
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useRemoteFolds, RemoteFoldAllButton, type RemoteSectionId } from './RemoteFold';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

const IDS: RemoteSectionId[] = ['strips', 'kiosk', 'screens'];

const Harness: React.FC = () => {
  const { fold, collapsed, setAll } = useRemoteFolds();
  return (
    <>
      <RemoteFoldAllButton ids={IDS} collapsed={collapsed} onSetAll={setAll} />
      {IDS.map(id => (
        <React.Fragment key={id}>{fold(id)(<p>{`body-${id}`}</p>)}</React.Fragment>
      ))}
    </>
  );
};

describe('RemoteFoldAllButton', () => {
  beforeEach(() => localStorage.clear());

  it('tout replier puis tout déplier', () => {
    render(<Harness />);
    expect(screen.getAllByText(/^body-/)).toHaveLength(3);
    fireEvent.click(screen.getByText('rsm.collapse_all'));
    expect(screen.queryAllByText(/^body-/)).toHaveLength(0);
    fireEvent.click(screen.getByText('rsm.expand_all'));
    expect(screen.getAllByText(/^body-/)).toHaveLength(3);
  });

  it('un volet replié : propose Tout déplier', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('rsm.section_strips'));
    fireEvent.click(screen.getByText('rsm.expand_all'));
    expect(screen.getAllByText(/^body-/)).toHaveLength(3);
    expect(screen.getByText('rsm.collapse_all')).toBeTruthy();
  });

  it('ne touche pas aux volets non listés', () => {
    localStorage.setItem('bellepoule_remote_collapsed_sections', JSON.stringify(['cyrano']));
    render(<Harness />);
    fireEvent.click(screen.getByText('rsm.collapse_all'));
    fireEvent.click(screen.getByText('rsm.expand_all'));
    expect(JSON.parse(localStorage.getItem('bellepoule_remote_collapsed_sections')!)).toEqual([
      'cyrano',
    ]);
  });
});
