/**
 * Saisie simplifiée d'un score de poule : analyse du texte tapé dans la case.
 * - « 4 »  : score numérique
 * - « V »  : victoire au score maximum
 * - « W3 » : victoire au score 3, réservée au départage d'une égalité
 */
export type InlineScoreParse =
  | { kind: 'empty' }
  | { kind: 'score'; value: number }
  | { kind: 'victory'; value: number }
  | { kind: 'tieWin'; value: number }
  | { kind: 'invalid' };

export function parseInlineScoreInput(raw: string, maxScore: number): InlineScoreParse {
  const text = raw.trim().toUpperCase();
  if (text === '') return { kind: 'empty' };
  if (/^\d+$/.test(text)) return { kind: 'score', value: parseInt(text, 10) };
  if (text === 'V') {
    return maxScore > 0 ? { kind: 'victory', value: maxScore } : { kind: 'invalid' };
  }
  const w = /^W(\d+)$/.exec(text);
  if (w) return { kind: 'tieWin', value: parseInt(w[1], 10) };
  return { kind: 'invalid' };
}

export interface InlineSubmitInput {
  raw: string;
  maxScore: number;
  tieByVictory: boolean;
  isLaserSabre: boolean;
  key: string;
  rowId: string;
  colId: string;
  inverted: boolean;
  buffer: Record<string, number>;
  /** Score déjà enregistré de la case miroir (match terminé) */
  recordedMirror: number | undefined;
  /** Cases où W a désigné un vainqueur (muté par la fonction) */
  winnerCells: Set<string>;
}

export type InlineSubmitResult =
  | { action: 'skip' }
  | { action: 'error'; msgKey: string; max?: number }
  | { action: 'modal' }
  | { action: 'buffer'; buffer: Record<string, number> }
  | {
      action: 'commit';
      scoreA: number;
      scoreB: number;
      winner?: 'A' | 'B';
      restBuffer: Record<string, number>;
      mirrorKey: string;
    };

/** Décide de la suite d'une validation en saisie simplifiée (score, V, W+chiffre). */
export function resolveInlineSubmit(p: InlineSubmitInput): InlineSubmitResult {
  const parsed = parseInlineScoreInput(p.raw, p.maxScore);
  if (parsed.kind === 'empty') return { action: 'skip' };
  if (parsed.kind === 'invalid') return { action: 'error', msgKey: 'poolView.inline_invalid' };
  if (parsed.kind === 'tieWin' && !p.tieByVictory) {
    return { action: 'error', msgKey: 'poolView.inline_win_tie_only' };
  }
  const score = parsed.value;
  const mirrorKey = `${p.colId}-${p.rowId}`;
  const buffer = { ...p.buffer, [p.key]: score };
  const mirrorScore = buffer[mirrorKey] ?? p.recordedMirror;

  if (parsed.kind === 'tieWin') p.winnerCells.add(p.key);
  else p.winnerCells.delete(p.key);

  if (mirrorScore === undefined) return { action: 'buffer', buffer };

  const scoreA = p.inverted ? mirrorScore : score;
  const scoreB = p.inverted ? score : mirrorScore;
  if (p.maxScore > 0 && (scoreA > p.maxScore || scoreB > p.maxScore)) {
    return { action: 'error', msgKey: 'poolView.max_score', max: p.maxScore };
  }
  const tie = scoreA === scoreB;
  if (!tie && (parsed.kind === 'tieWin' || p.winnerCells.has(mirrorKey))) {
    p.winnerCells.delete(p.key);
    return { action: 'error', msgKey: 'poolView.inline_win_tie_only' };
  }
  let winner: 'A' | 'B' | undefined;
  if (tie) {
    if (p.winnerCells.has(p.key)) winner = p.inverted ? 'B' : 'A';
    else if (p.winnerCells.has(mirrorKey)) winner = p.inverted ? 'A' : 'B';
  }
  if (tie && !p.isLaserSabre && !winner) {
    // L'égalité se tranche dans la fenêtre de saisie (V ou prioritaire)
    return p.tieByVictory
      ? { action: 'modal' }
      : { action: 'error', msgKey: 'poolView.draw_impossible' };
  }
  p.winnerCells.delete(p.key);
  p.winnerCells.delete(mirrorKey);
  const { [p.key]: _a, [mirrorKey]: _b, ...restBuffer } = buffer;
  return { action: 'commit', scoreA, scoreB, winner, restBuffer, mirrorKey };
}
