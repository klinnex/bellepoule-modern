/**
 * BellePoule Modern - Chargement en mémoire des pages distantes et du client socket.io (#1240)
 * Fonctions pures de lecture disque : l'état (htmlFiles, remoteBasePath…) reste dans le serveur.
 * Licensed under GPL-3.0
 */
import * as fs from 'fs';
import * as path from 'path';

/** Pages servies depuis la mémoire (src/remote/*.html). */
export const REMOTE_HTML_FILES = [
  'referee.html',
  'arena.html',
  'dashboard.html',
  'index.html',
  'pool.html',
  'pool-ocr.html',
  'kiosk.html',
  'lobby.html',
  'login.html',
  'public.html',
  'overlay.html',
  'overlay-config.html',
  'register.html',
  'checkin.html',
  'trainer.html',
  'matchs.html',
  'tireur.html',
  'teamArena.html',
  'teamReferee.html',
] as const;

/**
 * Localise et lit le client socket.io.
 * Plusieurs stratégies pour couvrir dev, app.asar et asar.unpacked.
 * @returns le code JS, ou null si introuvable
 */
export function loadSocketIoClient(): string | null {
  const candidates: string[] = [];

  // 1) Fichier copié dans dist/remote au build (cas packagé : node_modules absent)
  candidates.push(
    path.join(__dirname, '../remote/socket.io.min.js'), // dist/main → dist/remote
    ...(process.resourcesPath
      ? [
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist/remote/socket.io.min.js'),
          path.join(process.resourcesPath, 'app.asar', 'dist/remote/socket.io.min.js'),
        ]
      : []),
    path.join(__dirname, '../../src/remote/socket.io.min.js') // fallback dev sans webpack
  );

  // 2) Résolution via node_modules (dev / si présent dans le package)
  for (const sub of ['client-dist/socket.io.min.js', 'client-dist/socket.io.js']) {
    try {
      candidates.push(require.resolve(`socket.io/${sub}`));
    } catch {
      /* ignore */
    }
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const js = fs.readFileSync(candidate, 'utf-8');
        console.log(`[RemoteScoreServer] Client socket.io chargé depuis: ${candidate}`);
        return js;
      }
    } catch (err) {
      console.error(`[RemoteScoreServer] Erreur lecture client socket.io ${candidate}:`, err);
    }
  }

  console.error(
    '[RemoteScoreServer] ERREUR: client socket.io introuvable! Chemins testés:',
    candidates
  );
  return null;
}

/** Remplace les balises <script src> du client socket.io par le code inline. */
export function inlineSocketIoClient(html: string, socketIoClientJs: string): string {
  const inlineTag = `<script>${socketIoClientJs}</script>`;
  // Remplaçant en fonction : une chaîne interpréterait les motifs spéciaux `$&`, `$'`…
  // présents dans le client minifié (socket.io 4.8.4 : `this.$&&…`) → script corrompu (#1009).
  return html.replace(
    /<script\s+src=["'](?:\/socket\.io\.min\.js|\/bp-sio\.js|\/socket\.io\/socket\.io\.js)["']><\/script>/g,
    () => inlineTag
  );
}

/**
 * Charge les pages HTML distantes en mémoire (premier dossier contenant au moins un fichier).
 * Si `socketIoClientJs` est fourni, il est injecté inline dans chaque page.
 */
export function loadRemoteHtmlFiles(socketIoClientJs: string | null): {
  htmlFiles: Map<string, string>;
  remoteBasePath: string | null;
} {
  const isDev = process.env.NODE_ENV === 'development';
  const htmlFiles = new Map<string, string>();
  let remoteBasePath: string | null = null;

  // Essayer plusieurs chemins pour trouver les fichiers
  const possiblePaths = isDev
    ? [
        path.join(__dirname, '../remote'), // dist/remote/ (après webpack)
        path.join(__dirname, '../../src/remote'), // src/remote/ (sans webpack)
      ]
    : [
        // process.resourcesPath n'existe que sous Electron (pas en tests Node)
        ...(process.resourcesPath
          ? [path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote')]
          : []),
        path.join(__dirname, '..', 'remote').replace('app.asar', 'app.asar.unpacked'),
        path.join(__dirname, '..', 'remote'),
        path.join(__dirname, '../../src/remote'), // fallback source sans webpack
      ];

  console.log('[RemoteScoreServer] Chargement des fichiers HTML...');

  for (const basePath of possiblePaths) {
    console.log(`[RemoteScoreServer] Essai chemin: ${basePath}`);

    try {
      if (fs.existsSync(basePath)) {
        console.log(`[RemoteScoreServer] Chemin trouvé: ${basePath}`);

        for (const file of REMOTE_HTML_FILES) {
          const filePath = path.join(basePath, file);
          if (fs.existsSync(filePath)) {
            htmlFiles.set(file, fs.readFileSync(filePath, 'utf-8'));
            console.log(`[RemoteScoreServer] Chargé: ${file}`);
          } else {
            console.log(`[RemoteScoreServer] Fichier non trouvé: ${filePath}`);
          }
        }

        // Si on a chargé au moins un fichier, on utilise ce chemin
        if (htmlFiles.size > 0) {
          console.log(`[RemoteScoreServer] ${htmlFiles.size} fichiers chargés depuis: ${basePath}`);
          remoteBasePath = basePath;
          break;
        }
      }
    } catch (err) {
      console.error(`[RemoteScoreServer] Erreur avec chemin ${basePath}:`, err);
    }
  }

  if (htmlFiles.size === 0) {
    console.error('[RemoteScoreServer] ERREUR: Aucun fichier HTML chargé!');
  } else {
    console.log(
      `[RemoteScoreServer] Chargement terminé: ${Array.from(htmlFiles.keys()).join(', ')}`
    );
  }

  // Injecter le client socket.io inline dans chaque HTML : élimine la requête
  // séparée /bp-sio.js (cache service worker, résolution de chemin runtime…).
  if (socketIoClientJs) {
    for (const [name, content] of htmlFiles) {
      const updated = inlineSocketIoClient(content, socketIoClientJs);
      if (updated !== content) htmlFiles.set(name, updated);
    }
    console.log('[RemoteScoreServer] Client socket.io injecté inline dans le HTML ✓');
  } else {
    console.error(
      '[RemoteScoreServer] ATTENTION: client socket.io non chargé, fallback sur /bp-sio.js'
    );
  }
  return { htmlFiles, remoteBasePath };
}
