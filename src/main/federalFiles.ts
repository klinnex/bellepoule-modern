/**
 * BellePoule Modern - Lecture des fichiers de l'extranet fédéral (#1938)
 * Licensed under GPL-3.0
 *
 * Ouvre le .zip de l'extranet (ou des .xml / .fff / .txt isolés) dans le main, avec les
 * garde-fous d'archive (checkZipEntries), et décode chaque fichier séparément : dans un même
 * .zip, le XML est en ISO-8859-1 et le .FFF / .txt en UTF-8 avec BOM. Le décodage tente
 * l'UTF-8 strict d'abord, sans se fier au prologue XML (fichiers réels annoncés iso-8859-1
 * mais écrits en UTF-8).
 */
import * as path from 'path';
import JSZip from 'jszip';
import { checkZipEntries, ZIP_LIMITS } from './pathAuthorization';
import { decodeTextFile } from '../shared/utils/fileParser/detect';
import type { FederalFile } from '../shared/utils/fileParser/federalImport';

/** Extensions retenues (fichiers isolés ou contenu du .zip) */
const TEXT_EXT = /\.(xml|cotcot|fff|txt|csv)$/i;
/** Un fichier d'inscription fait quelques dizaines de Ko : 5 Mo suffit largement */
export const FEDERAL_MAX_TEXT_BYTES = 5 * 1024 * 1024;
export const FEDERAL_MAX_INPUTS = 5;
const FEDERAL_MAX_FILES = 20;

export interface FederalInput {
  name: string;
  bytes: Uint8Array;
}

function decodeBounded(name: string, bytes: Uint8Array): FederalFile {
  if (bytes.byteLength > FEDERAL_MAX_TEXT_BYTES)
    throw new Error(`Fichier trop volumineux : ${name}`);
  return { name, content: decodeTextFile(bytes) };
}

/** Fichiers texte d'une épreuve : contenu des .zip + fichiers isolés, décodés un par un */
export async function unpackFederalFiles(inputs: FederalInput[]): Promise<FederalFile[]> {
  if (inputs.length > FEDERAL_MAX_INPUTS) throw new Error('Trop de fichiers');
  const files: FederalFile[] = [];
  for (const input of inputs) {
    const name = path.basename(String(input.name));
    if (input.bytes.byteLength > ZIP_LIMITS.maxFileBytes) {
      throw new Error(`Fichier trop volumineux : ${name}`);
    }
    if (/\.zip$/i.test(name)) {
      const zip = await JSZip.loadAsync(input.bytes);
      for (const entryName of checkZipEntries(zip)) {
        const base = path.posix.basename(entryName);
        if (entryName.startsWith('__MACOSX/') || base.startsWith('.') || !TEXT_EXT.test(base)) {
          continue;
        }
        const entry = zip.file(entryName);
        if (entry) files.push(decodeBounded(base, await entry.async('uint8array')));
      }
    } else if (TEXT_EXT.test(name)) {
      files.push(decodeBounded(name, input.bytes));
    }
    if (files.length > FEDERAL_MAX_FILES) throw new Error('Trop de fichiers dans l’archive');
  }
  return files;
}
