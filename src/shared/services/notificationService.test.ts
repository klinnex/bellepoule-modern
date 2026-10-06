/**
 * Tests unitaires - NotificationService (construction des payloads + sécurité webhook)
 * BellePoule Modern
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import NotificationService, { isWebhookUrlSafe } from './notificationService';
import {
  Fencer,
  Match,
  Competition,
  Gender,
  FencerStatus,
  MatchStatus,
  Weapon,
  Category,
} from '../types';

const fencer = (id: string, firstName: string, lastName: string): Fencer => ({
  id,
  ref: Number(id),
  firstName,
  lastName,
  gender: Gender.MALE,
  nationality: 'FRA',
  status: FencerStatus.CHECKED_IN,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const match = (over: Partial<Match> = {}): Match => ({
  id: 'm1',
  number: 1,
  fencerA: fencer('1', 'Jean', 'Dupont'),
  fencerB: fencer('2', 'Marie', 'Martin'),
  scoreA: null,
  scoreB: null,
  maxScore: 5,
  status: MatchStatus.NOT_STARTED,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const competition = (): Competition =>
  ({
    id: 'c1',
    title: 'Open',
    date: new Date(),
    weapon: Weapon.EPEE,
    gender: Gender.MIXED,
    category: Category.SENIOR,
    fencers: [],
    referees: [],
    phases: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Competition;

describe('NotificationService - payloads', () => {
  let svc: NotificationService;
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    svc = new NotificationService();
    notify = vi.fn();
    vi.spyOn(svc, 'notify').mockImplementation(notify as any);
  });

  it('notifyMatchStarting construit titre/corps/piste', () => {
    svc.notifyMatchStarting(match(), 3);
    const p = notify.mock.calls[0][0];
    expect(p.title).toContain('Match');
    expect(p.body).toContain('Dupont');
    expect(p.body).toContain('Martin');
    expect(p.body).toContain('3');
    expect(p.data.type).toBe('match-starting');
  });

  it('notifyMatchCompleted indique le vainqueur (meilleur score)', () => {
    const m = match({
      scoreA: { value: 5, isVictory: true } as any,
      scoreB: { value: 3, isVictory: false } as any,
      status: MatchStatus.FINISHED,
    });
    svc.notifyMatchCompleted(m);
    const p = notify.mock.calls[0][0];
    expect(p.body).toContain('5 - 3');
    expect(p.body).toContain('Vainqueur: Jean Dupont');
  });

  it('notifyCompetitionStarted / Ended référencent le titre', () => {
    svc.notifyCompetitionStarted(competition());
    svc.notifyCompetitionEnded(competition());
    expect(notify.mock.calls[0][0].body).toContain('Open');
    expect(notify.mock.calls[1][0].data.type).toBe('competition-ended');
  });

  it('notifyFencerLate inclut le délai', () => {
    svc.notifyFencerLate(fencer('9', 'Léa', 'Roy'), 12);
    const p = notify.mock.calls[0][0];
    expect(p.body).toContain('Roy');
    expect(p.body).toContain('12');
  });

  it('respecte la désactivation d’un évènement', () => {
    const off = new NotificationService({
      events: {
        matchStarting: false,
        matchCompleted: true,
        competitionStarted: true,
        competitionEnded: true,
        fencerLate: true,
      },
    });
    const n = vi.fn();
    vi.spyOn(off, 'notify').mockImplementation(n as any);
    off.notifyMatchStarting(match(), 1);
    expect(n).not.toHaveBeenCalled();
  });
});

describe('NotificationService - isWebhookUrlSafe', () => {
  const safe = (u: string) => isWebhookUrlSafe(u);

  it('accepte une URL https publique', () => {
    expect(safe('https://hooks.example.com/abc')).toBe(true);
  });

  it('refuse le http', () => {
    expect(safe('http://example.com')).toBe(false);
  });

  it('refuse localhost et les IP privées', () => {
    expect(safe('https://localhost/x')).toBe(false);
    expect(safe('https://127.0.0.1/x')).toBe(false);
    expect(safe('https://192.168.1.10/x')).toBe(false);
    expect(safe('https://10.0.0.5/x')).toBe(false);
    expect(safe('https://172.16.0.1/x')).toBe(false);
  });

  it('refuse une URL invalide', () => {
    expect(safe('pas-une-url')).toBe(false);
  });
});
