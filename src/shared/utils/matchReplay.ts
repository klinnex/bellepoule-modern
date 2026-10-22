/**
 * Replay d'un match à partir de son journal d'audit (#1074) : une « image »
 * par événement, avec le score et les cartons à cet instant.
 *
 * Score : les score_change (valeurs absolues saisies par l'arbitre) font foi.
 * Avec au plus un score_change (score final seul : journal Sabre Laser par
 * touches, anciens matchs de tableau), le score est reconstitué en cumulant
 * touches et sorties d'arène ; le score_change recale alors la valeur.
 */
import type { MatchEventEntry } from '../types';

export interface ReplayCard {
  type: string;
  reason: string | null;
}

export interface ReplayFrame {
  entry: MatchEventEntry;
  /** Temps écoulé depuis le premier événement (ms). */
  offsetMs: number;
  scoreA: number;
  scoreB: number;
  cardsA: ReplayCard[];
  cardsB: ReplayCard[];
}

const other = (side: 'A' | 'B'): 'A' | 'B' => (side === 'A' ? 'B' : 'A');

export function buildMatchReplay(entries: MatchEventEntry[]): ReplayFrame[] {
  const sorted = [...entries].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id)
  );
  if (sorted.length === 0) return [];
  const hasPointEvents = sorted.some(e => e.eventType === 'touch' || e.eventType === 'arena_exit');
  const useScoreChanges =
    !hasPointEvents || sorted.filter(e => e.eventType === 'score_change').length > 1;
  const start = Date.parse(sorted[0].timestamp);

  const score = { A: 0, B: 0 };
  const cards: Record<'A' | 'B', ReplayCard[]> = { A: [], B: [] };
  const frames: ReplayFrame[] = [];

  for (const e of sorted) {
    const side = e.fencerSide;
    switch (e.eventType) {
      case 'score_change':
        score.A = e.newScoreA?.value ?? score.A;
        score.B = e.newScoreB?.value ?? score.B;
        break;
      case 'touch':
        if (!useScoreChanges && side) score[side] += e.points ?? 0;
        break;
      case 'arena_exit':
        // Points accordés à l'adversaire du tireur sorti
        if (!useScoreChanges && side) score[other(side)] += e.points ?? 0;
        break;
      case 'card':
        if (side) cards[side] = [...cards[side], { type: e.cardType ?? '', reason: e.cardReason }];
        break;
    }
    frames.push({
      entry: e,
      offsetMs: Date.parse(e.timestamp) - start,
      scoreA: score.A,
      scoreB: score.B,
      cardsA: cards.A,
      cardsB: cards.B,
    });
  }
  return frames;
}

/** mm:ss */
export function formatReplayOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
