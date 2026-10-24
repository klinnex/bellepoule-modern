import { describe, expect, it } from 'vitest';
import {
  parseBirthDate,
  parseDelimited,
  parseRapieresGender,
  parseRapieresTeams,
  rapieresCategoryFromBirthDate,
} from './rapieresImport';

const HEADER =
  'Référence commande;Date de la commande;Statut de la commande;Nom participant;Prénom participant;' +
  'Nom payeur;Prénom payeur;Email payeur;Raison sociale;Moyen de paiement;Billet;Numéro de billet;' +
  'Tarif;Montant tarif;Code Promo;Montant code promo;date de naissance;homme/femme;nom du club;' +
  'nom du 2nd tireur;prénom du 2nd tieur;date de naissance du 2nd tireur;homme/femme 2nd tieur;' +
  "nom du club (2nd tieur);nom de l'équipe (c'est l'info la plus importante !)";

const row = (cells: Record<number, string>) =>
  Array.from({ length: 25 }, (_, i) => cells[i] ?? '').join(';');

const REF = new Date(2025, 9, 26); // saison 2025-2026

describe('rapieresImport (#1211)', () => {
  it('parseDelimited gère BOM, guillemets et CRLF', () => {
    expect(parseDelimited('\uFEFFa;"b;c";"d""e"\r\nf;g;h')).toEqual([
      ['a', 'b;c', 'd"e'],
      ['f', 'g', 'h'],
    ]);
  });

  it('parseBirthDate lit JJ/MM/AAAA, ISO et série Excel', () => {
    expect(parseBirthDate('06/01/1989')).toEqual(new Date(1989, 0, 6));
    expect(parseBirthDate('1989-01-06')).toEqual(new Date(1989, 0, 6));
    expect(parseBirthDate('32514')).toEqual(new Date(1989, 0, 6));
    expect(parseBirthDate('')).toBeNull();
    expect(parseBirthDate('n/a')).toBeNull();
  });

  it('catégorie selon l’âge atteint dans l’année de début de saison', () => {
    const cat = (y: number) => rapieresCategoryFromBirthDate(new Date(y, 5, 1), REF);
    expect(cat(2006)).toBe('M20');
    expect(cat(2005)).toBe('SENIOR');
    expect(cat(1986)).toBe('SENIOR');
    expect(cat(1985)).toBe('V1');
    expect(cat(1975)).toBe('V2');
    expect(cat(1965)).toBe('V3');
    expect(cat(1955)).toBe('V4');
    expect(rapieresCategoryFromBirthDate(null, REF)).toBe('SENIOR');
    // Janvier 2026 : toujours la saison 2025-2026
    expect(rapieresCategoryFromBirthDate(new Date(2006, 0, 1), new Date(2026, 0, 10))).toBe('M20');
  });

  it('parseRapieresGender reconnaît homme/femme et variantes', () => {
    expect(parseRapieresGender('Femme')).toBe('F');
    expect(parseRapieresGender('féminin')).toBe('F');
    expect(parseRapieresGender('F')).toBe('F');
    expect(parseRapieresGender('Homme')).toBe('M');
    expect(parseRapieresGender('H')).toBe('M');
    expect(parseRapieresGender('masculin')).toBe('M');
    expect(parseRapieresGender('')).toBeUndefined();
    expect(parseRapieresGender('?')).toBeUndefined();
  });

  it('parseRapieresTeams lit le sexe en R et W', () => {
    const csv = row({ 3: 'A', 4: 'a', 17: 'Femme', 19: 'B', 20: 'b', 22: 'Homme', 24: 'T' });
    expect(parseRapieresTeams(csv, REF).teams[0].info.fencers.map(f => f.gender)).toEqual([
      'F',
      'M',
    ]);
  });

  it('parseRapieresTeams lit D/E/Q, T/U/V et Y, ignore l’en-tête et les lignes incomplètes', () => {
    const csv = [
      HEADER,
      row({
        3: 'Dupont',
        4: 'Anne',
        16: '06/01/1989',
        19: 'Martin',
        20: 'Paul',
        21: '14/06/2008',
        24: 'Les Lames',
      }),
      row({ 3: 'Durand', 4: 'Luc', 16: '22/02/1958', 19: '', 24: 'Incomplète' }),
      row({
        3: 'Petit',
        4: 'Léa',
        16: '',
        19: 'Roux',
        20: 'Max',
        21: '27/08/1961',
        24: 'Brie; Seine',
      }),
      '',
    ].join('\r\n');
    const { teams, skipped } = parseRapieresTeams(csv.replace('Brie; Seine', '"Brie; Seine"'), REF);
    expect(skipped).toEqual([3]);
    expect(teams).toEqual([
      {
        name: 'Les Lames',
        info: {
          level: 'beginner',
          fencers: [
            { lastName: 'Dupont', firstName: 'Anne', category: 'SENIOR' },
            { lastName: 'Martin', firstName: 'Paul', category: 'M20' },
          ],
        },
      },
      {
        name: 'Brie; Seine',
        info: {
          level: 'beginner',
          fencers: [
            { lastName: 'Petit', firstName: 'Léa', category: 'SENIOR' },
            { lastName: 'Roux', firstName: 'Max', category: 'V3' },
          ],
        },
      },
    ]);
  });
});
