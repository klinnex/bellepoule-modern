// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MatchEventEntry } from '../../../shared/types';
import { MatchAuditLog } from '../MatchAuditLog';

vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

function ev(
  id: string,
  matchId: string,
  ts: string,
  extra: Partial<MatchEventEntry> = {}
): MatchEventEntry {
  return {
    id,
    matchId,
    eventType: 'score_change',
    timestamp: ts,
    fencerId: null,
    fencerLastName: null,
    fencerFirstName: null,
    fencerSide: null,
    previousScoreA: { value: 0 },
    previousScoreB: { value: 0 },
    newScoreA: { value: 1 },
    newScoreB: { value: 0 },
    changedBy: null,
    refereeName: null,
    ipAddress: null,
    changeReason: null,
    zone: null,
    points: null,
    cardType: null,
    cardReason: null,
    cardGroup: null,
    resultingExclusion: null,
    exitType: null,
    ...extra,
  } as MatchEventEntry;
}

const entries = [
  ev('e1', 'm1', '2026-01-01T10:00:00Z', { refereeName: 'Durand' }),
  ev('e2', 'm2', '2026-01-01T10:01:00Z', { refereeName: 'Martin' }),
  ev('e3', 'm1', '2026-01-01T10:02:00Z'),
];

const options = [
  { id: 'm1', label: 'Poule 1 — M1 : A vs B', referees: [] },
  { id: 'm2', label: 'Poule 2 — M1 : C vs D', referees: ['Martin'] },
];

describe('MatchAuditLog — vue compétition', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: {
        getCompetitionTimeline: vi.fn().mockResolvedValue(entries),
        getMatchTimeline: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('affiche tous les matchs avec colonne Match, puis filtre par match', async () => {
    render(<MatchAuditLog competitionId="c1" matchOptions={options} />);
    expect(await screen.findByText('3 événements')).toBeInTheDocument();
    expect(screen.getByText('Journal des matchs')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sélectionner un match'), { target: { value: 'm2' } });
    expect(screen.getByText('1 événement')).toBeInTheDocument();
  });

  it('filtre par arbitre (saisie ou assignation)', async () => {
    render(<MatchAuditLog competitionId="c1" matchOptions={options} />);
    await screen.findByText('3 événements');

    fireEvent.change(screen.getByLabelText('Filtrer par arbitre'), { target: { value: 'Durand' } });
    expect(screen.getByText('2 événements')).toBeInTheDocument();

    const matchSelect = screen.getByLabelText('Sélectionner un match') as HTMLSelectElement;
    expect(Array.from(matchSelect.options).map(o => o.value)).toEqual(['', 'm1']);
  });
});
