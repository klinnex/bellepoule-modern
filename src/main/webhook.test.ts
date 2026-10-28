import { describe, it, expect, vi } from 'vitest';
import { buildWebhookBody, postWebhook } from './webhook';

describe('webhook (#1269)', () => {
  it('ajoute content (Discord) à partir de text (Slack) et conserve les champs', () => {
    const body = buildWebhookBody({ event: 'match_finished', text: 'Match terminé' });
    expect(body).toMatchObject({
      event: 'match_finished',
      content: 'Match terminé',
      text: 'Match terminé',
    });
  });

  it('ajoute text à partir de content', () => {
    expect(buildWebhookBody({ content: 'Salut' })).toMatchObject({
      text: 'Salut',
      content: 'Salut',
    });
  });

  it('message par défaut si le corps est sans texte', () => {
    expect(buildWebhookBody({ event: 'x' }).content).toBe('BellePoule Modern');
  });

  it('refuse une URL non sécurisée sans requête', async () => {
    const f = vi.fn();
    expect(await postWebhook('http://exemple.fr/x', { text: 'a' }, f as never)).toEqual({
      success: false,
      error: 'invalid_url',
    });
    expect(f).not.toHaveBeenCalled();
  });

  it('succès sur 204 (Discord) et envoie le JSON avec content', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const r = await postWebhook(
      'https://discord.com/api/webhooks/1/abc',
      { text: 'Test' },
      f as never
    );
    expect(r).toEqual({ success: true, status: 204 });
    expect(JSON.parse(f.mock.calls[0][1].body).content).toBe('Test');
  });

  it('échec explicite sur 4xx et sur erreur réseau', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    expect(
      await postWebhook('https://discord.com/api/webhooks/1/abc', { text: 'a' }, bad as never)
    ).toEqual({
      success: false,
      status: 400,
      error: 'http_400',
    });
    const down = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    const r = await postWebhook(
      'https://discord.com/api/webhooks/1/abc',
      { text: 'a' },
      down as never
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('ENOTFOUND');
  });
});
