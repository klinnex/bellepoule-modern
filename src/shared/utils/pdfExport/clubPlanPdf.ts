/**
 * BellePoule Modern - Mode Club (#1872) : plan de cours d'une séance, PDF ou impression.
 * En-tête club (logo, nom), date, arme, objectifs ; déroulé chronologique (horaires
 * cumulés, durées, consignes, case à cocher) ; zone de notes à remplir à la main.
 * Licensed under GPL-3.0
 */
import type { ClubSession } from '../../types/club';
import { formatMinutes, planDuration } from '../clubPlan';
import { escHtml as esc } from './bookToc';
import { BASE_CSS, pdfLang, pdfT, printHTML, savePDF } from './core';

const IMG_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export interface ClubPlanPdfOptions {
  clubName: string;
  logo?: string;
  /** Libellé traduit de l'arme (ex. « Épée ») */
  weaponLabel?: string;
  /** Heure de début (HH:MM) : horaires réels au lieu de durées écoulées */
  startTime?: string;
}

/** « 0:15 » (écoulé) ou « 18:15 » (avec heure de début) */
function clock(offsetMin: number, start?: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start ?? '');
  const base = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  const total = base + offsetMin;
  const h = Math.floor(total / 60) % 24;
  const mm = String(total % 60).padStart(2, '0');
  return m ? `${String(h).padStart(2, '0')}:${mm}` : `${Math.floor(total / 60)}:${mm}`;
}

