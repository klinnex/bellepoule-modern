/**
 * Saisie simplifiée d'un score de poule : analyse du texte tapé dans la case.
 * - « 4 »  : score numérique
 * - « V »  : victoire au score maximum
 * - « W3 » : victoire au score 3, réservée au départage d'une égalité
 * Règlement (o.17) : pas d'égalité au score max (5-5) hors Sabre Laser ; au Sabre Laser
 * (match au temps), pas de « V » et un vainqueur obligatoire en cas d'égalité.
 */
import { validatePoolScore } from './poolOrchestration';

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
  if (parsed.kind === 'victory' && p.isLaserSabre) {
    return { action: 'error', msgKey: 'poolView.inline_v_laser' };
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
  // Règle unique écran / moteur / MCP (#1979, lot 4) : validatePoolScore
  const error = validatePoolScore({
    scoreA,
    scoreB,
    maxScore: p.maxScore,
    winner,
    isLaserSabre: p.isLaserSabre,
    tieByVictory: p.tieByVictory,
  });
  if (error === 'score_above_max') {
    return { action: 'error', msgKey: 'poolView.max_score', max: p.maxScore };
  }
  if (error === 'tie_at_max') {
    p.winnerCells.delete(p.key);
    return { action: 'error', msgKey: 'poolView.tie_at_max', max: p.maxScore };
  }
  if (error === 'draw_needs_winner' || error === 'draw_not_allowed') {
    // L'égalité se tranche dans la fenêtre de saisie (V ou prioritaire) ; jamais de match nul
    if (p.tieByVictory) return { action: 'modal' };
    return {
      action: 'error',
      msgKey: p.isLaserSabre ? 'poolView.draw_laser' : 'poolView.draw_impossible',
    };
  }
  if (error) return { action: 'error', msgKey: 'poolView.inline_invalid' };
  p.winnerCells.delete(p.key);
  p.winnerCells.delete(mirrorKey);
  const { [p.key]: _a, [mirrorKey]: _b, ...restBuffer } = buffer;
  return { action: 'commit', scoreA, scoreB, winner, restBuffer, mirrorKey };
}

/**
 * Saisie sans ambiguïté, validable sans Tab : « V », ou nombre (seul ou après W) auquel
 * aucun chiffre ne peut plus s'ajouter sans dépasser le score max. Sans score max : jamais.
 */
export function isInlineScoreComplete(
  raw: string,
  maxScore: number,
  isLaserSabre: boolean
): boolean {
  const text = raw.trim().toUpperCase();
  if (text === 'V') return !isLaserSabre && maxScore > 0;
  const m = /^W?(\d+)$/.exec(text);
  if (!m || maxScore <= 0) return false;
  const value = parseInt(m[1], 10);
  return m[1] === '0' || value * 10 > maxScore;
}

/**
 * Texte proposé dans une case déjà enregistrée, relu par `parseInlineScoreInput` :
 * « V » pour une victoire au score max, « W3 » pour une victoire à égalité, sinon le score.
 */
export function inlineCellText(p: {
  value: number;
  isVictory: boolean;
  /** Score de l'adversaire */
  opponent: number;
  maxScore: number;
  isLaserSabre: boolean;
}): string {
  if (p.isVictory && p.value === p.opponent) return `W${p.value}`;
  if (p.isVictory && !p.isLaserSabre && p.maxScore > 0 && p.value === p.maxScore) return 'V';
  return String(p.value);
}

/** Affichage d'une victoire dans la matrice : « V » seul au score max, sinon « V » + score */
export function victoryLabel(value: number, maxScore: number, isLaserSabre: boolean): string {
  return !isLaserSabre && maxScore > 0 && value === maxScore ? 'V' : `V${value}`;
}
