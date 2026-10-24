#!/usr/bin/env node
/**
 * Inventaire des textes en dur des pages distantes (src/remote/*.html) (#1213).
 * Liste, par page, les textes visibles et attributs (placeholder, title, aria-label)
 * qui n'ont pas de balise data-i18n*. Usage : node scripts/inventory-remote-i18n.js [--json]
 * Heuristique (regex) : sert de base au passage en data-i18n, pas de contrôle bloquant.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'remote');
const hasLetters = s => /\p{L}{2,}/u.test(s);

function scanPage(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const found = [];
  // Texte entre balises, en suivant la balise ouvrante la plus proche
  const textRe = /<([a-z][a-z0-9]*)([^>]*)>([^<]+)/gi;
  let m;
  while ((m = textRe.exec(body))) {
    const text = m[3]
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || !hasLetters(text) || /^\{\{.*\}\}$/.test(text)) continue;
    if (/data-i18n(?!-)/.test(m[2])) continue;
    found.push({ kind: 'text', value: text });
  }
  const attrRe = /<[a-z][^>]*>/gi;
  while ((m = attrRe.exec(body))) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const a = new RegExp(`\\s${attr}="([^"]+)"`, 'i').exec(m[0]);
      if (a && hasLetters(a[1]) && !new RegExp(`data-i18n-${attr}=`).test(m[0]))
        found.push({ kind: attr, value: a[1] });
    }
  }
  return found;
}

const result = {};
for (const f of fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.html'))
  .sort()) {
  const html = fs.readFileSync(path.join(dir, f), 'utf-8');
  result[f] = { translated: (html.match(/data-i18n/g) || []).length, hardcoded: scanPage(html) };
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  let total = 0;
  for (const [f, r] of Object.entries(result)) {
    total += r.hardcoded.length;
    console.log(`${f}\t${r.hardcoded.length} en dur / ${r.translated} balisés`);
    for (const h of r.hardcoded) console.log(`    [${h.kind}] ${h.value}`);
  }
  console.log(`\nTotal : ${total} textes en dur`);
}
