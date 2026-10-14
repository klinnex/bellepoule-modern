#!/usr/bin/env node
/**
 * Traductions sans toucher au JSON (#1079). Voir docs/TRANSLATING.md.
 *
 *   npm run i18n:export -- <langue>            → translations/<langue>.csv
 *   npm run i18n:import -- <fichier.csv>       → met à jour src/renderer/locales/<langue>.json
 */
const fs = require('fs');
const path = require('path');
const { toCsv, applyCsv } = require('./lib/i18nCsv');

const ROOT = path.join(__dirname, '..');
const LOCALES = path.join(ROOT, 'src', 'renderer', 'locales');
const OUT_DIR = path.join(ROOT, 'translations');

const readLocale = lang => JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), 'utf8'));
const available = () =>
  fs.readdirSync(LOCALES).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));

const [command, arg] = process.argv.slice(2);

if (command === 'export') {
  if (!arg || arg === 'fr' || !available().includes(arg)) {
    console.error(`Usage : npm run i18n:export -- <langue>  (${available().filter(l => l !== 'fr').join(', ')})`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${arg}.csv`);
  fs.writeFileSync(file, toCsv(readLocale('fr'), readLocale(arg), arg));
  console.log(`✓ ${path.relative(ROOT, file)} — à remplir colonne « ${arg} », puis npm run i18n:import -- ${path.relative(ROOT, file)}`);
} else if (command === 'import') {
  if (!arg || !fs.existsSync(arg)) {
    console.error('Usage : npm run i18n:import -- <fichier.csv>');
    process.exit(1);
  }
  const csv = fs.readFileSync(arg, 'utf8');
  const header = csv.replace(/^﻿/, '').split(/\r?\n/)[0].split(/[,;]/);
  const lang = (header[2] || '').trim();
  if (!available().includes(lang) || lang === 'fr') {
    console.error(`Langue « ${lang} » inconnue (en-tête attendu : key,fr,<langue>).`);
    process.exit(1);
  }
  const { locale, changed, unknown } = applyCsv(readLocale('fr'), readLocale(lang), csv);
  const target = path.join(LOCALES, `${lang}.json`);
  const original = fs.readFileSync(target, 'utf8');
  const out = JSON.stringify(locale, null, 2) + (original.endsWith('\n') ? '\n' : '');
  fs.writeFileSync(target, out);
  console.log(`✓ ${lang} : ${changed.length} traduction(s) mise(s) à jour.`);
  if (unknown.length) console.warn(`⚠ ${unknown.length} clé(s) inconnue(s) ignorée(s) : ${unknown.join(', ')}`);
  console.log('Ensuite : npm run check:i18n && npm run docs:i18n');
} else {
  console.error('Usage : node scripts/i18n-csv.js export <langue> | import <fichier.csv>');
  process.exit(1);
}
