/**
 * BellePoule Modern - Mode Club (#1872) : import de membres depuis un fichier de tireurs
 * (FFE .fff / CSV / TXT / XML). Conversion + dédoublonnage par licence, sinon nom + prénom.
 * Licensed under GPL-3.0
 */
import type { Fencer } from '../types';
import type { ClubMember, ClubMemberInput } from '../types/club';

export interface ClubImportPlan {
  create: ClubMemberInput[];
  /** Membres existants complétés (licence, sexe, année de naissance manquants) */
  update: Array<{ id: string; data: Partial<ClubMemberInput> }>;
  /** Déjà présents, rien à compléter (ou doublons dans le fichier) */
  skipped: number;
}

export interface ClubImportResult {
  created: number;
  updated: number;
  skipped: number;
}

const fold = (s: string | undefined): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

const licenseKey = (l: string | undefined): string => fold(l);
const nameKey = (m: { firstName?: string; lastName?: string }): string =>
  `${fold(m.lastName)}|${fold(m.firstName)}`;

function birthYearOf(d: unknown): number | undefined {
  const date = d instanceof Date ? d : typeof d === 'string' && d ? new Date(d) : null;
  const y = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : NaN;
  return y >= 1900 && y <= 2100 ? y : undefined;
}

/** Tireurs du fichier → membres (lignes sans nom ignorées) */
export function fencersToClubMembers(fencers: readonly Partial<Fencer>[]): ClubMemberInput[] {
  const out: ClubMemberInput[] = [];
  for (const f of fencers) {
    const lastName = (f.lastName ?? '').trim();
    const firstName = (f.firstName ?? '').trim();
    if (!lastName && !firstName) continue;
    const m: ClubMemberInput = { lastName, firstName };
    if (f.license?.trim()) m.license = f.license.trim();
    if (f.gender === 'M' || f.gender === 'F') m.gender = f.gender;
    const by = birthYearOf(f.birthDate);
    if (by) m.birthYear = by;
    out.push(m);
  }
  return out;
}

/** Sort d'une ligne importée : nouveau membre, membre à compléter, déjà présent / doublon */
export type ClubImportRowStatus =
  | { kind: 'new' }
  | { kind: 'update'; id: string; data: Partial<ClubMemberInput> }
  | { kind: 'present'; id: string }
  | { kind: 'duplicate' };

/** Classe chaque ligne (même ordre) : licence d'abord, sinon nom + prénom */
export function classifyClubImport(
  existing: readonly ClubMember[],
  incoming: readonly ClubMemberInput[]
): ClubImportRowStatus[] {
  const byLicense = new Map<string, ClubMember>();
  const byName = new Map<string, ClubMember>();
  for (const m of existing) {
    if (licenseKey(m.license)) byLicense.set(licenseKey(m.license), m);
    byName.set(nameKey(m), m);
  }
  const seen = new Set<string>();
  return incoming.map((m): ClubImportRowStatus => {
    const lk = licenseKey(m.license);
    const nk = nameKey(m);
    const fileKey = lk ? `L:${lk}` : `N:${nk}`;
    if (seen.has(fileKey) || seen.has(`N:${nk}`)) return { kind: 'duplicate' };
    seen.add(fileKey);
    seen.add(`N:${nk}`);
    const match = (lk && byLicense.get(lk)) || byName.get(nk);
    if (!match) return { kind: 'new' };
    const data: Partial<ClubMemberInput> = {};
    if (m.license && !match.license) data.license = m.license;
    if (m.gender && !match.gender) data.gender = m.gender;
    if (m.birthYear && !match.birthYear) data.birthYear = m.birthYear;
    return Object.keys(data).length > 0
      ? { kind: 'update', id: match.id, data }
      : { kind: 'present', id: match.id };
  });
}

/** Répartit les lignes importées : nouveaux membres, membres à compléter, doublons */
export function planClubImport(
  existing: readonly ClubMember[],
  incoming: readonly ClubMemberInput[]
): ClubImportPlan {
  const plan: ClubImportPlan = { create: [], update: [], skipped: 0 };
  classifyClubImport(existing, incoming).forEach((st, i) => {
    if (st.kind === 'new') plan.create.push(incoming[i]);
    else if (st.kind === 'update') plan.update.push({ id: st.id, data: st.data });
    else plan.skipped++;
  });
  return plan;
}
