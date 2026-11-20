/**
 * BellePoule Modern - Tests du modèle d'import de tireurs
 * Licensed under GPL-3.0
 */

import { describe, it, expect } from 'vitest';
import { buildFencerImportTemplate, FENCER_IMPORT_COLUMNS } from './fencerTemplate';
import { parseFFEFile } from './ffeParser';
import { Gender } from '../../types';

describe('buildFencerImportTemplate', () => {
  it('commence par un BOM UTF-8 et contient les colonnes attendues', () => {
    const template = buildFencerImportTemplate();
    expect(template.charCodeAt(0)).toBe(0xfeff);
    const header = template.replace(/^\uFEFF/, '').split(/\r?\n/)[0];
    expect(header).toBe(FENCER_IMPORT_COLUMNS.join(';'));
  });

  it("est relu par le parseur d'import avec tous les champs de l'exemple", () => {
    const result = parseFFEFile(buildFencerImportTemplate());
    expect(result.success).toBe(true);
    expect(result.fencers).toHaveLength(1);
    expect(result.fencers[0]).toMatchObject({
      lastName: 'DUPONT',
      firstName: 'Jean',
      gender: Gender.MALE,
      club: 'Paris Escrime',
      license: '12345678',
      ranking: 12,
      region: 'Île-de-France',
    });
  });

  it('relit un champ entre guillemets contenant un séparateur (cas Excel)', () => {
    const quoted = [
      FENCER_IMPORT_COLUMNS.join(';'),
      '"DUPONT";"Jean";"M";"15/03/1995";"FRA";"Île-de-France";"Club, Paris";"12345678";"12"',
    ].join('\r\n');
    const result = parseFFEFile(quoted);
    expect(result.fencers[0].club).toBe('Club, Paris');
  });
});
