/**
 * BellePoule Modern - Mode Club (#1872) : cartes de membre imprimables.
 * Format carte bancaire (85,6 × 54 mm), 10 par A4 portrait, traits de coupe.
 * Logo + nom du club, nom/prénom, QR d'identification `BPC1:M:<code>` + code en clair.
 * Licensed under GPL-3.0
 */
import type { ClubMember, ClubSettings } from '../../types/club';
import { memberQrPayload } from '../clubQr';
import { escHtml as esc } from './bookToc';
import { pdfLang, pdfT, savePDF } from './core';

export const CARDS_PER_PAGE = 10;

const IMG_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
/** Seules des images data:base64 entrent dans le HTML (src non interprété autrement) */
const safeImg = (src: string | undefined): string | null => (src && IMG_RE.test(src) ? src : null);

export interface ClubCardsOptions {
  /** Libellé de saison imprimé, ex. 2026-2027 */
  season?: string;
}

function cardHTML(
  m: ClubMember,
  settings: ClubSettings,
  qr: string | null,
  opts: ClubCardsOptions
): string {
  const logo = safeImg(settings.logo);
  const sub = opts.season
    ? `${pdfT('club_card_title', 'Carte de membre')} · ${pdfT('club_card_season', 'Saison {{season}}', { season: opts.season })}`
    : pdfT('club_card_title', 'Carte de membre');
  return `<div class="card">
    <div class="head">
      ${logo ? `<img class="logo" src="${logo}" alt="">` : ''}
      <div class="club">
        <div class="club-name">${esc(settings.name)}</div>
        <div class="sub">${esc(sub)}</div>
      </div>
    </div>
    <div class="body">
      <div class="who">
        <div class="last">${esc(m.lastName.toUpperCase())}</div>
        <div class="first">${esc(m.firstName)}</div>
        ${m.license ? `<div class="lic">${esc(m.license)}</div>` : ''}
      </div>
      <div class="qr">
        ${qr ? `<img src="${qr}" alt="">` : ''}
        <div class="code">${esc(m.cardCode)}</div>
      </div>
    </div>
  </div>`;
}

const CSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; background: #fff; }
.page { width: 210mm; height: 297mm; padding: 13.5mm 19.4mm; display: grid;
  grid-template-columns: repeat(2, 85.6mm); grid-auto-rows: 54mm; page-break-after: always; }
.page:last-child { page-break-after: auto; }
.card { width: 85.6mm; height: 54mm; border: 0.2mm dashed #999; padding: 3.5mm 4mm;
  display: flex; flex-direction: column; overflow: hidden; }
.head { display: flex; align-items: center; gap: 2.5mm; height: 12mm;
  border-bottom: 0.4mm solid #111; padding-bottom: 1.5mm; }
.logo { max-height: 10mm; max-width: 18mm; object-fit: contain; }
.club { min-width: 0; }
.club-name { font-size: 10pt; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 6.5pt; color: #555; text-transform: uppercase; letter-spacing: 0.3pt; }
.body { flex: 1; display: flex; align-items: center; gap: 3mm; padding-top: 2mm; }
.who { flex: 1; min-width: 0; }
.last { font-size: 13pt; font-weight: 800; line-height: 1.1; overflow-wrap: anywhere; }
.first { font-size: 11pt; line-height: 1.2; overflow-wrap: anywhere; }
.lic { font-size: 7pt; color: #555; margin-top: 1.5mm; }
.qr { width: 27mm; text-align: center; }
.qr img { width: 25mm; height: 25mm; image-rendering: pixelated; }
.code { font-family: 'Courier New', monospace; font-size: 7pt; letter-spacing: 0.6pt; }
`;

/**
 * HTML des cartes (pur, testable). `qrByMemberId` : data URL PNG du QR de chaque membre.
 */
export function generateClubCardsHTML(
  members: readonly ClubMember[],
  settings: ClubSettings,
  qrByMemberId: Readonly<Record<string, string>>,
  opts: ClubCardsOptions = {}
): string {
  const pages: string[] = [];
  for (let i = 0; i < members.length; i += CARDS_PER_PAGE) {
    const cards = members
      .slice(i, i + CARDS_PER_PAGE)
      .map(m => cardHTML(m, settings, safeImg(qrByMemberId[m.id]), opts));
    pages.push(`<section class="page">${cards.join('')}</section>`);
  }
  return `<!DOCTYPE html><html lang="${esc(pdfLang())}"><head><meta charset="utf-8">
  <title>${esc(pdfT('club_cards_title', 'Cartes de membre'))}</title><style>${CSS}</style></head>
  <body>${pages.join('')}</body></html>`;
}

/** QR codes générés (niveau de correction M, lisible par webcam) puis HTML */
export async function buildClubCardsHTML(
  members: readonly ClubMember[],
  settings: ClubSettings,
  opts: ClubCardsOptions = {}
): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  const qrs: Record<string, string> = {};
  for (const m of members) {
    if (!m.cardCode) continue;
    qrs[m.id] = await QRCode.toDataURL(memberQrPayload(m.cardCode), {
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 1,
      color: { dark: '#000', light: '#fff' },
    });
  }
  return generateClubCardsHTML(members, settings, qrs, opts);
}

export async function exportClubCardsToPDF(
  members: readonly ClubMember[],
  settings: ClubSettings,
  opts: ClubCardsOptions = {}
): Promise<void> {
  const html = await buildClubCardsHTML(members, settings, opts);
  await savePDF(html, 'cartes-club.pdf');
}
