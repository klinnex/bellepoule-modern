/**
 * Contrat d'API unique (#1981) : une opération déclarée est servie en IPC et en MCP, avec la
 * même validation et la même erreur ; abonnements ; outils MCP générés.
 */
import { describe, it, expect, vi } from 'vitest';
import { FencerStatus, type Fencer } from '../../../shared/types';
import { contract } from '../../../shared/api/contract';
import { ApiError } from '../../../shared/api/client';
import { invoke, subscribe } from './engine';
import { invokeEnvelope } from './ipcAdapter';
import { CONTRACT_MCP_TOOLS } from './mcpAdapter';
import { publishCompetitionEvent } from './events';
import { handleMcpMessage, WRITE_TOOLS } from '../../mcp/mcpServer';
import type { McpWriteDeps } from '../../mcp/mcpWriteTools';
import type { CommandContext } from '../commands/context';

function setup() {
  const fencers = [
    { id: 'f1', ref: 1, status: FencerStatus.NOT_CHECKED_IN },
    { id: 'f2', ref: 2, status: FencerStatus.ABANDONED },
  ] as Fencer[];
  const db = {
    getCompetition: (id: string) => (id === 'c1' ? { id: 'c1', title: 'Open' } : null),
    getFencersByCompetition: () => fencers,
    updateFencer: vi.fn(),
    getCards: vi.fn(() => [{ id: 'k1' }]),
  };
  const notify = vi.fn();
  const emitChange = vi.fn();
  const ctx = { db, emitChange } as unknown as CommandContext;
  const deps = {
    db,
    notify,
    remoteServers: () => [],
    cyranoStatus: () => null,
  } as unknown as McpWriteDeps;
  const mcp = async (name: string, args: Record<string, unknown>) => {
    const r = (await handleMcpMessage(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
      deps,
      '1',
      undefined,
      true
    )) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    return r.result;
  };
  return { db, ctx, notify, emitChange, mcp };
}

