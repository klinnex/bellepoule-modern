/**
 * BellePoule Modern - Middlewares Express (sécurité, CORS, fichiers servis depuis la mémoire) (#1240)
 * Extrait de RemoteScoreServer : l'état reste dans le serveur, exposé par accesseurs (contexte).
 * Licensed under GPL-3.0
 */
import express from 'express';
import path from 'path';
import { isLocalNetworkOrigin } from './network';
import { publicJson } from './publicDto';
import { jsonCompression, sendStored } from './pageStore';
import { isLoginPath } from './network';
import type { RemoteScoreServer } from '../remoteScoreServer';

type S = RemoteScoreServer;

/** État et services du serveur utilisés par ce module (accesseurs : valeurs toujours à jour). */
export interface MiddlewareContext {
  readonly app: S['app'];
  readonly assets: S['assets'];
  readonly htmlFiles: S['htmlFiles'];
  readonly isAllowedOrigin: S['isAllowedOrigin'];
  readonly sendHtmlFromMemory: S['sendHtmlFromMemory'];
  readonly staticFiles: S['staticFiles'];
}

export function setupMiddleware(ctx: MiddlewareContext): void {
  console.log('[RemoteScoreServer] Configuration du middleware...');
  // Limite de taille : les photos d'inscription (base64 ~700KB) sont le plus gros payload légitime.
  // Routes de connexion : 4 Ko suffisent (mot de passe seul).
  const smallJson = express.json({ limit: '4kb' });
  const largeJson = express.json({ limit: '1mb' });
  ctx.app.use((req, res, next) => (isLoginPath(req.path) ? smallJson : largeJson)(req, res, next));

  // Requêtes mutantes : refus d'une Origin étrangère (page web tierce → CSRF).
  ctx.app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!ctx.isAllowedOrigin(req.headers.origin, req.headers.host)) {
      res.status(403).json({ error: 'origin_refused' });
      return;
    }
    next();
  });

  // Compression gzip des réponses JSON volumineuses (classements, tableaux…)
  ctx.app.use(jsonCompression());
  ctx.app.use(publicJson()); // réponses sans données personnelles (#1194)

  // En-têtes de sécurité de base (fichiers statiques, API). Les pages HTML reçoivent une CSP
  // avec nonce (script-src sans 'unsafe-inline') via sendHtmlPage (remote/csp.ts, #1149).
  // frame-ancestors 'self' remplace X-Frame-Options (overlay-config.html prévisualise
  // overlay.html dans une iframe same-origin).
  ctx.app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
    );
    next();
  });

  // Déterminer le chemin des fichiers remote
  let remotePath: string;
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    // En développement
    remotePath = path.join(__dirname, '../remote'); // dist/remote/ (après webpack)
    if (!require('fs').existsSync(remotePath)) {
      remotePath = path.join(__dirname, '../../src/remote'); // src/remote/ (sans webpack)
    }
  } else {
    // En production - utiliser process.resourcesPath qui est plus fiable
    // Les fichiers unpacked sont dans resourcesPath/app.asar.unpacked/dist/remote
    // __dirname est dans resourcesPath/app.asar/dist/main/

    // Essayer plusieurs chemins possibles
    const possiblePaths = [
      // Chemin standard avec asarUnpack (process.resourcesPath n'existe que sous Electron)
      ...(process.resourcesPath
        ? [path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'remote')]
        : []),
      // Chemin relatif depuis __dirname
      path.join(__dirname, '..', 'remote').replace('app.asar', 'app.asar.unpacked'),
      // Dernier recours: chemin relatif standard
      path.join(__dirname, '..', 'remote'),
      // Fallback source sans webpack
      path.join(__dirname, '../../src/remote'),
    ];

    remotePath = '';
    const fs = require('fs');
    for (const p of possiblePaths) {
      console.log(`[RemoteScoreServer] Vérification chemin: ${p}`);
      if (fs.existsSync(p)) {
        remotePath = p;
        console.log(`[RemoteScoreServer] Chemin valide trouvé: ${p}`);
        break;
      }
    }

    if (!remotePath) {
      console.error('[RemoteScoreServer] ERREUR: Aucun chemin valide trouvé!');
      console.error('[RemoteScoreServer] Chemins testés:', possiblePaths);
      // Utiliser le dernier chemin comme fallback
      remotePath = possiblePaths[possiblePaths.length - 1];
    }
  }

  console.log('[RemoteScoreServer] Chemin des fichiers distants:', remotePath);
  console.log('[RemoteScoreServer] NODE_ENV:', process.env.NODE_ENV || 'production');
  console.log('[RemoteScoreServer] __dirname:', __dirname);
  console.log('[RemoteScoreServer] process.resourcesPath:', process.resourcesPath);

  // Vérifier que le dossier existe
  try {
    const fs = require('fs');
    if (fs.existsSync(remotePath)) {
      console.log('[RemoteScoreServer] Dossier distant trouvé ✓');
      const files = fs.readdirSync(remotePath);
      console.log('[RemoteScoreServer] Fichiers disponibles:', files);
    } else {
      console.error('[RemoteScoreServer] ERREUR: Dossier distant non trouvé!', remotePath);
    }
  } catch (err) {
    console.error('[RemoteScoreServer] ERREUR lors de la vérification du dossier:', err);
  }

  // Pages HTML : toujours via la mémoire (nonce CSP), jamais en fichier statique brut
  ctx.app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = req.path === '/' ? 'index.html' : path.posix.basename(req.path);
    if (
      (req.path === '/' || req.path.endsWith('.html')) &&
      ctx.htmlFiles.has(name) &&
      path.posix.dirname(req.path) === '/'
    ) {
      return ctx.sendHtmlFromMemory(name, res);
    }
    next();
  });
  // Assets versionnés (cache immuable) et JS/CSS communs pré-compressés
  ctx.app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const item = ctx.assets.get(req.path) ?? ctx.staticFiles.get(req.path);
    if (!item) return next();
    return sendStored(req, res, item);
  });
  // Polices embarquées (Inter, #1153) : cache long
  ctx.app.use(
    '/fonts',
    express.static(path.join(remotePath, 'fonts'), { maxAge: '365d', immutable: true })
  );
  ctx.app.use(express.static(remotePath));

  ctx.app.use((req, res, next) => {
    console.log(`[RemoteScoreServer] ${req.method} ${req.url} - ${new Date().toISOString()}`);
    // Restreindre CORS au réseau local uniquement (même logique que Socket.IO)
    const origin = req.headers.origin;
    if (origin && isLocalNetworkOrigin(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  console.log('[RemoteScoreServer] Middleware configuré ✓');
}
