/**
 * BellePoule Modern - Couche domaine : fichiers écrits hors écran (#1880)
 * Exports demandés par un agent (MCP) : dossiers accessibles à l'agent seulement (chemin
 * réel, liens des dossiers parents résolus), création exclusive, remplacement atomique.
 * Messages d'erreur sans le chemin résolu.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';
import { DomainError } from './context';

const realOrNull = (p: string): string | null => {
  try {
    // .native : noms courts 8.3 de Windows développés (JEAN~1 → Jean-Pierre)
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
};

/** Le chemin réel est-il dans un des dossiers autorisés (chemins réels) ? */
export function isWithinRoots(realPath: string, roots: readonly string[]): boolean {
  return roots.some(root => {
    const realRoot = realOrNull(root);
    if (!realRoot) return false;
    const rel = path.relative(realRoot, realPath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

/** Plus proche dossier parent existant (chemin réel), ou null */
function nearestExistingAncestor(dir: string): string | null {
  let current = dir;
  for (;;) {
    const real = realOrNull(current);
    if (real) return real;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const outsideRoots = () =>
  new DomainError(
    'path_not_allowed',
    'Chemin hors des dossiers accessibles à l’agent (Paramètres → Système → Agent IA)'
  );

/**
 * Fichier de sortie contrôlé : chemin absolu, extension attendue, dossier existant
 * (dans les dossiers autorisés), cible ni lien ni dossier ; pas d'écrasement sans accord.
 */
export function resolveOutputPath(
  outputPath: unknown,
  extension: string,
  options: { overwrite?: boolean; roots?: readonly string[] } = {}
): string {
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath) || outputPath.includes('\0')) {
    throw new DomainError('invalid_path', 'Chemin de sortie absolu attendu');
  }
  const resolved = path.resolve(outputPath);
  if (path.extname(resolved).toLowerCase() !== extension) {
    throw new DomainError('invalid_extension', `Extension ${extension} attendue`);
  }
  const realDir = realOrNull(path.dirname(resolved));
  if (options.roots) {
    // Dossier absent : « introuvable » seulement s'il serait dans les dossiers de l'agent,
    // sinon même réponse qu'un chemin hors périmètre (rien n'est appris au-dehors)
    const checked = realDir ?? nearestExistingAncestor(path.dirname(resolved));
    if (!checked || !isWithinRoots(checked, options.roots)) throw outsideRoots();
  }
  if (!realDir || !fs.statSync(realDir).isDirectory()) {
    throw new DomainError(
      'dir_not_found',
      'Dossier de sortie introuvable : créez-le d’abord (l’agent ne crée pas de dossier)'
    );
  }
  const target = path.join(realDir, path.basename(resolved));
  let exists = false;
  try {
    const st = fs.lstatSync(target);
    if (st.isSymbolicLink() || !st.isFile()) throw new DomainError('invalid_path', 'Cible refusée');
    exists = true;
  } catch (e) {
    if (e instanceof DomainError) throw e;
  }
  if (exists && !options.overwrite) {
    throw new DomainError(
      'file_exists',
      'Le fichier existe déjà : overwrite=true pour le remplacer'
    );
  }
  return target;
}

/**
 * Écriture sans suivre de lien : création exclusive (wx) ; remplacement via un fichier
 * temporaire du même dossier puis renommage (atomique, un lien posé entre-temps est remplacé).
 */
export async function writeOutputFile(
  target: string,
  content: string | Uint8Array,
  overwrite: boolean
): Promise<void> {
  try {
    await writeOutput(target, content, overwrite);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new DomainError(
        'file_exists',
        'Le fichier existe déjà : overwrite=true pour le remplacer'
      );
    }
    // Erreur système sans le chemin (renvoyée à l'agent et au journal)
    throw new DomainError('write_failed', `Écriture impossible (${fsCode(e)})`);
  }
}

const fsCode = (e: unknown): string =>
  typeof (e as NodeJS.ErrnoException)?.code === 'string'
    ? (e as NodeJS.ErrnoException).code!
    : 'erreur';

async function writeOutput(
  target: string,
  content: string | Uint8Array,
  overwrite: boolean
): Promise<void> {
  if (!overwrite) {
    await fs.promises.writeFile(target, content, { flag: 'wx', mode: 0o644 });
    return;
  }
  const tmp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`
  );
  await fs.promises.writeFile(tmp, content, { flag: 'wx', mode: 0o644 });
  try {
    await fs.promises.rename(tmp, target);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw e;
  }
}
