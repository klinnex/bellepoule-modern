/**
 * BellePoule Modern - Économie d'encre : réglage du poste appliqué à tout HTML imprimé ou rendu en PDF
 * (aperçu, impression, PDF, MCP). Le réglage est lu à chaque rendu depuis la base (app_settings).
 * Licensed under GPL-3.0
 */
import { applyInkSaving } from '../shared/utils/inkSaving';

let inkSavingEnabled: () => boolean = () => false;

/** Branché au démarrage sur le réglage `inkSaving` de la base */
export function setInkSavingProvider(provider: () => boolean): void {
  inkSavingEnabled = provider;
}

/** Réglage lu sans jamais faire échouer une impression : base indisponible = encre normale */
function isInkSavingOn(): boolean {
  try {
    return inkSavingEnabled();
  } catch {
    return false;
  }
}

/** HTML prêt à imprimer : feuille d'économie d'encre si le réglage du poste est activé */
export function prepareForInk(html: string): string {
  return isInkSavingOn() ? applyInkSaving(html) : html;
}
