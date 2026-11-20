/**
 * BellePoule Modern - Messages OPP2 niveau 2 (#1960)
 * OpenPiste Protocol, JSON sur MQTT : https://github.com/OpenPiste/protocols (docs/level2.md).
 * Sujets `openpiste/{piste_id}/{rôle}/{message}` ; champs communs `protocol`, `version`,
 * `seq` (QoS 1), `ts`. Conversion modèle commun (#1829) ↔ messages OPP2.
 * Licensed under GPL-3.0
 */

import type { QoS } from './mqttPacket';
import type {
  PisteDisplay,
  PisteDisplaySide,
  PisteFencerStatus,
  PisteFencingState,
} from '../piste/types';
import { toCyranoWeapon } from '../cyrano/disp';

export const OPP2_PROTOCOL = 'OPP2';
export const OPP2_VERSION = '1.0';
export const OPP2_ROOT = 'openpiste';

export type Opp2Role = 'apparatus' | 'software' | 'remote' | 'var' | 'scoresheet';
const ROLES: readonly string[] = ['apparatus', 'software', 'remote', 'var', 'scoresheet'];

export interface Opp2Topic {
  piste: string;
  role: Opp2Role;
  message: string;
}

/** Identifiant de piste utilisable dans un sujet (un seul niveau, sans joker). */
export const isValidOpp2Piste = (piste: string): boolean => /^[^/+#\0\s]{1,32}$/.test(piste);

export function opp2Topic(piste: string, role: Opp2Role, message: string): string {
  return `${OPP2_ROOT}/${piste}/${role}/${message}`;
}

/** Sujet OPP2 → piste, rôle, message ; null hors espace `openpiste/`. */
export function parseOpp2Topic(topic: string): Opp2Topic | null {
  const parts = topic.split('/');
  if (parts.length !== 4 || parts[0] !== OPP2_ROOT) return null;
  const [, piste, role, message] = parts;
  if (!piste || !message || !ROLES.includes(role)) return null;
  return { piste, role: role as Opp2Role, message };
}

/** QoS et retenue des messages publiés par le logiciel (spéc. § 6). */
export const SOFTWARE_PUBLISH: Record<string, { qos: QoS; retain: boolean }> = {
  connection: { qos: 1, retain: true },
  fencers: { qos: 1, retain: false },
  match: { qos: 1, retain: false },
  score: { qos: 1, retain: false },
  clock: { qos: 1, retain: false },
  control: { qos: 1, retain: false },
  record: { qos: 1, retain: true },
};

export const OPP2_STATES: Record<string, PisteFencingState> = {
  F: 'fencing',
  H: 'halt',
  P: 'pause',
  W: 'waiting',
  E: 'ending',
};

/** Statut d'un tireur (`apparatus/score`) ; `DNS` (absent) traité comme un abandon. */
export const OPP2_STATUSES: Record<string, PisteFencerStatus> = {
  U: 'normal',
  V: 'victory',
  D: 'defeat',
  A: 'abandon',
  E: 'exclusion',
  DNS: 'abandon',
};

/** Message reçu : objet JSON ; null si illisible. */
export function parseOpp2Payload(payload: Buffer): Record<string, unknown> | null {
  if (payload.length === 0 || payload.length > 64 * 1024) return null;
  try {
    const v: unknown = JSON.parse(payload.toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const asObject = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
export const asInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
export const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Chrono `M:SS` ou `M:SS.cc` → secondes. */
export function parseOpp2Time(value: unknown): number | undefined {
  const m = /^(\d{1,3}):(\d{2})(?:\.(\d{1,2}))?$/.exec(typeof value === 'string' ? value : '');
  if (!m || Number(m[2]) > 59) return undefined;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(2, '0')) / 100 : 0);
}

/** Secondes → `M:SS` (centièmes obligatoires sous 10 s, spéc. § 26.1). */
export function formatOpp2Time(seconds: number): string {
  const total = Math.max(0, seconds);
  let whole = Math.floor(total);
  let cs = Math.round((total - whole) * 100);
  if (cs === 100) {
    whole += 1;
    cs = 0;
  }
  const ss = String(whole % 60).padStart(2, '0');
  const base = `${Math.floor(whole / 60)}:${ss}`;
  return whole < 10 ? `${base}.${String(cs).padStart(2, '0')}` : base;
}

/** En-tête commun d'un message publié par BellePoule. */
export function opp2Header(seq: number | undefined, ts: number): Record<string, unknown> {
  const h: Record<string, unknown> = { protocol: OPP2_PROTOCOL, version: OPP2_VERSION };
  if (seq !== undefined) h.seq = seq;
  h.ts = ts;
  return h;
}

/** Nation : code CIO à 3 lettres seulement (spéc. § 26.1) ; sinon le texte va au club. */
function nationOf(nat: string | undefined): { nation: string; club_abbr?: string } {
  const v = (nat ?? '').trim();
  if (/^[A-Z]{3}$/.test(v)) return { nation: v };
  return v ? { nation: '', club_abbr: v } : { nation: '' };
}

function fencerObject(s: PisteDisplaySide): Record<string, unknown> {
  const name = [s.lastName?.toUpperCase(), s.firstName].filter(Boolean).join(' ');
  return { id: s.id, name, ...nationOf(s.nat) };
}

/** `software/fencers` : tireurs et arbitre. */
export function buildFencersBody(d: PisteDisplay): Record<string, unknown> {
  const body: Record<string, unknown> = {
    left: { fencer: fencerObject(d.left) },
    right: { fencer: fencerObject(d.right) },
  };
  if (d.referee) {
    const referee: Record<string, unknown> = { id: d.referee.id, name: d.referee.name };
    const n = nationOf(d.referee.nat).nation;
    if (n) referee.nation = n;
    body.common = { referee };
  }
  return body;
}

/** `software/fencers` vide : appareil sans match. */
export function buildEmptyFencersBody(): Record<string, unknown> {
  const empty = { fencer: { id: '', name: '', nation: '' } };
  return { left: empty, right: { ...empty } };
}

/** Type de phase OPP2 : poule si le n° de poule est numérique, sinon tableau. */
function phaseType(d: PisteDisplay): string {
  return d.poulTab && /^\d+$/.test(d.poulTab) ? 'pool' : 'DE';
}

/** `software/match` : arme, type, épreuve, phase, poule ou tableau, n° de match, période. */
export function buildMatchBody(
  d: PisteDisplay,
  competition: string | undefined
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    weapon: toCyranoWeapon(d.weapon) ?? '',
    type: d.type === 'team' ? 'T' : 'I',
    competition: competition ?? '',
    phase_type: phaseType(d),
    phase: d.phase !== undefined ? String(d.phase) : '',
    poule: d.poulTab ?? '',
    match: d.match ?? 0,
    round: d.round ?? 1,
  };
  if (d.time && /^\d{1,2}:\d{2}$/.test(d.time)) body.scheduled = d.time;
  return body;
}

const scoreSide = (s: PisteDisplaySide): Record<string, unknown> => ({
  score: s.score ?? 0,
  status: s.status === 'abandon' ? 'A' : s.status === 'exclusion' ? 'E' : 'U',
  yellow_card: (s.yellowCards ?? 0) > 0,
  red_cards: Math.min(9, s.redCards ?? 0),
  black_card: s.status === 'exclusion',
});

/** `software/score` : score et cartons déjà donnés (match repris, correction de la tablette). */
export function buildScoreBody(d: PisteDisplay): Record<string, unknown> {
  return { right: scoreSide(d.right), left: scoreSide(d.left), priority: 'N' };
}

/** `software/clock` : chrono à reprendre, toujours à l'arrêt (spéc. § 11). */
export function buildClockBody(stopwatch: number): Record<string, unknown> {
  return { running: false, time_ms: Math.round(stopwatch * 1000), time: formatOpp2Time(stopwatch) };
}
