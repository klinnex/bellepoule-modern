import { describe, it, expect } from 'vitest';
import { importRankingFromFFF, parseRankingHeader } from './rankingParser';
import { Fencer } from '../../types';

const fencer = (id: string, lastName: string, firstName: string, license?: string): Fencer =>
  ({ id, lastName, firstName, license }) as unknown as Fencer;

describe('import de classement CSV à en-têtes (#1025)', () => {
  it("détecte l'en-tête quel que soit l'ordre des colonnes", () => {
    expect(parseRankingHeader('CLASSEMENT;Prénom;NOM')).toMatchObject({
      separator: ';',
      ranking: 0,
      firstName: 1,
      lastName: 2,
    });
    expect(parseRankingHeader('NOM;PRENOM;CLUB')).toBeNull();
  });

  it('affecte le classement par nom + prénom, sans accents ni casse', () => {
    const fencers = [fencer('1', 'Dupont', 'Élodie'), fencer('2', 'Martin', 'Paul')];
    const result = importRankingFromFFF(
      'NOM,PRENOM,CLASSEMENT\nDUPONT,elodie,3\nDURAND,Luc,1',
      fencers
    );
    expect(result.updated).toBe(1);
    expect(result.notFound).toBe(1);
    expect(fencers[0].ranking).toBe(3);
    expect(fencers[1].ranking).toBeUndefined();
  });

  it('identifie en priorité par numéro de licence', () => {
    const fencers = [fencer('1', 'Dupont', 'Jean', '123456'), fencer('2', 'Dupont', 'Jean')];
    const result = importRankingFromFFF(
      'Licence;Nom;Prénom;Classement\n123456;Dupont;Jean;7',
      fencers
    );
    expect(result.updated).toBe(1);
    expect(fencers[0].ranking).toBe(7);
    expect(fencers[1].ranking).toBeUndefined();
  });

  it('ignore les lignes sans classement valide', () => {
    const fencers = [fencer('1', 'Dupont', 'Jean')];
    const result = importRankingFromFFF('NOM;PRENOM;CLASSEMENT\nDupont;Jean;', fencers);
    expect(result.updated).toBe(0);
    expect(fencers[0].ranking).toBeUndefined();
  });
});
