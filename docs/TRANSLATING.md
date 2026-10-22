# Traduire BellePoule Modern

Aucune connaissance technique requise : on traduit dans un tableur.

État des traductions par langue : [I18N.md](I18N.md).

## Application (`src/renderer/locales/*.json`)

1. Générer la feuille de la langue (`br`, `ca`, `de`, `en`, `es`, `zh-HK`) :

   ```bash
   npm run i18n:export -- br      # → translations/br.csv
   ```

2. Ouvrir `translations/br.csv` dans LibreOffice Calc ou Excel (UTF-8).
   Colonnes : `key` (ne pas modifier), `fr` (référence), `br` (à remplir / corriger).
   - Garder les variables telles quelles : `{{name}}`, `{{count}}`…
   - Garder les emojis en tête de libellé (📋, ⚠️…).
   - Cellule vide = traduction actuelle conservée.
3. Enregistrer en CSV (séparateur virgule ou point-virgule).
4. Réintégrer :

   ```bash
   npm run i18n:import -- translations/br.csv
   npm run check:i18n && npm run docs:i18n
   ```

   Seules les valeurs changées sont modifiées dans `br.json` (ordre des clés conservé).
   Les clés inconnues sont signalées et ignorées.

Sans environnement de développement : envoyer le CSV rempli en pièce jointe d'une
issue GitHub, un mainteneur l'importe.

## Tablettes et écrans (`src/remote/i18n.js`)

Langues : `fr`, `en`, `zh-HK`. Éditer directement le bloc de la langue dans
`src/remote/i18n.js` (clé → texte). Toute clé `data-i18n` utilisée par une page
doit exister côté `fr` (contrôle `npm run check:i18n-doc`).

## Vérifier à l'écran

Pseudo-locale de debug : dans la console de l'application,
`localStorage.setItem('bellepoule-pseudo-locale', '1')` puis recharger. Chaque
texte traduit s'affiche `[!! Ŝçöŕé !!]` ; un texte affiché normalement est
une chaîne en dur à traduire (`node scripts/check-quality-ratchet.js --list jsxText`).
Désactiver : `localStorage.removeItem('bellepoule-pseudo-locale')`.
