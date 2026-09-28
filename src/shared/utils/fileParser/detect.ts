/**
 * BellePoule Modern - File Parser - Détection du format par le contenu
 * Licensed under GPL-3.0
 */

export type FencerFileFormat = 'xml' | 'fff' | 'txt';

/**
 * Détecte le format réel d'un fichier de tireurs à partir de son contenu.
 * Retourne null si le contenu ne permet pas de conclure.
 */
export function detectFencerFileFormat(content: string): FencerFileFormat | null {
  const trimmed = content.replace(/^\uFEFF/, '').trimStart();
  if (!trimmed) return null;
  if (trimmed.startsWith('<')) return 'xml';
  // En-tête FFF : "FFF;WIN;..." ou "FFF;UTF8;..."
  if (/^FFF[;,]/i.test(trimmed)) return 'fff';
  // Ligne de données FFF : NOM,Prénom,Naissance,Sexe,Nation;...;...
  const lines = trimmed.split(/\r?\n/).slice(0, 10);
  if (lines.some(l => /^[^;,]+(,[^;,]*){4};[^;]*;/.test(l.trim()))) return 'fff';
  return null;
}

/**
 * Choisit le parseur à utiliser : le format demandé par l'utilisateur,
 * sauf si le contenu indique clairement un autre format.
 */
export function resolveFencerFileFormat(requested: string, content: string): string {
  if (requested === 'ranking') return requested;
  const detected = detectFencerFileFormat(content);
  if (detected) return detected;
  // Fichier non-XML ouvert via « Importer XML » : le parseur FFE gère aussi CSV/TXT
  if (requested === 'xml' && content.trim()) return 'fff';
  return requested;
}

/**
 * Décode le contenu brut d'un fichier texte.
 * Les fichiers FFE sont souvent encodés en Windows-1252 ("FFF;WIN;...") :
 * on tente l'UTF-8 strict, puis on se replie sur Windows-1252.
 */
export function decodeTextFile(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
