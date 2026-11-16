/**
 * BellePoule Modern - Export PDF des données d'une personne (droit d'accès RGPD, #1882)
 * HTML imprimé en PDF par le main (file.printHtmlToPDF). Toute valeur est échappée.
 * Le détail exhaustif (toutes les tables) reste dans l'export JSON.
 * Licensed under GPL-3.0
 */
import type { PersonalDataExport } from '../types/privacy';
import { escHtml } from './pdfExport/bookToc';

export interface PersonalDataLabels {
  heading: string;
  generated: string;
  identity: string;
  competitions: string;
  club: string;
  matches: string;
  attendance: string;
  bouts: string;
  raw: string;
}

type Row = Record<string, unknown>;

/** Champs d'identité affichés (photo et signatures exclues : listées dans le JSON) */
const IDENTITY_FIELDS = [
  'last_name',
  'first_name',
  'birth_date',
  'birth_year',
  'gender',
  'nationality',
  'club',
  'region',
  'department',
  'license',
  'ranking',
  'handedness',
  'laterality',
  'category',
  'notes',
];

const text = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return escHtml(JSON.stringify(v));
  return escHtml(String(v));
};

const score = (raw: unknown): string => {
  if (typeof raw !== 'string') return text(raw);
  try {
    const s = JSON.parse(raw) as { value?: number | null; isVictory?: boolean };
    return `${s.isVictory ? 'V' : ''}${s.value ?? ''}` || '—';
  } catch {
    return text(raw);
  }
};

const table = (headers: string[], rows: string[][]): string =>
  rows.length === 0
    ? ''
    : `<table><thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows
        .map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;

const identityTable = (row: Row): string =>
  table(
    ['', ''],
    IDENTITY_FIELDS.filter(f => f in row && row[f] !== null && row[f] !== '').map(f => [
      escHtml(f),
      text(row[f]),
    ])
  ) + (row.photo ? '<p>photo ✓</p>' : '');

const CSS = `body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111}
h1{font-size:16pt;margin:0 0 4pt}h2{font-size:13pt;margin:14pt 0 4pt;border-bottom:1px solid #999}
h3{font-size:11pt;margin:10pt 0 4pt}table{border-collapse:collapse;width:100%;margin:4pt 0}
th,td{border:1px solid #ccc;padding:2pt 4pt;text-align:left;vertical-align:top}
th{background:#eee}.muted{color:#555;font-size:9pt}`;

/** Document HTML complet prêt à imprimer */
export function personalDataHtml(data: PersonalDataExport, labels: PersonalDataLabels): string {
  const parts: string[] = [
    `<h1>${escHtml(labels.heading)}</h1>`,
    `<p class="muted">${escHtml(labels.generated)}</p>`,
  ];
  const firstIdentity = data.competitions[0]?.fencer ?? data.club[0]?.member;
  if (firstIdentity) {
    parts.push(`<h2>${escHtml(labels.identity)}</h2>`, identityTable(firstIdentity));
  }
  if (data.competitions.length) {
    parts.push(`<h2>${escHtml(labels.competitions)}</h2>`);
    for (const c of data.competitions) {
      const comp = c.competition ?? {};
      parts.push(
        `<h3>${text(comp.title)} — ${text(String(comp.date ?? '').slice(0, 10))}${
          comp.location ? ` — ${text(comp.location)}` : ''
        }</h3>`
      );
      const f = c.fencer;
      parts.push(
        table(
          ['ref', 'club', 'status', 'final_ranking'],
          [[text(f.ref), text(f.club), text(f.status), text(f.final_ranking)]]
        )
      );
      const matches = c.related.matches ?? [];
      if (matches.length) {
        parts.push(`<p><strong>${escHtml(labels.matches)}</strong></p>`);
        parts.push(
          table(
            ['#', '', '', ''],
            matches.map(m => {
              const mine = m.fencer_a_id === f.id;
              return [
                text(m.number),
                text(m.opponent_name),
                `${score(mine ? m.score_a : m.score_b)} – ${score(mine ? m.score_b : m.score_a)}`,
                text(m.status),
              ];
            })
          )
        );
      }
      const others = Object.entries(c.related)
        .filter(([k]) => k !== 'matches')
        .map(([k, rows]) => `${escHtml(k)} : ${rows.length}`);
      if (others.length) parts.push(`<p class="muted">${others.join(' · ')}</p>`);
    }
  }
  if (data.club.length) {
    parts.push(`<h2>${escHtml(labels.club)}</h2>`);
    for (const c of data.club) {
      parts.push(`<h3>${text(c.club?.name)}</h3>`, identityTable(c.member));
      if (c.attendance.length) {
        parts.push(
          `<p><strong>${escHtml(labels.attendance)}</strong> : ${c.attendance.length}</p>`
        );
        parts.push(
          table(
            ['', ''],
            c.attendance.map(a => [
              text(String(a.session_date ?? '').slice(0, 10)),
              text(a.feedback),
            ])
          )
        );
      }
      if (c.bouts.length) {
        parts.push(`<p><strong>${escHtml(labels.bouts)}</strong> : ${c.bouts.length}</p>`);
        parts.push(
          table(
            ['', '', ''],
            c.bouts.map(b => {
              const mine = b.member_a_id === c.member.id;
              return [
                text(String(b.date ?? '').slice(0, 10)),
                `${text(mine ? b.score_a : b.score_b)} – ${text(mine ? b.score_b : b.score_a)}`,
                text(b.status),
              ];
            })
          )
        );
      }
    }
  }
  parts.push(`<p class="muted">${escHtml(labels.raw)}</p>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${parts.join(
    ''
  )}</body></html>`;
}
