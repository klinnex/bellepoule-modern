/**
 * Outils partagés des tests de RemoteScoreServer (#1896) : base factice, requête / réponse Express.
 */
import { vi, type Mock } from 'vitest';

// Mock pour la DB
export const mockDb: Record<string, Mock> = {
  getCompetition: vi.fn(),
  getPendingMatches: vi.fn().mockReturnValue([]),
  getCompetitionPools: vi.fn().mockReturnValue([]),
  getMatchesByPool: vi.fn().mockReturnValue([]),
  getPoolFencers: vi.fn().mockReturnValue([]),
  getMatch: vi.fn().mockReturnValue(null),
  updateMatch: vi.fn(),
  logScoreChange: vi.fn(),
  saveArenaState: vi.fn(),
  getArenaState: vi.fn().mockReturnValue(null),
  getFencersByCompetition: vi.fn().mockReturnValue([]),
  getRefereesByCompetition: vi.fn().mockReturnValue([]),
  updateFencer: vi.fn(),
  getFencer: vi.fn().mockReturnValue(null),
  updateReferee: vi.fn(),
  getSessionState: vi.fn().mockReturnValue(null),
};

// Helpers pour simuler request / response Express
export function makeReq(overrides: Record<string, any> = {}): any {
  return {
    params: {},
    body: {},
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    url: '/',
    path: '/',
    ...overrides,
  };
}

export function makeRes(): any {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  };
  return res;
}