describe('contrat d’API (#1981)', () => {
  it('entrée invalide : même erreur en IPC et en MCP', async () => {
    const { ctx, mcp, db } = setup();
    const bad = { competitionId: 'c1', fencers: [], present: 'oui' };
    const ipc = await invokeEnvelope(ctx, 'checkIn', bad);
    expect(ipc.ok).toBe(false);
    if (ipc.ok) return;
    expect(ipc.error.code).toBe('invalid_input');
    expect(ipc.error.message).toContain('fencers');
    expect(ipc.error.message).toContain('present');
    const viaMcp = await mcp('check_in', bad);
    expect(viaMcp.isError).toBe(true);
    expect(viaMcp.content[0].text).toBe(`${ipc.error.message} (invalid_input)`);
    expect(db.updateFencer).not.toHaveBeenCalled();
  });

  it('erreur métier : code du domaine conservé', async () => {
    const { ctx } = setup();
    const r = await invokeEnvelope(ctx, 'checkIn', {
      competitionId: 'zz',
      fencers: ['f1'],
      present: true,
    });
    expect(r).toEqual({
      ok: false,
      error: { code: 'competition_not_found', message: 'Épreuve introuvable : zz' },
    });
  });

  it('opération inconnue ou abonnement appelé en commande : refusés', async () => {
    const { ctx } = setup();
    await expect(invoke(ctx, 'dropDatabase', {})).rejects.toMatchObject({
      code: 'unknown_operation',
    });
    await expect(invoke(ctx, 'onCompetitionEvents', {})).rejects.toBeInstanceOf(ApiError);
    await expect(invoke(ctx, 'toString', {})).rejects.toMatchObject({ code: 'unknown_operation' });
  });

  it('checkIn par IPC : pointe, prévient l’écran ; même résultat par MCP', async () => {
    const { ctx, emitChange, db, mcp, notify } = setup();
    const r = await invokeEnvelope(ctx, 'checkIn', {
      competitionId: 'c1',
      fencers: [1, 'f2', 99],
      present: true,
    });
    expect(r).toMatchObject({
      ok: true,
      data: { dryRun: false, matched: 2, updated: 1, skipped: 1, unknown: [99] },
    });
    expect(db.updateFencer).toHaveBeenCalledWith('f1', { status: FencerStatus.CHECKED_IN });
    expect(emitChange).toHaveBeenCalledWith({ scope: 'fencers', competitionIds: ['c1'] });
    const viaMcp = await mcp('check_in', {
      competitionId: 'c1',
      fencers: [1],
      present: true,
      dryRun: true,
    });
    expect(JSON.parse(viaMcp.content[0].text)).toMatchObject({ dryRun: true, matched: 1 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('requête de cartons : servie en IPC, pas exposée en MCP', async () => {
    const { ctx, db } = setup();
    expect(await invoke(ctx, 'getMatchCards', { matchId: 'm1' })).toEqual([{ id: 'k1' }]);
    expect(db.getCards).toHaveBeenCalledWith('m1');
    expect(CONTRACT_MCP_TOOLS.read.some(t => t.name.includes('card'))).toBe(false);
  });

  it('outils MCP générés pour chaque opération marquée mcp, sans doublon', () => {
    const exposed = Object.values(contract).flatMap(d => ('mcp' in d && d.mcp ? [d.mcp.name] : []));
    const generated = [...CONTRACT_MCP_TOOLS.read, ...CONTRACT_MCP_TOOLS.write].map(t => t.name);
    expect(generated.sort()).toEqual([...exposed].sort());
    const names = WRITE_TOOLS.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    const rec = CONTRACT_MCP_TOOLS.write.find(t => t.name === 'record_score')!;
    expect(rec.inputSchema.required).toEqual(['competitionId', 'matchId', 'scoreA', 'scoreB']);
    expect(rec.inputSchema).not.toHaveProperty('$schema');
  });

  it('abonnement : événements filtrés par épreuve, désabonnement', () => {
    const { ctx } = setup();
    const seen: unknown[] = [];
    const off = subscribe(ctx, 'onCompetitionEvents', { competitionId: 'c1' }, e => seen.push(e));
    publishCompetitionEvent({ type: 'fencers:changed', competitionId: 'c1' });
    publishCompetitionEvent({ type: 'fencers:changed', competitionId: 'c2' });
    off();
    publishCompetitionEvent({ type: 'fencers:changed', competitionId: 'c1' });
    expect(seen).toEqual([{ type: 'fencers:changed', competitionId: 'c1' }]);
    expect(() => subscribe(ctx, 'checkIn', {}, () => {})).toThrow(ApiError);
  });
});

describe('journal par épreuve (#1980)', () => {
  /** Journal en mémoire, même contrat que EventLogRepo */
  function withLog() {
    const base = setup();
    type Ev = {
      competitionId: string;
      revision: number;
      type: string;
      payload: Record<string, unknown>;
      author: string | null;
      source: string;
      at: string;
    };
    const rows: Ev[] = [];
    const eventLog = {
      getRevision: (c: string) => rows.filter(r => r.competitionId === c).length,
      append: (
        c: string,
        evs: Array<{ type: string; payload: Record<string, unknown> }>,
        by: { source: string; author?: string }
      ) => {
        for (const e of evs) {
          rows.push({
            competitionId: c,
            revision: eventLog.getRevision(c) + 1,
            ...e,
            author: by.author ?? null,
            source: by.source,
            at: 'now',
          });
        }
        return eventLog.getRevision(c);
      },
      getSince: (c: string, since = 0, limit = 1000) =>
        rows.filter(r => r.competitionId === c && r.revision > since).slice(0, limit),
      getMatchHistory: (c: string, m: string) =>
        rows.filter(r => r.competitionId === c && r.payload.matchId === m),
    };
    const fencers = base.db.getFencersByCompetition();
    const updateFencer = vi.fn((id: string, patch: Partial<Fencer>) => {
      Object.assign(
        fencers.find(f => f.id === id)!,
        patch
      );
    });
    Object.assign(base.db, { eventLog, updateFencer });
    const ctx = { ...base.ctx, actor: { source: 'screen' } } as CommandContext;
    return { ...base, ctx, rows };
  }

  it('commande : événements au journal (identifiants, source), révision rendue et diffusée', async () => {
    const { ctx, rows } = withLog();
    const seen: unknown[] = [];
    const off = subscribe(ctx, 'onCompetitionEvents', { competitionId: 'c1' }, e => seen.push(e));
    const r = await invoke(ctx, 'checkIn', { competitionId: 'c1', fencers: [1], present: true });
    off();
    expect(r).toMatchObject({ updated: 1, revision: 1 });
    expect(rows).toEqual([
      expect.objectContaining({
        revision: 1,
        type: 'FencerCheckedIn',
        payload: { fencerId: 'f1' },
        source: 'screen',
      }),
    ]);
    expect(seen).toContainEqual({ type: 'journal:appended', competitionId: 'c1', revision: 1 });
  });

  it('dryRun ou rien à faire : ni événement ni révision', async () => {
    const { ctx, rows } = withLog();
    const r = await invoke(ctx, 'checkIn', {
      competitionId: 'c1',
      fencers: [1],
      present: true,
      dryRun: true,
    });
    expect(r).not.toHaveProperty('revision');
    expect(rows).toHaveLength(0);
  });

  it('révision attendue périmée : refus revision_conflict avec les événements manquants', async () => {
    const { ctx, db, rows } = withLog();
    await invoke(ctx, 'checkIn', { competitionId: 'c1', fencers: [1], present: true });
    await invoke(ctx, 'checkIn', { competitionId: 'c1', fencers: [1], present: false });
    expect(rows).toHaveLength(2);
    db.updateFencer.mockClear();
    const env = await invokeEnvelope(ctx, 'checkIn', {
      competitionId: 'c1',
      fencers: [1],
      present: true,
      expectedRevision: 1,
    });
    expect(env.ok).toBe(false);
    if (env.ok) return;
    expect(env.error.code).toBe('revision_conflict');
    expect(env.error.data).toMatchObject({
      revision: 2,
      missing: [{ revision: 2, type: 'FencerCheckedOut' }],
    });
    expect(db.updateFencer).not.toHaveBeenCalled();
    const ok = await invoke(ctx, 'checkIn', {
      competitionId: 'c1',
      fencers: [1],
      present: true,
      expectedRevision: 2,
    });
    expect(ok).toMatchObject({ revision: 3 });
  });

  it('getCompetitionEvents / getMatchHistory : lecture du journal', async () => {
    const { ctx } = withLog();
    await invoke(ctx, 'checkIn', { competitionId: 'c1', fencers: [1], present: true });
    expect(await invoke(ctx, 'getCompetitionEvents', { competitionId: 'c1', since: 0 })).toEqual({
      revision: 1,
      events: [
        {
          revision: 1,
          type: 'FencerCheckedIn',
          payload: { fencerId: 'f1' },
          author: null,
          source: 'screen',
          at: 'now',
        },
      ],
    });
    expect(
      await invoke(ctx, 'getCompetitionEvents', { competitionId: 'c1', since: 1 })
    ).toMatchObject({ events: [] });
    expect(await invoke(ctx, 'getMatchHistory', { competitionId: 'c1', matchId: 'm1' })).toEqual(
      []
    );
    await expect(
      invoke(ctx, 'getCompetitionEvents', { competitionId: 'zz' })
    ).rejects.toMatchObject({ code: 'competition_not_found' });
  });
});
