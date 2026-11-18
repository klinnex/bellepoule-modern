// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : séances, pistes, scores
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));
vi.mock('../ConfirmDialog', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));
import { ClubSessionsPanel } from './ClubSessionsPanel';
import { Weapon } from '../../../shared/types';

const m = (id: string, lastName: string) => ({
  id,
  firstName: 'X',
  lastName,
  weapons: [],
  active: true,
  cardCode: 'A1B2C3D4E5',
  createdAt: '',
  updatedAt: '',
});
const session = {
  id: 's1',
  clubId: 'c1',
  date: '2026-11-16',
  stripCount: 2,
  status: 'open',
  openedAt: '',
  attendeeIds: ['a', 'b'],
  coachIds: [],
  plan: [{ id: 'e1', title: 'Échauffement', minutes: 15 }],
  memberFeedback: {},
  createdAt: '',
  updatedAt: '',
};
const live = {
  id: 'bt1',
  sessionId: 's1',
  date: '2026-11-16',
  strip: 1,
  memberAId: 'a',
  memberBId: 'b',
  scoreA: 0,
  scoreB: 0,
  maxScore: 5,
  winnerId: null,
  status: 'in_progress',
  entryMode: 'master',
  createdAt: '',
  updatedAt: '',
};
const settings = { name: 'Club', stripCount: 2 };

let api: Record<string, ReturnType<typeof vi.fn>>;
let training: Record<string, ReturnType<typeof vi.fn>>;
let remoteApi: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  api = {
    listSessions: vi.fn().mockResolvedValue([session]),
    listMembers: vi.fn().mockResolvedValue([m('a', 'ALPHA'), m('b', 'BRAVO'), m('c', 'CHARLIE')]),
    listCoaches: vi.fn().mockResolvedValue([]),
    listBouts: vi.fn().mockResolvedValue([live]),
    createSession: vi.fn(),
    createBout: vi.fn().mockResolvedValue({ id: 'bt2' }),
    startBout: vi.fn(),
    finishBout: vi.fn(),
    cancelBout: vi.fn(),
    setAttendance: vi.fn(),
    closeSession: vi.fn(),
    reopenSession: vi.fn(),
    remoteStatus: vi.fn().mockResolvedValue({ active: false, url: null, strips: 0 }),
    updateSession: vi.fn(),
    startSession: vi.fn(),
    deleteSession: vi.fn(),
    setMemberFeedback: vi.fn(),
    pushBout: vi.fn().mockResolvedValue('ok'),
    releaseBout: vi.fn(),
    linkRemote: vi.fn().mockResolvedValue(undefined),
    createSeries: vi.fn().mockResolvedValue([{ id: 'x1' }, { id: 'x2' }]),
  };
  training = {
    startServer: vi.fn().mockResolvedValue({ success: true }),
    startSession: vi.fn().mockResolvedValue({ success: true }),
    stopSession: vi.fn().mockResolvedValue({ success: true }),
    stopServer: vi.fn().mockResolvedValue({ success: true }),
    setTheme: vi.fn().mockResolvedValue({ success: true }),
  };
  remoteApi = { setArenaPassword: vi.fn().mockResolvedValue({ success: true }) };
  localStorage.clear();
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    club: api,
    training,
    remote: remoteApi,
  };
});

