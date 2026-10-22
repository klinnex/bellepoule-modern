// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MatchEventEntry } from '../../../shared/types';
import { MatchAuditLog } from '../MatchAuditLog';

vi.mock('../Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../contexts/TranslationContext', () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

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
    expect(await screen.findByText('matchAudit.events {"count":3}')).toBeInTheDocument();
    expect(screen.getByText('matchAudit.matches_log')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('matchAudit.select_match'), { target: { value: 'm2' } });
    expect(screen.getByText('matchAudit.events {"count":1}')).toBeInTheDocument();
  });

  it('filtre par arbitre (saisie ou assignation)', async () => {
    render(<MatchAuditLog competitionId="c1" matchOptions={options} />);
    await screen.findByText('matchAudit.events {"count":3}');

    fireEvent.change(screen.getByLabelText('matchAudit.filter_referee'), {
      target: { value: 'Durand' },
    });
    expect(screen.getByText('matchAudit.events {"count":2}')).toBeInTheDocument();

    const matchSelect = screen.getByLabelText('matchAudit.select_match') as HTMLSelectElement;
    expect(Array.from(matchSelect.options).map(o => o.value)).toEqual(['', 'm1']);
  });
});

describe('MatchAuditLog — replay (#1074)', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      db: {
        getCompetitionTimeline: vi.fn().mockResolvedValue(entries),
        getMatchTimeline: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('rejoue le match sélectionné événement par événement', async () => {
    render(<MatchAuditLog competitionId="c1" matchOptions={options} />);
    await screen.findByText('matchAudit.events {"count":3}');
    expect(screen.queryByText('replay.title')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('matchAudit.select_match'), { target: { value: 'm1' } });
    fireEvent.click(screen.getByText('replay.title'));
    expect(screen.getByText('replay.event_n {"current":1,"total":2}')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('replay.next'));
    expect(screen.getByText('replay.event_n {"current":2,"total":2}')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument();
  });
});
