#!/usr/bin/env node
/**
 * Inventaire des textes en dur des pages distantes (src/remote/*.html) (#1213).
 * Liste, par page, les textes visibles et attributs (placeholder, title, aria-label)
 * qui n'ont pas de balise data-i18n*. Usage : node scripts/inventory-remote-i18n.js [--json]
 * Heuristique (DOM jsdom) : sert de base au passage en data-i18n, pas de contrôle bloquant.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dir = path.join(__dirname, '..', 'src', 'remote');
const hasLetters = s => /\p{L}{2,}/u.test(s);

function scanPage(html) {
  // Parsing DOM (jsdom), pas de nettoyage HTML par regex (CodeQL)
  const { document, NodeFilter } = new JSDOM(html).window;
  document.querySelectorAll('script, style, template').forEach(n => n.remove());
  const found = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.replace(/\s+/g, ' ').trim();
    if (!text || !hasLetters(text) || /^\{\{.*\}\}$/.test(text)) continue;
    if (node.parentElement && node.parentElement.hasAttribute('data-i18n')) continue;
    found.push({ kind: 'text', value: text });
  }
  for (const el of document.querySelectorAll('[placeholder], [title], [aria-label]')) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = el.getAttribute(attr);
      if (value && hasLetters(value) && !el.hasAttribute(`data-i18n-${attr}`))
        found.push({ kind: attr, value });
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
