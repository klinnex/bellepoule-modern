/**
 * BellePoule Modern - Mode Club (#1872) : plan de cours d'une séance (exercices,
 * durées, consignes). Normalisation des données reçues du renderer, durée totale.
 * Licensed under GPL-3.0
 */
import type { ClubPlanItem, ClubSessionFeedback } from '../types/club';

export const MAX_PLAN_ITEMS = 50;
export const MAX_NOTE_LENGTH = 5000;

/** Texte long (consignes, objectifs, notes) : chevrons retirés, longueur bornée, vide → undefined */
export function cleanLongText(v: unknown, max = MAX_NOTE_LENGTH): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[<>]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  return t || undefined;
}

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Plan valide : 50 exercices max, titre requis, durée 0..600 min */
export function normalizePlan(raw: unknown): ClubPlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ClubPlanItem[] = [];
  for (const it of raw.slice(0, MAX_PLAN_ITEMS)) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const title = cleanLongText(o.title, 120);
    if (!title) continue;
    const minutes = Math.min(Math.max(Math.round(Number(o.minutes) || 0), 0), 600);
    const item: ClubPlanItem = {
      id: typeof o.id === 'string' && /^[\w-]{1,40}$/.test(o.id) ? o.id : newId(),
      title: title.replace(/\n/g, ' '),
      minutes,
    };
    const details = cleanLongText(o.details, 2000);
    if (details) item.details = details;
    if (o.done === true) item.done = true;
    out.push(item);
  }
  return out;
}

/** Durée totale prévue (minutes) */
export function planDuration(plan: readonly ClubPlanItem[]): number {
  return plan.reduce((n, it) => n + (it.minutes || 0), 0);
}

/** « 1 h 30 », « 45 min » */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Bilan valide : note entière 1..5, textes bornés ; vide → undefined */
export function normalizeFeedback(raw: unknown): ClubSessionFeedback | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const fb: ClubSessionFeedback = {};
  const rating = Math.round(Number(o.rating));
  if (rating >= 1 && rating <= 5) fb.rating = rating;
  const wentWell = cleanLongText(o.wentWell, 2000);
  if (wentWell) fb.wentWell = wentWell;
  const toImprove = cleanLongText(o.toImprove, 2000);
  if (toImprove) fb.toImprove = toImprove;
  return Object.keys(fb).length > 0 ? fb : undefined;
}