describe('ClubSessionsPanel', () => {
  it('sans séance ouverte : ouvre la séance du jour avec les pistes et l’arme du club', async () => {
    api.listSessions.mockResolvedValue([]);
    render(<ClubSessionsPanel clubId="c1" settings={{ ...settings, weapon: Weapon.SABRE }} />);
    expect(await screen.findByLabelText('Arme')).toHaveValue('S');
    fireEvent.change(screen.getByLabelText('Arme'), { target: { value: 'F' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir la séance' }));
    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ stripCount: 2, label: '', weapon: 'F' })
      )
    );
  });

  it('combat en cours sur la piste 1 : saisie du score et fin', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    expect(await screen.findByText('Piste 1')).toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '5' } });
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }));
    await waitFor(() =>
      expect(api.finishBout).toHaveBeenCalledWith('bt1', { scoreA: 5, scoreB: 3 })
    );
  });

  it('piste 2 libre : appariement manuel parmi les présents', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    const a = await screen.findByLabelText('Tireur 1 — piste 2');
    // Seuls les présents (ALPHA, BRAVO) sont proposés
    expect(screen.queryAllByRole('option', { name: 'CHARLIE X' })).toHaveLength(0);
    fireEvent.change(a, { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Tireur 2 — piste 2'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    await waitFor(() =>
      expect(api.createBout).toHaveBeenCalledWith({
        sessionId: 's1',
        memberAId: 'a',
        memberBId: 'b',
        strip: 2,
      })
    );
    await waitFor(() => expect(api.startBout).toHaveBeenCalledWith('bt2'));
  });

  it('pointage (fenêtre, catégories du cours) et fermeture', async () => {
    api.listMembers.mockResolvedValue([
      { ...m('a', 'ALPHA'), birthYear: 2015 },
      { ...m('b', 'BRAVO'), birthYear: 2015 },
      { ...m('c', 'CHARLIE'), birthYear: 2015 },
      { ...m('d', 'DELTA'), birthYear: 1980 },
    ]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pointage (2)' }));
    expect(await screen.findByRole('button', { name: /DELTA X/ })).toBeInTheDocument();
    // Plage de catégories : DELTA (vétéran) disparaît, la plage est retenue pour la séance
    fireEvent.change(screen.getByLabelText('De la catégorie'), { target: { value: 'U9' } });
    fireEvent.change(screen.getByLabelText('À la catégorie'), { target: { value: 'U15' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: /DELTA X/ })).toBeNull());
    await waitFor(() =>
      expect(api.updateSession).toHaveBeenLastCalledWith('s1', { ageFrom: 'U9', ageTo: 'U15' })
    );
    fireEvent.click(screen.getByRole('button', { name: /CHARLIE X/ }));
    await waitFor(() => expect(api.setAttendance).toHaveBeenCalledWith('s1', 'c', true));
    const closeButtons = screen.getAllByRole('button', { name: 'Fermer' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer la séance' }));
    await waitFor(() => expect(api.closeSession).toHaveBeenCalledWith('s1'));
  });

  it('saisie distante : démarre le serveur, envoie les combats en cours aux tablettes', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    const start = await screen.findByRole('button', { name: 'Activer la saisie distante' });
    api.remoteStatus.mockResolvedValue({ active: true, url: 'https://10.0.0.2:8066', strips: 2 });
    fireEvent.click(start);
    await waitFor(() => expect(training.startServer).toHaveBeenCalledWith(8066, '0.0.0.0', true));
    expect(training.setTheme).toHaveBeenCalledWith('dark');
    // Sans mot de passe : pistes en accès libre
    expect(remoteApi.setArenaPassword).toHaveBeenCalledWith('__training__', 'arena1', '');
    await waitFor(() => expect(api.linkRemote).toHaveBeenCalledWith('s1'));
    expect(training.startSession).toHaveBeenCalledWith(2, 'E');
    await waitFor(() => expect(api.pushBout).toHaveBeenCalledWith('bt1'));
    expect(
      await screen.findByText(/https:\/\/10\.0\.0\.2:8066\/areneN\/arbitre/)
    ).toBeInTheDocument();
    // Combat lancé ensuite : envoyé à la tablette de sa piste
    fireEvent.change(screen.getByLabelText('Tireur 1 — piste 2'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Tireur 2 — piste 2'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    await waitFor(() => expect(api.pushBout).toHaveBeenCalledWith('bt2'));
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(training.stopServer).toHaveBeenCalled());
    expect(api.linkRemote).toHaveBeenCalledWith(null);
  });

  it('paramètres de la saisie distante : réseau mémorisé, thème et mot de passe appliqués', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Paramètres' }));
    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '9000' } });
    fireEvent.click(screen.getByLabelText('Activer HTTPS (connexion chiffrée)'));
    fireEvent.change(screen.getByLabelText('Thème des écrans'), { target: { value: 'neon' } });
    const pwd = screen.getByLabelText('Mot de passe commun des pistes');
    fireEvent.change(pwd, { target: { value: 'court' } });
    expect(screen.getByRole('button', { name: 'Sauvegarder' })).toBeDisabled();
    fireEvent.change(pwd, { target: { value: 'secret-club' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    // Mot de passe jamais stocké
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-club');

    api.remoteStatus.mockResolvedValue({ active: true, url: 'http://10.0.0.2:9000', strips: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Activer la saisie distante' }));
    await waitFor(() => expect(training.startServer).toHaveBeenCalledWith(9000, '0.0.0.0', false));
    await waitFor(() => expect(training.setTheme).toHaveBeenCalledWith('neon'));
    expect(remoteApi.setArenaPassword).toHaveBeenCalledWith(
      '__training__',
      'arena2',
      'secret-club'
    );
  });

  it('aucun présent pointé : menus des pistes libres explicites et désactivés', async () => {
    api.listSessions.mockResolvedValue([{ ...session, attendeeIds: [] }]);
    api.listBouts.mockResolvedValue([]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    const select = await screen.findByLabelText('Tireur 1 — piste 1');
    expect(select).toBeDisabled();
    expect(select).toHaveTextContent('Aucun combattant pointé sur la séance');
  });

  it('piste : liens affichage et arbitre une fois la saisie distante active', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    expect(
      await screen.findByRole('button', { name: 'Liens et QR codes de la piste 2' })
    ).toBeDisabled();
    cleanup();
    api.remoteStatus.mockResolvedValue({ active: true, url: 'https://10.0.0.2:8066', strips: 2 });
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    const btn = await screen.findByRole('button', { name: 'Liens et QR codes de la piste 2' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(screen.getByText('https://10.0.0.2:8066/arene2')).toBeInTheDocument();
    expect(screen.getByText('https://10.0.0.2:8066/arene2/arbitre')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR code : Vue arbitre' })).toBeInTheDocument();
  });

  it('saisie distante active : lobby des pistes', async () => {
    api.remoteStatus.mockResolvedValue({ active: true, url: 'https://10.0.0.2:8066', strips: 2 });
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    expect(await screen.findByText('https://10.0.0.2:8066/entrainement-lobby')).toBeInTheDocument();
    await waitFor(() => expect(api.linkRemote).toHaveBeenCalledWith('s1'));
  });

  it('ouverture avec les catégories d’âge du cours', async () => {
    api.listSessions.mockResolvedValue([]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.change(await screen.findByLabelText('De la catégorie'), {
      target: { value: 'U11' },
    });
    fireEvent.change(screen.getByLabelText('À la catégorie'), { target: { value: 'U13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la séance' }));
    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ ageFrom: 'U11', ageTo: 'U13' })
      )
    );
  });

  it('séance préparée répétée chaque semaine', async () => {
    api.listSessions.mockResolvedValue([]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Préparer une séance' }))[0]);
    fireEvent.change(await screen.findByLabelText('Exercice 1'), { target: { value: 'Fentes' } });
    fireEvent.click(screen.getByRole('button', { name: /Répéter cette séance/ }));
    fireEvent.change(screen.getByLabelText('Séances'), { target: { value: '4' } });
    expect(screen.getByText(/Séances créées : 4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() =>
      expect(api.createSeries).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          planned: true,
          plan: [expect.objectContaining({ title: 'Fentes' })],
        }),
        { everyDays: 7, count: 4 }
      )
    );
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('annuler un combat libère la tablette', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler le combat' }));
    await waitFor(() => expect(api.releaseBout).toHaveBeenCalledWith('bt1'));
  });

  it('séance en cours : exercice coché, notes enregistrées', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: /Échauffement/ }));
    await waitFor(() =>
      expect(api.updateSession).toHaveBeenCalledWith('s1', {
        plan: [{ id: 'e1', title: 'Échauffement', minutes: 15, done: true }],
      })
    );
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Bonne énergie' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les notes' }));
    await waitFor(() =>
      expect(api.updateSession).toHaveBeenCalledWith('s1', { notes: 'Bonne énergie' })
    );
  });

  it('fermeture : bilan proposé, note et remarque par tireur', async () => {
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer la séance' }));
    expect(await screen.findByText('Bilan de la séance du 2026-11-16')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '4 sur 5' }));
    fireEvent.change(screen.getByLabelText('Ce qui a bien marché'), {
      target: { value: 'Rythme' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'ALPHA X' }), {
      target: { value: 'Bonne parade' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() =>
      expect(api.updateSession).toHaveBeenCalledWith('s1', {
        feedback: { rating: 4, wentWell: 'Rythme', toImprove: '' },
      })
    );
    await waitFor(() =>
      expect(api.setMemberFeedback).toHaveBeenCalledWith('s1', 'a', 'Bonne parade')
    );
    expect(api.setMemberFeedback).toHaveBeenCalledTimes(1);
  });

  it('préparer une séance à l’avance puis la démarrer', async () => {
    const planned = { ...session, id: 'p1', status: 'planned', date: '2026-11-20', plan: [] };
    api.listSessions.mockResolvedValue([planned]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    expect(await screen.findByText('2026-11-20')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Démarrer' }));
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith('p1'));
    // Nouvelle séance préparée : un exercice, enregistrée « prévue »
    fireEvent.click(screen.getAllByRole('button', { name: 'Préparer une séance' })[0]);
    fireEvent.change(await screen.findByLabelText('Exercice 1'), {
      target: { value: 'Assauts dirigés' },
    });
    fireEvent.change(screen.getByLabelText('Objectifs'), { target: { value: 'Distance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          planned: true,
          objectives: 'Distance',
          plan: [expect.objectContaining({ title: 'Assauts dirigés', minutes: 10 })],
        })
      )
    );
  });

  it('séance ouverte : bascule vers une séance prévue sans fermer la séance en cours', async () => {
    const planned = { ...session, id: 'p1', status: 'planned', date: '2026-11-20', plan: [] };
    api.listSessions.mockResolvedValue([session, planned]);
    const onActiveChange = vi.fn();
    render(<ClubSessionsPanel clubId="c1" settings={settings} onActiveChange={onActiveChange} />);
    const select = await screen.findByLabelText('Passer à la séance…');
    fireEvent.change(select, { target: { value: 'p1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Changer de séance' }));
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith('p1'));
    expect(api.closeSession).not.toHaveBeenCalled();
    expect(onActiveChange).toHaveBeenCalledWith('p1');
  });

  it('plusieurs séances ouvertes : affiche la séance choisie, liste des ouvertes', async () => {
    const other = { ...session, id: 's2', date: '2026-11-17', label: 'Adultes', attendeeIds: [] };
    api.listSessions.mockResolvedValue([session, other]);
    const onActiveChange = vi.fn();
    const { rerender } = render(
      <ClubSessionsPanel clubId="c1" settings={settings} onActiveChange={onActiveChange} />
    );
    // Par défaut : la plus récente
    expect(await screen.findByText(/Séance du 2026-11-17/)).toBeInTheDocument();
    rerender(
      <ClubSessionsPanel
        clubId="c1"
        settings={settings}
        activeSessionId="s1"
        onActiveChange={onActiveChange}
      />
    );
    expect(await screen.findByText(/Séance du 2026-11-16/)).toBeInTheDocument();
    await waitFor(() =>
      expect(api.listBouts).toHaveBeenLastCalledWith({ sessionId: 's1', includeUnfinished: true })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les séances' }));
    expect(await screen.findByText('Séances ouvertes (2)')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Afficher' })[0]);
    expect(onActiveChange).toHaveBeenCalledWith('s2');
  });

  it('ouverture : date choisie dans le mini-calendrier', async () => {
    api.listSessions.mockResolvedValue([]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    const cal = await screen.findByRole('group', { name: 'Date' });
    const days = cal.querySelectorAll('button.mini-cal-day:not(.is-out)');
    fireEvent.click(days[2]);
    const picked = days[2].getAttribute('aria-label')!.slice(0, 10);
    expect(days[2]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la séance' }));
    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ date: picked })
      )
    );
  });

  it('plan : exercices ajoutés depuis la bibliothèque (échauffement proposé d’abord)', async () => {
    api.listSessions.mockResolvedValue([]);
    api.listExercises = vi.fn().mockResolvedValue([
      {
        id: 'w',
        title: 'Footing',
        category: 'warmup',
        minutes: 12,
        images: [],
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 't',
        title: 'Parade',
        category: 'technique',
        minutes: 20,
        images: [],
        createdAt: '',
        updatedAt: '',
      },
    ]);
    render(<ClubSessionsPanel clubId="c1" settings={settings} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Préparer une séance' }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Depuis la bibliothèque' }));
    // Plan vide : la famille « Échauffement » est proposée d'abord
    expect(await screen.findByText('Footing')).toBeInTheDocument();
    expect(screen.queryByText('Parade')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Footing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sauvegarder' }));
    await waitFor(() =>
      expect(api.createSession).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          plan: [expect.objectContaining({ title: 'Footing', minutes: 12, category: 'warmup' })],
        })
      )
    );
  });
});
