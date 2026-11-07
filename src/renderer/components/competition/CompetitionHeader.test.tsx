// @vitest-environment jsdom
/**
 * Tests du bandeau compétition : bouton « Saisie distante / Piste » (#1414)
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CompetitionHeader from './CompetitionHeader';
import type { Competition } from '../../../shared/types';

const competition = {
  id: 'c1',
  title: 'Open',
  date: '2026-11-07',
  location: 'Lyon',
  weapon: 'E',
  category: 'SENIOR',
  gender: 'MIXED',
  color: '#1a7f37',
} as unknown as Competition;

const noop = () => {};

function renderHeader(onOpenRemote?: () => void, setShowPropertiesModal: () => void = noop) {
  return render(
    <CompetitionHeader
      competition={competition}
      language="fr"
      t={(k: string) => k}
      matchProgress={null}
      showConfetti={false}
      showActionsMenu={false}
      setShowActionsMenu={noop}
      actionsMenuRef={{ current: null }}
      currentPhase="checkin"
      pools={[]}
      tableauMatches={[]}
      fencersCount={0}
      checkedInCount={0}
      setShowFencerComparison={noop}
      setShowAnalytics={noop}
      setShowSeasonRanking={noop}
      setShowQRCode={noop}
      setShowPresentation={noop}
      setShowKiosk={noop}
      setShowKioskDisplay={noop}
      setShowPropertiesModal={setShowPropertiesModal}
      setShowExportCenter={noop}
      onOpenRemote={onOpenRemote}
    />
  );
}

describe('CompetitionHeader - bouton propriétés (#1505)', () => {
  it('affiche le bouton directement dans le bandeau et ouvre les propriétés', () => {
    const setShow = vi.fn();
    renderHeader(undefined, setShow);
    fireEvent.click(screen.getByRole('button', { name: 'competitionHeader.properties' }));
    expect(setShow).toHaveBeenCalledWith(true);
  });
});

describe('CompetitionHeader - bouton saisie distante', () => {
  it('affiche le bouton et ouvre la saisie distante au clic', () => {
    const onOpenRemote = vi.fn();
    renderHeader(onOpenRemote);
    fireEvent.click(screen.getByText('competitionHeader.remote_button'));
    expect(onOpenRemote).toHaveBeenCalledTimes(1);
  });

  it('sans gestionnaire : pas de bouton', () => {
    renderHeader();
    expect(screen.queryByText('competitionHeader.remote_button')).toBeNull();
  });
});
