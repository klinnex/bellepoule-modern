/**
 * BellePoule Modern - Codec du protocole Cyrano EFP1 / EFP1.1 (#1720)
 * Trame texte : `|EFP1.1|COM|piste|compé|…|%|<tireur droit>|%|<tireur gauche>|%|`.
 * 3 zones séparées par `%`, champs séparés par `|`. Spécification :
 * https://superfencingsystem.com/CyranoProtocol-1-1.pdf (11 octobre 2019).
 * Licensed under GPL-3.0
 */

export type CyranoProtocol = 'EFP1' | 'EFP1.1';
export type CyranoCommand = 'HELLO' | 'DISP' | 'ACK' | 'NAK' | 'INFO' | 'NEXT' | 'PREV';
/** F Fencing, H Halt, P Pause, W Waiting, E Ending */
export type CyranoState = 'F' | 'H' | 'P' | 'W' | 'E';
/** U Undefined, V Victoire, D Défaite, A Abandon, E Exclusion */
export type CyranoFencerStatus = 'U' | 'V' | 'D' | 'A' | 'E';
export type CyranoPriority = 'N' | 'R' | 'L';
export type CyranoWeapon = 'F' | 'E' | 'S';
export type CyranoType = 'I' | 'T';

export const CYRANO_DEFAULT_PORT = 50100;
export const CYRANO_PROTOCOLS: readonly CyranoProtocol[] = ['EFP1', 'EFP1.1'];
export const CYRANO_COMMANDS: readonly CyranoCommand[] = [
  'HELLO',
  'DISP',
  'ACK',
  'NAK',
  'INFO',
  'NEXT',
  'PREV',
];

export interface CyranoFencer {
  id?: string;
  name?: string;
  nat?: string;
  score?: number;
  status?: CyranoFencerStatus;
  yellowCards?: number;
  redCards?: number;
  light?: boolean;
  whiteLight?: boolean;
  medical?: number;
  reserve?: boolean;
  /** 0 aucun, 1 P-jaune, 2 un P-rouge, 3 deux P-rouges, 4 un P-noir, 5 deux P-noirs (EFP1.1) */
  pCard?: number;
}

export interface CyranoMessage {
  protocol: CyranoProtocol;
  command: CyranoCommand;
  piste: string;
  compe: string;
  phase?: string;
  poulTab?: string;
  match?: string;
  round?: string;
  time?: string;
  stopwatch?: string;
  type?: CyranoType;
  weapon?: CyranoWeapon;
  priority?: CyranoPriority;
  state?: CyranoState;
  refId?: string;
  refName?: string;
  refNat?: string;
  right?: CyranoFencer;
  left?: CyranoFencer;
}

/** Longueurs maximales de la spécification (zone générale, champs 1 à 17). */
const GENERAL_MAX = [6, 6, 8, 8, 2, 8, 3, 2, 5, 8, 1, 1, 1, 1, 8, 20, 3] as const;
/** Longueurs maximales d'une zone tireur (R1…R12 / L1…L12). */
const FENCER_MAX = [8, 20, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1] as const;
const GENERAL_KEYS = [
  'protocol',
  'command',
  'piste',
  'compe',
  'phase',
  'poulTab',
  'match',
  'round',
  'time',
  'stopwatch',
  'type',
  'weapon',
  'priority',
  'state',
  'refId',
  'refName',
  'refNat',
] as const;

/** Taille d'une trame au-delà de laquelle on la rejette (spec : ~210 caractères). */
export const CYRANO_MAX_FRAME = 512;

/**
 * Nettoie une valeur texte : retire les séparateurs `|` et `%` (le protocole n'a pas
 * d'échappement), les caractères de contrôle, puis tronque à la longueur maximale.
 */
export function sanitizeField(value: string | number | undefined | null, max: number): string {
  if (value === undefined || value === null) return '';
  let out = '';
  for (const ch of String(value)) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '|' || ch === '%' || code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out.trim().slice(0, max);
}

const isOneOf = <T extends string>(v: string, allowed: readonly T[]): v is T =>
  (allowed as readonly string[]).includes(v);

function optStr(v: string | undefined): string | undefined {
  return v === undefined || v === '' ? undefined : v;
}

function optInt(v: string | undefined): number | undefined {
  if (v === undefined || v === '' || !/^\d{1,3}$/.test(v)) return undefined;
  return Number(v);
}

function optBool(v: string | undefined): boolean | undefined {
  if (v === '1') return true;
  if (v === '0') return false;
  return undefined;
}

function optEnum<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v !== undefined && isOneOf(v, allowed) ? v : undefined;
}

