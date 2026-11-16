// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { ClubMember } from '../../types/club';
import { buildClubCardsHTML, generateClubCardsHTML } from './clubCardsPdf';

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
});