const longDate = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(pdfLang(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
};

const multiline = (s: string) => esc(s).replace(/\n/g, '<br>');

const CSS = `
  .plan-head { display: flex; align-items: center; gap: 5mm; padding-bottom: 4mm;
    border-bottom: 0.8mm solid var(--navy); margin-bottom: 5mm; }
  .plan-logo { max-height: 18mm; max-width: 30mm; object-fit: contain; }
  .plan-club { font-size: 10pt; color: var(--gray-dark); text-transform: uppercase; letter-spacing: 0.4pt; }
  .plan-title { font-size: 18pt; font-weight: 800; color: var(--navy); line-height: 1.15; }
  .plan-meta { margin-top: 1mm; font-size: 10pt; color: var(--text); }
  .plan-meta span + span::before { content: ' · '; color: var(--gray-mid); }
  .plan-total { margin-left: auto; text-align: right; }
  .plan-total b { display: block; font-size: 16pt; color: var(--navy); }
  .plan-total small { color: var(--gray-dark); font-size: 8pt; text-transform: uppercase; }
  .plan-box { border-left: 1.2mm solid var(--gold); background: var(--gold-bg);
    padding: 3mm 4mm; margin-bottom: 5mm; border-radius: 1mm; }
  .plan-box h2, .plan-section { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5pt;
    color: var(--navy-light); margin-bottom: 1.5mm; }
  .plan-table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  .plan-table th { background: var(--navy); color: var(--white); font-size: 8pt; text-transform: uppercase;
    letter-spacing: 0.3pt; padding: 2mm; text-align: left; }
  .plan-table td { border-bottom: 0.2mm solid var(--border); padding: 2.5mm 2mm; vertical-align: top; }
  .plan-table tr { page-break-inside: avoid; }
  .plan-table tr:nth-child(even) td { background: var(--gray-xlight); }
  .col-n { width: 9mm; font-weight: 700; color: var(--navy); }
  .col-time { width: 26mm; white-space: nowrap; color: var(--gray-dark); font-variant-numeric: tabular-nums; }
  .col-dur { width: 18mm; white-space: nowrap; text-align: right; font-weight: 600; }
  .col-check { width: 10mm; text-align: center; }
  .box { display: inline-block; width: 4.5mm; height: 4.5mm; border: 0.35mm solid var(--navy); border-radius: 0.8mm; }
  .ex-title { font-weight: 700; font-size: 10.5pt; }
  .ex-details { margin-top: 1mm; color: var(--gray-dark); font-size: 9pt; }
  .plan-empty { color: var(--gray-dark); font-style: italic; margin-bottom: 6mm; }
  .plan-notes { border: 0.3mm solid var(--border); border-radius: 1mm; padding: 3mm 4mm; page-break-inside: avoid; }
  .plan-notes p { margin-bottom: 2mm; }
  .plan-lines div { height: 8mm; border-bottom: 0.2mm dotted var(--gray-mid); }
  .plan-foot { margin-top: 5mm; font-size: 7.5pt; color: var(--gray-mid); text-align: right; }
`;

/** HTML du plan de cours (pur, testable) */
export function generateClubPlanHTML(session: ClubSession, opts: ClubPlanPdfOptions): string {
  const logo = opts.logo && IMG_RE.test(opts.logo) ? opts.logo : null;
  const total = planDuration(session.plan);
  let offset = 0;
  const rows = session.plan
    .map((it, i) => {
      const from = clock(offset, opts.startTime);
      offset += it.minutes;
      const to = clock(offset, opts.startTime);
      return `<tr>
        <td class="col-n">${i + 1}</td>
        <td class="col-time">${esc(from)} – ${esc(to)}</td>
        <td><div class="ex-title">${esc(it.title)}</div>${
          it.details ? `<div class="ex-details">${multiline(it.details)}</div>` : ''
        }</td>
        <td class="col-dur">${esc(formatMinutes(it.minutes))}</td>
        <td class="col-check"><span class="box"></span></td>
      </tr>`;
    })
    .join('');
  const meta = [
    `<span>${esc(longDate(session.date))}</span>`,
    opts.startTime ? `<span>${esc(opts.startTime)}</span>` : '',
    opts.weaponLabel ? `<span>${esc(opts.weaponLabel)}</span>` : '',
  ].join('');
  const title = session.label || pdfT('club_plan_title', 'Plan de cours');

  return `<!DOCTYPE html><html lang="${esc(pdfLang())}"><head><meta charset="utf-8">
  <title>${esc(title)}</title><style>${BASE_CSS}${CSS}</style></head><body>
  <header class="plan-head">
    ${logo ? `<img class="plan-logo" src="${logo}" alt="">` : ''}
    <div>
      ${opts.clubName ? `<div class="plan-club">${esc(opts.clubName)}</div>` : ''}
      <div class="plan-title">${esc(title)}</div>
      <div class="plan-meta">${meta}</div>
    </div>
    <div class="plan-total"><small>${esc(pdfT('club_plan_duration', 'Durée'))}</small><b>${esc(formatMinutes(total))}</b></div>
  </header>
  ${
    session.objectives
      ? `<section class="plan-box"><h2>${esc(pdfT('club_plan_objectives', 'Objectifs'))}</h2><p>${multiline(session.objectives)}</p></section>`
      : ''
  }
  <h2 class="plan-section">${esc(pdfT('club_plan_progress', 'Déroulé de la séance'))}</h2>
  ${
    session.plan.length
      ? `<table class="plan-table"><thead><tr>
          <th>#</th><th>${esc(pdfT('club_plan_time', 'Horaire'))}</th>
          <th>${esc(pdfT('club_plan_exercise', 'Exercice'))}</th>
          <th style="text-align:right">${esc(pdfT('club_plan_duration', 'Durée'))}</th>
          <th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="plan-empty">${esc(pdfT('club_plan_empty', 'Aucun exercice prévu'))}</p>`
  }
  <section class="plan-notes">
    <h2 class="plan-section">${esc(pdfT('club_plan_notes', 'Notes'))}</h2>
    ${session.notes ? `<p>${multiline(session.notes)}</p>` : ''}
    <div class="plan-lines">${'<div></div>'.repeat(session.notes ? 4 : 7)}</div>
  </section>
  <footer class="plan-foot">BellePoule Modern</footer>
  </body></html>`;
}

const fileName = (s: ClubSession) =>
  `plan-${s.date}${s.label ? `-${s.label.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}` : ''}.pdf`;

export async function exportClubPlanToPDF(
  session: ClubSession,
  opts: ClubPlanPdfOptions
): Promise<void> {
  await savePDF(generateClubPlanHTML(session, opts), fileName(session));
}

export async function printClubPlan(session: ClubSession, opts: ClubPlanPdfOptions): Promise<void> {
  await printHTML(generateClubPlanHTML(session, opts));
}
