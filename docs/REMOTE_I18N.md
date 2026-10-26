# Traduction des pages distantes (plan, #1213)

Les pages `src/remote/*.html` chargent `/i18n.js` (langues : **fr, en, de, es, ca, br, zh-HK**, comme l'application). La langue suit celle de l'application.

Traductions : un fichier par langue, `src/remote/i18n/<langue>.js` ; moteur (`T()`, `data-i18n*`) : `src/remote/i18n.js`. Le serveur distant sert `/i18n.js` = fichiers de langue + moteur concaténés (`src/main/remote/i18nBundle.ts`). Ajouter une langue = ajouter son fichier.

## Plan

| Étape | Contenu                                                                                                                             | État                                          |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1     | Inventaire des textes en dur par page : `node scripts/inventory-remote-i18n.js`                                                     | fait                                          |
| 2     | Passage en `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria-label` ou `T()` (page par page, PR séparées) | fait                                          |
| 3     | Ajout de de / es / ca / br : fichiers `i18n/<langue>.js`                                                                            | fait                                          |
| 4     | Contrôle CI de complétude des langues : `npm run check:i18n` (clés + paramètres `{{x}}` vs `fr.js`)                                 | fait                                          |

## Inventaire (étape 1)

Textes visibles et attributs `placeholder` / `title` / `aria-label` sans balise, dans le HTML statique (heuristique). Les textes construits en JavaScript (`innerHTML`, `T('clé')` manquantes, messages d'erreur) ne sont pas comptés : ils sont à recenser pendant l'étape 2.

| Page                                            |    En dur | Balisés |
| ----------------------------------------------- | --------: | ------: |
| arena.html                                      |         5 |      20 |
| referee.html                                    |         3 |      62 |
| pool.html                                       |         0 |      17 |
| public.html                                     |         3 |      12 |
| dashboard.html (non servie)                     |        11 |      10 |
| teamReferee.html                                |         5 |       9 |
| pool-ocr.html                                   |         4 |      18 |
| kiosk.html                                      |         4 |      52 |
| login.html                                      |         2 |       5 |
| overlay-config.html                             |         2 |      31 |
| teamArena.html                                  |         2 |       3 |
| checkin / overlay / register / tireur / trainer | 1 chacune |       — |
| lobby / matchs                                  |         0 |       — |

Total : 102 textes en dur à l'étape 1 (arena et public : reste `<title>` posé par JS et « VS »). Détail : `node scripts/inventory-remote-i18n.js`.

## Tester la traduction actuelle

Paramètres → langue **English** → démarrer la saisie distante → ouvrir `/login`, `/areneN`, `/areneN/arbitre`, `/kiosk` (recharger la page si déjà ouverte).
