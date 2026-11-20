/**
 * BellePoule Modern - FFE/TXT File Parser
 * Parse FFE and simple TXT format files for fencer import
 * Licensed under GPL-3.0
 *
 * Fichier barrel : l'implémentation est découpée par format dans ./fileParser/
 */

export {
  ImportResult,
  ImportedReferee,
  ImportedTeam,
  decodeXmlEntities,
  fencerKey,
} from './fileParser/common';
export { parseSimpleTXTFile } from './fileParser/txtParser';
export { parseFFEFile } from './fileParser/ffeParser';
export { parseXMLFile } from './fileParser/xmlParser';
export { buildFencerImportTemplate, FENCER_IMPORT_COLUMNS } from './fileParser/fencerTemplate';
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
export {
  CompetitionHeader,
  MappedCompetitionFields,
  parseCompetitionHeader,
} from './fileParser/competitionHeader';
export {
  FederalFile,
  FederalImport,
  FederalNotice,
  FencerConflict,
  FencerSource,
  buildFederalImport,
  resolveFederalFencers,
  resolveFederalTeams,
} from './fileParser/federalImport';
