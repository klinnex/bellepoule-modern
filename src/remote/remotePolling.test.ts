import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// #1345 : pages résultats / journal de piste : polling suspendu onglet masqué + backoff sur erreur
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

type Poll = { now: () => Promise<void>; stop: () => void };
type BpPoll = (task: () => unknown, opts: { base: number; max: number; doc: unknown }) => Poll;

function loadBpPoll(): BpPoll {
  const root: Record<string, unknown> = { setTimeout, clearTimeout };
  new Function('window', read('common.js'))(root);
  return root.bpPoll as BpPoll;
}

class FakeDoc {
  hidden = false;
  private listeners: Array<() => void> = [];
  addEventListener(_t: string, fn: () => void) {
    this.listeners.push(fn);
  }
  removeEventListener(_t: string, fn: () => void) {
    this.listeners = this.listeners.filter(l => l !== fn);
  }
  setHidden(h: boolean) {
    this.hidden = h;
    this.listeners.forEach(l => l());
  }
}

describe('bpPoll (#1345)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cadence nominale tant que tout réussit', async () => {
    const task = vi.fn().mockResolvedValue(true);
    const poll = loadBpPoll()(task, { base: 5000, max: 30000, doc: new FakeDoc() });
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(3);
    poll.stop();
  });

  it('0 requête onglet masqué, reprise immédiate à la réapparition', async () => {
    const doc = new FakeDoc();
    const task = vi.fn().mockResolvedValue(true);
    const poll = loadBpPoll()(task, { base: 5000, max: 30000, doc });
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    doc.setHidden(true);
    await vi.advanceTimersByTimeAsync(120000);
    expect(task).toHaveBeenCalledTimes(1);
    doc.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
    poll.stop();
  });

  it('démarré onglet masqué : aucune requête avant visibilité', async () => {
    const doc = new FakeDoc();
    doc.hidden = true;
    const task = vi.fn().mockResolvedValue(true);
    const poll = loadBpPoll()(task, { base: 5000, max: 30000, doc });
    await vi.advanceTimersByTimeAsync(60000);
    expect(task).not.toHaveBeenCalled();
    doc.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    poll.stop();
  });

  it('backoff exponentiel plafonné après erreur, retour à la cadence au succès', async () => {
    const results = [false, false, false, false, true, true];
    const task = vi.fn(() => Promise.resolve(results.shift() ?? true));
    const poll = loadBpPoll()(task, { base: 5000, max: 30000, doc: new FakeDoc() });
    await vi.advanceTimersByTimeAsync(0); // échec 1 -> attente 10 s
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // échec 2 -> 20 s
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20000); // échec 3 -> 30 s (plafond)
    expect(task).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30000); // échec 4 -> 30 s
    expect(task).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30000); // succès -> 5 s
    expect(task).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(6);
    poll.stop();
  });

  it('une exception compte comme un échec', async () => {
    const task = vi.fn().mockRejectedValue(new Error('réseau'));
    const poll = loadBpPoll()(task, { base: 1000, max: 8000, doc: new FakeDoc() });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    poll.stop();
  });
});

describe('pages résultats / journal : bpPoll, plus de setInterval (#1345)', () => {
  it.each(['results.html', 'journal.html'])('%s', page => {
    const html = read(page);
    expect(html).not.toMatch(/setInterval\(/);
    expect(html).toContain('window.bpPoll(');
    expect(html).toContain('return false;');
  });
  it('paramètres de cadence', () => {
    expect(read('journal.html')).toContain('{ base: 5000, max: 30000 }');
    expect(read('results.html')).toContain('{ base: 30000, max: 120000 }');
  });
});
