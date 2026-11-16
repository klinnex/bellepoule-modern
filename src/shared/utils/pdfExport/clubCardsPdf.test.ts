// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { ClubMember } from '../../types/club';
import {
  arenaNumbers,
  buildClubCardsHTML,
  generateArenaQrHTML,
  generateClubCardsHTML,
} from './clubCardsPdf';

const member = (i: number, extra: Partial<ClubMember> = {}): ClubMember => ({
  id: `m${i}`,
  firstName: `Prénom${i}`,
  lastName: `nom${i}`,
  weapons: [],
  active: true,
  cardCode: `A1B2C3D4${String(i).padStart(2, '0')}`,
  createdAt: '',
  updatedAt: '',
  ...extra,
});
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('cartes de membre (#1872)', () => {
  it('10 cartes par page, nom en majuscules, code en clair', () => {
    const members = Array.from({ length: 12 }, (_, i) => member(i));
    const doc = parse(
      generateClubCardsHTML(
        members,
        { name: 'Salle d’armes', logo: PNG },
        { m0: PNG },
        { season: '2026-2027' }
      )
    );
    const pages = doc.querySelectorAll('section.page');
    expect(pages).toHaveLength(2);
    expect(pages[0].querySelectorAll('.card')).toHaveLength(10);
    expect(pages[1].querySelectorAll('.card')).toHaveLength(2);
    const first = doc.querySelector('.card')!;
    expect(first.querySelector('.last')!.textContent).toBe('NOM0');
    expect(first.querySelector('.code')!.textContent).toBe('A1B2C3D400');
    expect(first.querySelector('.sub')!.textContent).toBe('Carte de membre · Saison 2026-2027');
    expect(first.querySelector('.logo')!.getAttribute('src')).toBe(PNG);
    expect(first.querySelector('.qr img')!.getAttribute('src')).toBe(PNG);
    // Pas de QR fourni → pas d'image
    expect(doc.querySelectorAll('.card')[1].querySelector('.qr img')).toBeNull();
  });

  it('échappe les textes, refuse logo/QR non data:image', () => {
    const html = generateClubCardsHTML(
      [member(1, { lastName: '<img src=x onerror=1>', license: '"><b>' })],
      { name: '<script>x</script>', logo: 'javascript:alert(1)' },
      { m1: 'https://evil/x.png' }
    );
    const doc = parse(html);
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('.who img, .who b')).toBeNull();
    expect(doc.querySelector('.logo')).toBeNull();
    expect(doc.querySelector('.qr img')).toBeNull();
    expect(doc.querySelector('.club-name')!.textContent).toBe('<script>x</script>');
  });

  it('QR réels : payload BPC1:M:<code>', async () => {
    const html = await buildClubCardsHTML([member(1)], { name: 'Club' });
    const src = parse(html).querySelector('.qr img')!.getAttribute('src')!;
    expect(src.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('photo du membre sur la carte (data:image seulement)', () => {
    const doc = parse(
      generateClubCardsHTML(
        [member(1, { photo: PNG }), member(2, { photo: 'https://x/y.png' })],
        { name: 'Club' },
        {}
      )
    );
    const cards = doc.querySelectorAll('.card');
    expect(cards[0].querySelector('.photo')!.getAttribute('src')).toBe(PNG);
    expect(cards[1].querySelector('.photo')).toBeNull();
  });
});

describe('QR des pistes (#1872)', () => {
  it('bornes 0..99', () => {
    expect(arenaNumbers(3)).toEqual([1, 2, 3]);
    expect(arenaNumbers(-2)).toEqual([]);
    expect(arenaNumbers(500)).toHaveLength(99);
  });

  it('2 pistes par page, titre, payload BPC1:A:n, nom échappé', () => {
    const doc = parse(
      generateArenaQrHTML(3, { name: '<b>Club</b>', logo: PNG }, { 1: PNG, 2: PNG, 3: 'x' })
    );
    const sheets = doc.querySelectorAll('section.sheet');
    expect(sheets).toHaveLength(2);
    expect(sheets[0].querySelectorAll('.arena')).toHaveLength(2);
    const arenas = doc.querySelectorAll('.arena');
    expect(arenas[0].querySelector('.title')!.textContent).toBe('Piste 1');
    expect(arenas[2].querySelector('.code')!.textContent).toBe('BPC1:A:3');
    expect(arenas[2].querySelector('.qr')).toBeNull();
    expect(doc.querySelector('.club-name')!.textContent).toBe('<b>Club</b>');
    expect(doc.querySelector('.club-name b')).toBeNull();
  });
});
