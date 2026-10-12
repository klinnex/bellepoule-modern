#!/usr/bin/env node
/**
 * Garde-fou taille bundle renderer. Échoue si le total JS (hors sourcemaps)
 * dépasse le budget. Seuil calé avec ~25% de marge sur la taille mesurée
 * en juillet 2026 (react.js + runtime.js + main.js + vendors.js ≈ 7.9 MiB).
 */
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist', 'renderer');
const BUDGET_BYTES = 10 * 1024 * 1024; // 10 MiB

function walkJsFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsFiles(fullPath));
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.map.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

if (!fs.existsSync(DIST_DIR)) {
  console.error(
    `Dossier introuvable: ${DIST_DIR}. Lancer "npm run build:renderer" avant ce script.`
  );
  process.exit(1);
}

const jsFiles = walkJsFiles(DIST_DIR);
const sizes = jsFiles
  .map(f => ({ file: path.relative(DIST_DIR, f), bytes: fs.statSync(f).size }))
  .sort((a, b) => b.bytes - a.bytes);

const totalBytes = sizes.reduce((sum, f) => sum + f.bytes, 0);
const toMiB = b => (b / 1024 / 1024).toFixed(2);

console.log('Fichiers JS les plus lourds :');
for (const { file, bytes } of sizes.slice(0, 10)) {
  console.log(`  ${toMiB(bytes)} MiB  ${file}`);
}
console.log(`\nTotal JS : ${toMiB(totalBytes)} MiB (budget ${toMiB(BUDGET_BYTES)} MiB)`);

if (totalBytes > BUDGET_BYTES) {
  console.error(
    `\n✗ Bundle trop lourd : ${toMiB(totalBytes)} MiB > budget ${toMiB(BUDGET_BYTES)} MiB.`
  );
  process.exit(1);
}

console.log('\n✓ Bundle dans le budget.');
