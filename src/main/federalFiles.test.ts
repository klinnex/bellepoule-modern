/**
 * Lecture du .zip de l'extranet fédéral (#1938) — données fictives.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { FEDERAL_MAX_TEXT_BYTES, unpackFederalFiles } from './federalFiles';

const latin1 = (text: string) => Uint8Array.from([...text].map(c => c.charCodeAt(0)));
const utf8Bom = (text: string) => new TextEncoder().encode(`\uFEFF${text}`);

async function zipOf(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, bytes] of Object.entries(entries)) zip.file(name, bytes);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('unpackFederalFiles', () => {
  it('décode chaque fichier du .zip avec son propre encodage', async () => {
    const bytes = await zipOf({
      'EngardeSDM17.xml': latin1(
        '<?xml version="1.0" encoding="ISO-8859-1"?><BaseCompetitionIndividuelle TitreLong="Épreuve"/>'
      ),
      'EngardeSDM17.FFF': utf8Bom(
        'FFF;UTF8;CLASSEMENT;FFE\r\nDUPONT,Élodie,02/05/2010,F,FRA;,,;1,L,C,,;'
      ),
      'EngardeArbitres.txt': utf8Bom(
        'nom;prenom;sexe;categorie;club;ligue;nation;date_nais;licence_fie;licence;'
      ),
      '__MACOSX/._EngardeSDM17.xml': latin1('x'),
      'notes.pdf': latin1('x'),
    });
    const files = await unpackFederalFiles([{ name: 'CHAMPIONNAT_EXEMPLE_ind.zip', bytes }]);
    expect(files.map(f => f.name)).toEqual([
      'EngardeSDM17.xml',
      'EngardeSDM17.FFF',
      'EngardeArbitres.txt',
    ]);
    expect(files[0].content).toContain('TitreLong="Épreuve"');
    expect(files[1].content.startsWith('FFF;UTF8')).toBe(true);
    expect(files[1].content).toContain('Élodie');
  });

  it('accepte des fichiers isolés et ignore les extensions inconnues', async () => {
    const files = await unpackFederalFiles([
      { name: '/chemin/inscrits.fff', bytes: utf8Bom('FFF;UTF8') },
      { name: 'image.png', bytes: latin1('x') },
    ]);
    expect(files).toEqual([{ name: 'inscrits.fff', content: 'FFF;UTF8' }]);
  });

  it('refuse un fichier texte trop volumineux', async () => {
    const big = new Uint8Array(FEDERAL_MAX_TEXT_BYTES + 1);
    await expect(unpackFederalFiles([{ name: 'a.xml', bytes: big }])).rejects.toThrow(
      /trop volumineux/
    );
  });
});
