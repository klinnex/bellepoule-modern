// @vitest-environment jsdom
/**
 * Tests de composant - Mode Club (#1872) : lancement d'un combat par scan
 */
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
vi.mock('../../hooks/useTranslation', () => import('../../testUtils/i18nMock'));

// Lecteur simulé : expose onDecode pour « présenter » des QR
let decode: (text: string) => void = () => undefined;
vi.mock('./QrScanner', () => ({
  QrScanner: ({ onDecode }: { onDecode: (t: string) => void }) => {
    decode = onDecode;
    return null;
  },
}));
import { ClubScanModal } from './ClubScanModal';

const member = (id: string, code: string, lastName: string) => ({
  id,
  firstName: 'X',
  lastName,
  weapons: [],
  active: true,
  cardCode: code,
  createdAt: '',
  updatedAt: '',
});
const session = {
  id: 's1',
  clubId: 'c1',
  date: '2026-11-16',
  stripCount: 3,
  status: 'open' as const,
  openedAt: '',
  attendeeIds: [],
  coachIds: [],
  plan: [],
  memberFeedback: {},
  createdAt: '',
  updatedAt: '',
};

let api: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  const members: Record<string, ReturnType<typeof member>> = {
    AAAAAAAAAA: member('a', 'AAAAAAAAAA', 'ALPHA'),
    BBBBBBBBBB: member('b', 'BBBBBBBBBB', 'BRAVO'),
  };
  api = {
    findMemberByCardCode: vi.fn(async (code: string, _clubId?: string) => members[code] ?? null),
    setAttendance: vi.fn(),
    createBout: vi.fn().mockResolvedValue({ id: 'bt1' }),
    startBout: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { club: api };
});

const scan = async (text: string) => {
  await act(async () => {
    decode(text);
  });
};

describe('ClubScanModal', () => {
  it('piste puis 2 cartes : pointe, crée et lance le combat', async () => {
    const onLaunched = vi.fn();
    render(<ClubScanModal session={session} onClose={vi.fn()} onLaunched={onLaunched} />);
    await scan('BPC1:A:2');
    expect(screen.getByText('Piste 2')).toBeInTheDocument();
    await scan('BPC1:M:AAAAAAAAAA');
    expect(screen.getByText('ALPHA X')).toBeInTheDocument();
    await scan('BPC1:M:BBBBBBBBBB');
    await waitFor(() =>
      expect(api.createBout).toHaveBeenCalledWith({
        sessionId: 's1',
        memberAId: 'a',
        memberBId: 'b',
        strip: 2,
        entryMode: 'master',
      })
    );
    expect(api.setAttendance).toHaveBeenCalledWith('s1', 'a', true);
    expect(api.setAttendance).toHaveBeenCalledWith('s1', 'b', true);
    expect(api.startBout).toHaveBeenCalledWith('bt1');
    expect(onLaunched).toHaveBeenCalled();
    expect(await screen.findByText('Combat lancé sur la piste 2')).toBeInTheDocument();
  });

  it('messages : QR inconnu, carte inconnue, piste hors séance', async () => {
    render(<ClubScanModal session={session} onClose={vi.fn()} onLaunched={vi.fn()} />);
    await scan('https://example.org');
    expect(screen.getByRole('status')).toHaveTextContent('QR code non reconnu');
    await scan('BPC1:M:CCCCCCCCCC');
    expect(await screen.findByText('Carte inconnue ou membre archivé')).toBeInTheDocument();
    await scan('BPC1:A:9');
    expect(screen.getByText("Cette piste n'existe pas dans la séance")).toBeInTheDocument();
    expect(api.createBout).not.toHaveBeenCalled();
  });
});
