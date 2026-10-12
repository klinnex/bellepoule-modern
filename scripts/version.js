#!/usr/bin/env node
/**
 * Gestion du versionnage — règles : docs/VERSIONING.md
 *
 * Source de vérité : version.json  { version: "X.Y.Z", build: N, channel, date }
 *
 * Usage :
 *   node scripts/version.js show
 *   node scripts/version.js bump <major|minor|patch|X.Y.Z>
 *       → change la version SemVer (version.json + package.json + package-lock.json)
 *   node scripts/version.js next-build
 *       → CI dev uniquement : incrémente le compteur de build dans version.json
 *   node scripts/version.js apply <dev|stable> [--build N]
 *       → CI : écrit le canal dans version.json et la version complète dans
 *         package.json (utilisée par electron-builder pour nommer les fichiers).
 *         Ne pas committer le résultat.
 *   node scripts/version.js meta <dev|stable> [--github-output]
 *       → affiche (ou écrit dans $GITHUB_OUTPUT) version, build, tag, titre…
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VERSION_PATH = path.join(ROOT, 'version.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const CHANNELS = ['dev', 'stable'];

function parseSemver(v) {
  const m = SEMVER.exec(v);
  if (!m) throw new Error(`Version invalide "${v}" (attendu X.Y.Z)`);
  return m.slice(1, 4).map(Number);
}

function bumpVersion(current, kind) {
  if (SEMVER.test(kind)) return kind;
  const [major, minor, patch] = parseSemver(current);
  switch (kind) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Type de bump inconnu "${kind}" (major|minor|patch|X.Y.Z)`);
  }
}

/** Nommage des versions, tags et releases pour un canal donné. */
function releaseMeta({ version, build }, channel) {
  parseSemver(version);
  if (!CHANNELS.includes(channel)) throw new Error(`Canal inconnu "${channel}" (dev|stable)`);
  const fullVersion = channel === 'dev' ? `${version}-dev.${build}` : version;
  const title =
    channel === 'dev'
      ? `🧪 BellePoule Modern ${fullVersion} (Build #${build})`
      : `🚀 BellePoule Modern ${fullVersion} (Build #${build})`;
  return { version, build, channel, fullVersion, tag: `v${fullVersion}`, title };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function readVersion() {
  const data = readJson(VERSION_PATH);
  return {
    version: data.version,
    build: Number(data.build) || 0,
    channel: data.channel || 'dev',
    date: data.date,
  };
}

function writeVersion(data) {
  writeJson(VERSION_PATH, {
    version: data.version,
    build: data.build,
    channel: data.channel,
    date: data.date,
  });
}

function setPackageVersion(fullVersion) {
  const pkg = readJson(PACKAGE_PATH);
  pkg.version = fullVersion;
  writeJson(PACKAGE_PATH, pkg);
  if (fs.existsSync(LOCK_PATH)) {
    const lock = readJson(LOCK_PATH);
    lock.version = fullVersion;
    if (lock.packages && lock.packages['']) lock.packages[''].version = fullVersion;
    writeJson(LOCK_PATH, lock);
  }
}

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(argv) {
  const [cmd, ...args] = argv;
  const current = readVersion();

  switch (cmd) {
    case 'show':
    case undefined:
      console.log(JSON.stringify(current, null, 2));
      return;

    case 'bump': {
      const next = bumpVersion(current.version, args[0]);
      const [a, b, c] = parseSemver(next);
      const [x, y, z] = parseSemver(current.version);
      if (a * 1e12 + b * 1e6 + c <= x * 1e12 + y * 1e6 + z) {
        throw new Error(`La nouvelle version ${next} doit être > ${current.version}`);
      }
      writeVersion({ ...current, version: next });
      setPackageVersion(next);
      console.log(`Version ${current.version} → ${next}`);
      return;
    }

    case 'next-build': {
      const build = current.build + 1;
      writeVersion({ ...current, build, channel: 'dev', date: new Date().toISOString() });
      console.log(`Build #${build}`);
      return;
    }

    case 'apply': {
      const channel = args[0];
      const build = argValue(args, '--build') ? Number(argValue(args, '--build')) : current.build;
      const meta = releaseMeta({ version: current.version, build }, channel);
      writeVersion({ ...current, build, channel, date: current.date || new Date().toISOString() });
      setPackageVersion(meta.fullVersion);
      console.log(`Appliqué : ${meta.fullVersion} (canal ${channel})`);
      return;
    }

    case 'meta': {
      const meta = releaseMeta(current, args[0]);
      const lines = [
        `version=${meta.version}`,
        `build=${meta.build}`,
        `channel=${meta.channel}`,
        `full_version=${meta.fullVersion}`,
        `tag=${meta.tag}`,
        `title=${meta.title}`,
      ];
      if (args.includes('--github-output') && process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
      }
      console.log(lines.join('\n'));
      return;
    }

    default:
      throw new Error(`Commande inconnue "${cmd}"`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}

module.exports = { bumpVersion, releaseMeta, parseSemver };
