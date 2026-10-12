/**
 * BellePoule Modern - FFE/TXT File Parser
 * Parse FFE and simple TXT format files for fencer import
 * Licensed under GPL-3.0
 *
 * Fichier barrel : l'implémentation est découpée par format dans ./fileParser/
 */

export { ImportResult } from './fileParser/common';
export { parseSimpleTXTFile } from './fileParser/txtParser';
export { parseFFEFile } from './fileParser/ffeParser';
export { parseXMLFile } from './fileParser/xmlParser';
export {
  parseRankingFile,
  RankingImportResult,
  importRankingFromFFF,
} from './fileParser/rankingParser';
export { RefereeImportResult, parseEngardeRefereeFile } from './fileParser/engardeParser';
export {
  FencerFileFormat,
  detectFencerFileFormat,
  resolveFencerFileFormat,
  decodeTextFile,
} from './fileParser/detect';