function parseFencer(fields: string[]): CyranoFencer | undefined {
  if (fields.every(f => f === '')) return undefined;
  const reserve = fields[10];
  const f: CyranoFencer = {
    id: optStr(fields[0]),
    name: optStr(fields[1]),
    nat: optStr(fields[2]),
    score: optInt(fields[3]),
    status: optEnum(fields[4], ['U', 'V', 'D', 'A', 'E'] as const),
    yellowCards: optInt(fields[5]),
    redCards: optInt(fields[6]),
    light: optBool(fields[7]),
    whiteLight: optBool(fields[8]),
    medical: optInt(fields[9]),
    reserve: reserve === 'R' ? true : reserve === 'N' ? false : undefined,
    pCard: optInt(fields[11]),
  };
  for (const k of Object.keys(f) as (keyof CyranoFencer)[]) {
    if (f[k] === undefined) delete f[k];
  }
  return f;
}

/**
 * Découpe une trame Cyrano. Retourne `null` si la trame n'est pas exploitable
 * (protocole ou commande inconnus, taille excessive). Tolérant : zones et champs
 * de fin omis, espaces parasites, retour à la ligne final.
 */
export function parseCyrano(raw: string): CyranoMessage | null {
  if (typeof raw !== 'string' || raw.length > CYRANO_MAX_FRAME) return null;
  const text = raw.replace(/[\r\n]+/g, '').trim();
  if (!text.startsWith('|')) return null;
  const zones = text.split('%');
  const split = (zone: string | undefined): string[] => {
    if (zone === undefined) return [];
    let z = zone;
    if (z.startsWith('|')) z = z.slice(1);
    if (z.endsWith('|')) z = z.slice(0, -1);
    return z === '' ? [] : z.split('|').map(s => s.trim());
  };
  const g = split(zones[0]);
  const protocol = g[0];
  const command = g[1];
  if (!protocol || !isOneOf(protocol, CYRANO_PROTOCOLS)) return null;
  if (!command || !isOneOf(command, CYRANO_COMMANDS)) return null;

  const msg: CyranoMessage = {
    protocol,
    command,
    piste: g[2] ?? '',
    compe: g[3] ?? '',
    phase: optStr(g[4]),
    poulTab: optStr(g[5]),
    match: optStr(g[6]),
    round: optStr(g[7]),
    time: optStr(g[8]),
    stopwatch: optStr(g[9]),
    type: optEnum(g[10], ['I', 'T'] as const),
    weapon: optEnum(g[11], ['F', 'E', 'S'] as const),
    priority: optEnum(g[12], ['N', 'R', 'L'] as const),
    state: optEnum(g[13], ['F', 'H', 'P', 'W', 'E'] as const),
    refId: optStr(g[14]),
    refName: optStr(g[15]),
    refNat: optStr(g[16]),
    right: parseFencer(split(zones[1])),
    left: parseFencer(split(zones[2])),
  };
  for (const k of Object.keys(msg) as (keyof CyranoMessage)[]) {
    if (msg[k] === undefined) delete msg[k];
  }
  return msg;
}

const num = (v: number | undefined, max: number): string =>
  v === undefined || !Number.isFinite(v) ? '' : sanitizeField(Math.max(0, Math.trunc(v)), max);
const bool = (v: boolean | undefined): string => (v === undefined ? '' : v ? '1' : '0');

function fencerFields(f: CyranoFencer | undefined, protocol: CyranoProtocol): string[] {
  if (!f) return [];
  const fields = [
    sanitizeField(f.id, FENCER_MAX[0]),
    sanitizeField(f.name, FENCER_MAX[1]),
    sanitizeField(f.nat, FENCER_MAX[2]),
    num(f.score, FENCER_MAX[3]),
    f.status ?? '',
    num(f.yellowCards, 1),
    num(f.redCards, 1),
    bool(f.light),
    bool(f.whiteLight),
    num(f.medical, 1),
    f.reserve === undefined ? '' : f.reserve ? 'R' : 'N',
  ];
  if (protocol === 'EFP1.1') fields.push(num(f.pCard, 1));
  return fields;
}

/** Retire les champs vides en fin de zone (autorisé par la spécification). */
function trimTrailing(fields: string[]): string[] {
  let end = fields.length;
  while (end > 0 && fields[end - 1] === '') end--;
  return fields.slice(0, end);
}

const zone = (fields: string[]): string => (fields.length ? `|${fields.join('|')}|` : '|');

/**
 * Construit une trame Cyrano. Les champs sont nettoyés et tronqués aux longueurs
 * maximales ; les champs vides de fin de zone sont omis. Les zones tireurs sont
 * omises si les deux sont absentes (HELLO, NEXT, PREV, ACK, NAK).
 */
export function buildCyrano(msg: CyranoMessage): string {
  const protocol = msg.protocol;
  const general = GENERAL_KEYS.map((key, i) => {
    const value = msg[key];
    return sanitizeField(typeof value === 'string' ? value : undefined, GENERAL_MAX[i]);
  });
  // Champs obligatoires (**) toujours présents, même vides
  const g = trimTrailing(general);
  while (g.length < 4) g.push(general[g.length]);
  const right = trimTrailing(fencerFields(msg.right, protocol));
  const left = trimTrailing(fencerFields(msg.left, protocol));
  let frame = `${zone(g)}%`;
  if (right.length || left.length) {
    frame += `${zone(right)}%`;
    if (left.length) frame += `${zone(left)}%`;
  }
  return frame + '|';
}
