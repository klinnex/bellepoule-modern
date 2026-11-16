/**
 * BellePoule Modern - Cartons sur les feuilles imprimées (poule et match de tableau, #1829)
 * Par tireur : blanc, jaune, rouge (nombre), noir, puis les cartons P à part (rouge P, noir P),
 * comme le demande le règlement FIE (t.124.3.e : cartons P inscrits séparément).
 * Licensed under GPL-3.0
 */
import { pdfT } from './core';
import { escHtml } from './bookToc';

/** Décompte des cartons d'un tireur */
export interface CardTally {
  white: number;
  yellow: number;
  red: number;
  black: number;
  pRed: number;
  pBlack: number;
}

/** Types de carton enregistrés en base (match_cards.card_type) → rubrique du décompte */
const CARD_KEYS: Record<string, keyof CardTally> = {
  white: 'white',
  yellow: 'yellow',
  red: 'red',
  black: 'black',
  'p-red': 'pRed',
  'p-black': 'pBlack',
};

/** Décompte d'une liste de types de carton (types inconnus ignorés) */
export function tallyCards(cardTypes: readonly string[] | undefined): CardTally {
  const t: CardTally = { white: 0, yellow: 0, red: 0, black: 0, pRed: 0, pBlack: 0 };
  for (const type of cardTypes ?? []) {
    const key = CARD_KEYS[type];
    if (key) t[key]++;
  }
  return t;
}

/** Vrai si le décompte contient au moins un carton */
export function hasCards(t: CardTally): boolean {
  return Object.values(t).some(n => n > 0);
}

/** Pastille d'un carton : lettre traduite, nombre si plus d'un */
function badge(cls: string, label: string, count: number): string {
  if (count <= 0) return '';
  const n = count > 1 ? `<span class="pdf-card-count">×${count}</span>` : '';
  return `<span class="pdf-card pdf-card-${cls}">${escHtml(label)}</span>${n}`;
}

/**
 * Cartons d'un tireur en HTML : blanc, jaune, rouge (nombre), noir, puis groupe « P » séparé
 * (rouge P, noir P). Chaîne vide sans carton.
 */
export function renderCardTally(t: CardTally): string {
  const standard = [
    badge('white', pdfT('card_white', 'B'), t.white),
    badge('yellow', pdfT('card_yellow', 'J'), t.yellow),
    badge('red', pdfT('card_red', 'R'), t.red),
    badge('black', pdfT('card_black', 'N'), t.black),
  ].join('');
  const p = [
    badge('p-red', pdfT('card_p_red', 'P-R'), t.pRed),
    badge('p-black', pdfT('card_p_black', 'P-N'), t.pBlack),
  ].join('');
  const parts = [
    standard ? `<span class="pdf-cards-std">${standard}</span>` : '',
    p ? `<span class="pdf-cards-p">${p}</span>` : '',
  ].filter(Boolean);
  return parts.join('<span class="pdf-cards-sep"> | </span>');
}

/** Styles des pastilles de carton (communs aux feuilles de poule et de tableau) */
export const CARDS_CSS = `
    .pdf-card {
      display: inline-block;
      min-width: 4mm;
      padding: 0.3mm 1mm;
      margin-right: 0.8mm;
      border: 1px solid #333;
      border-radius: 1mm;
      font-size: 7pt;
      font-weight: 700;
      line-height: 1.3;
      text-align: center;
    }
    .pdf-card-white { background: #ffffff; color: #111; }
    .pdf-card-yellow { background: #f5d90a; color: #111; }
    .pdf-card-red { background: #d32f2f; color: #fff; }
    .pdf-card-black { background: #111; color: #fff; }
    .pdf-card-p-red { background: #fff; color: #d32f2f; border-color: #d32f2f; }
    .pdf-card-p-black { background: #fff; color: #111; border-color: #111; border-width: 2px; }
    .pdf-card-count { font-size: 7pt; font-weight: 700; margin-right: 1.5mm; }
    .pdf-cards-sep { color: #888; margin: 0 1mm; }
`;
