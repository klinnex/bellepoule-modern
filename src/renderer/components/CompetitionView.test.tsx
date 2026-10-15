// @vitest-environment jsdom
/**
 * Tests de composant - CompetitionView
 * BellePoule Modern
 */

import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CompetitionView from './CompetitionView';
import { ToastProvider } from './Toast';
import { ConfirmProvider } from './ConfirmDialog';
import { TranslationProvider } from '../contexts/TranslationContext';
import { Category, Competition, Fencer, FencerStatus, Gender, Weapon } from '../../shared/types';

const fencer = (n: number, status = FencerStatus.CHECKED_IN): Fencer => ({
  id: `f${n}`,
  ref: n,
  lastName: `Nom${n}`,
  firstName: 'Prenom',
  gender: Gender.MALE,
  nationality: 'FRA',
  club: `Club${n % 3}`,
  ranking: n,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const competition = (settings: Record<string, unknown> = {}): Competition =>
  ({
    id: 'c1',
    title: 'Coupe Test',
    date: new Date(),
    weapon: Weapon.EPEE,
    gender: Gender.MALE,
    category: Category.SENIOR,
    color: '#3b5bdb',
    fencers: [],
    referees: [],
    phases: [],
    currentPhaseIndex: 0,
    isTeamEvent: false,
    status: 'in_progress',
    settings: {
      poolRounds: 1,
      hasDirectElimination: true,
      defaultPoolMaxScore: 5,
      defaultTableMaxScore: 15,
      ...settings,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Competition;

/** API Electron factice : toute méthode existe et résout une valeur neutre. */
function mockElectronAPI(fencers: Fencer[], session: unknown = null) {
  const overrides: Record<string, (...args: any[]) => unknown> = {
    getFencersByCompetition: () => fencers,
    getSessionState: () => session,
    getPhasesByCompetition: () => [],
    createPhase: () => ({ id: 'ph1', type: 'pool' }),
    updateFencer: () => undefined,
  };
  const calls: Record<string, any[][]> = {};
  const group = (): any =>
    new Proxy(
      {},
      {
        get: (_t, key) => {
          if (typeof key !== 'string' || key === 'then') return undefined;
          return (...args: any[]) => {
            (calls[key] ??= []).push(args);
            let value: unknown;
            if (overrides[key]) value = overrides[key](...args);
            else if (/^(get|list)/.test(key) && !/(Info|State|Snapshot)$/.test(key)) value = [];
            return Promise.resolve(value);
          };
        },
      }
    );
  const groups = ['db', 'file', 'dialog', 'updater', 'crypto', 'remote', 'training', 'themes'];
  (window as any).electronAPI = {
    ...Object.fromEntries(groups.map(g => [g, group()])),
    initialLanguage: null,
    removeAllListeners: () => {},
    ...Object.fromEntries(
      [
        'onMenuCompetitionProperties',
        'onMenuImport',
        'onMenuExport',
        'onFileOpened',
        'onMenuAddFencer',
        'onRemoteCheckinUpdated',
      ].map(k => [k, () => () => {}])
    ),
  };
  return calls;
}

const renderView = (
  comp = competition(),
  props: Record<string, unknown> = {},
  onCommit: () => void = () => {}
) =>
  render(
    <TranslationProvider>
      <ToastProvider>
        <ConfirmProvider>
          <React.Profiler id="cv" onRender={onCommit}>
            <CompetitionView competition={comp} onUpdate={vi.fn()} {...props} />
          </React.Profiler>
        </ConfirmProvider>
      </ToastProvider>
    </TranslationProvider>
  );

describe('CompetitionView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche la navigation des phases, appel actif et poules verrouillées', async () => {
    mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
    renderView();
    expect(await screen.findByText('Nom1')).toBeInTheDocument();
    const nav = document.querySelector('.phase-nav') as HTMLElement;
    expect(nav).toBeTruthy();
    expect(nav.querySelector('.phase-step-active')).toBeTruthy();
    const steps = Array.from(nav.querySelectorAll('.phase-step'));
    // appel, préparation, poules, classement, tableau, résultats, saisie distante
    expect(steps.length).toBeGreaterThanOrEqual(7);
    expect(steps[0]).toHaveClass('phase-step-active');
    expect(steps[2]).toHaveClass('phase-step-disabled');
  });

  it('sans élimination directe, la phase tableau est absente', async () => {
    mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
    renderView(competition({ hasDirectElimination: false }));
    await screen.findByText('Nom1');
    const nav = document.querySelector('.phase-nav') as HTMLElement;
    expect(within(nav).queryByText('🏆')).toBeNull();
  });

  it('« Générer les poules » désactivé sous 4 tireurs pointés', async () => {
    mockElectronAPI([fencer(1), fencer(2), fencer(3), fencer(4, FencerStatus.NOT_CHECKED_IN)]);
    renderView();
    await screen.findByText('Nom1');
    const btn = screen.getByRole('button', { name: /Générer les poules/ });
    expect(btn).toBeDisabled();
  });

  it('génère les poules, les persiste en base et passe en préparation', async () => {
    const calls = mockElectronAPI(Array.from({ length: 10 }, (_, i) => fencer(i + 1)));
    renderView();
    await screen.findByText('Nom1');
    const btn = screen.getByRole('button', { name: /Générer les poules/ });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(calls.createPool?.length).toBeGreaterThan(0));
    // 10 tireurs en poules de 5 à 7 : 2 poules, 10 matchs par poule de 5
    const poolIds = calls.createPool.map(a => a[2]);
    expect(new Set(poolIds).size).toBe(calls.createPool.length);
    expect(calls.addFencerToPool).toHaveLength(10);
    const placed = new Set(calls.addFencerToPool.map(a => a[1]));
    expect(placed.size).toBe(10);
    expect(calls.createMatch.length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(document.querySelectorAll('.phase-step')[1]).toHaveClass('phase-step-active')
    );
  });

  it('restaure la phase sauvegardée (session) et permet de revenir en arrière', async () => {
    mockElectronAPI(
      [1, 2, 3, 4].map(n => fencer(n)),
      {
        currentPhase: 1,
        pools: [],
        uiState: { currentPhase: 'poolprep', currentPoolRound: 1, pools: 0 },
      }
    );
    renderView();
    await waitFor(() =>
      expect(document.querySelectorAll('.phase-step')[1]).toHaveClass('phase-step-active')
    );
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    await waitFor(() =>
      expect(document.querySelectorAll('.phase-step')[0]).toHaveClass('phase-step-active')
    );
  });

  it('cliquer une phase désactivée ne change pas de phase', async () => {
    mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
    renderView();
    await screen.findByText('Nom1');
    const steps = document.querySelectorAll('.phase-step');
    fireEvent.click(steps[2]);
    expect(steps[0]).toHaveClass('phase-step-active');
    expect(steps[2]).not.toHaveClass('phase-step-active');
  });

  it('plusieurs tours de poules : libellé « tour 1/2 »', async () => {
    mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
    renderView(competition({ poolRounds: 2 }));
    await screen.findByText('Nom1');
    const steps = Array.from(document.querySelectorAll('.phase-step'));
    expect(steps[2].textContent).toMatch(/1.*2/);
  });

  it("l'appel se stabilise : plus aucun rendu une fois chargé", async () => {
    // Régression : visibleCols recréé à chaque rendu → onAppelStateChange → boucle infinie
    mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
    let commits = 0;
    renderView(competition(), {}, () => commits++);
    await screen.findByText('Nom1');
    await new Promise(r => setTimeout(r, 400));
    const settled = commits;
    await new Promise(r => setTimeout(r, 100));
    expect(commits).toBe(settled);
  });

  it('pointer un tireur met à jour son statut en base', async () => {
    const calls = mockElectronAPI([fencer(1, FencerStatus.NOT_CHECKED_IN), fencer(2)]);
    renderView();
    await screen.findByText('Nom1');
    fireEvent.click(screen.getByRole('button', { name: 'Pointer' }));
    await waitFor(() => expect(calls.updateFencer?.length).toBeGreaterThan(0));
    expect(calls.updateFencer[0][1]).toEqual({ status: FencerStatus.CHECKED_IN });
  });

  describe('compétition par équipes (#1085)', () => {
    const teamComp = () => ({ ...competition(), isTeamEvent: true }) as Competition;
    const labels = () =>
      Array.from(document.querySelectorAll('.phase-step')).map(el => el.textContent ?? '');

    it('remplace poules/tableau individuels par les phases équipes', async () => {
      mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
      renderView(teamComp());
      await screen.findByText('Nom1');
      const l = labels();
      expect(l.some(x => /Équipes$/.test(x))).toBe(true);
      expect(l.some(x => /Poule équipes/.test(x))).toBe(true);
      expect(l.some(x => /Tableau équipes/.test(x))).toBe(true);
      expect(l.some(x => /Classement équipes/.test(x))).toBe(true);
      expect(l.some(x => /Préparation/.test(x))).toBe(false);
      expect(screen.queryByRole('button', { name: /Générer les poules/ })).toBeNull();
    });

    it('« Composer les équipes » ouvre la phase équipes intégrée (sans modale)', async () => {
      const calls = mockElectronAPI([1, 2, 3, 4].map(n => fencer(n)));
      renderView(teamComp());
      await screen.findByText('Nom1');
      fireEvent.click(screen.getByRole('button', { name: /Composer les équipes/ }));
      await waitFor(() => expect(calls.getTeamsByCompetition?.length).toBeGreaterThan(0));
      const active = document.querySelector('.phase-step-active');
      expect(active?.textContent).toMatch(/Équipes$/);
      expect(document.querySelector('.fixed.inset-0')).toBeNull();
    });
  });
});
