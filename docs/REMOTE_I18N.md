# Traduction des pages distantes (plan, #1213)

Les pages `src/remote/*.html` utilisent `src/remote/i18n.js` (langues : **fr, en, zh-HK** ; de / es / ca / br retombent sur le français). La langue suit celle de l'application.

## Plan

| Étape | Contenu                                                                                                    | État    |
| ----- | ---------------------------------------------------------------------------------------------------------- | ------- |
| 1     | Inventaire des textes en dur par page : `node scripts/inventory-remote-i18n.js`                            | fait    |
| 2     | Passage en `data-i18n` / `data-i18n-placeholder` / `data-i18n-title` ou `T()` (page par page, PR séparées) | à faire |
| 3     | Ajout de de / es / ca / br dans `i18n.js`                                                                  | à faire |
| 4     | Contrôle CI de complétude des langues (comme `check:i18n`)                                                 | à faire |

## Inventaire (étape 1)

Textes visibles et attributs `placeholder` / `title` / `aria-label` sans balise, dans le HTML statique (heuristique). Les textes construits en JavaScript (`innerHTML`, `T('clé')` manquantes, messages d'erreur) ne sont pas comptés : ils sont à recenser pendant l'étape 2.

| Page                                            |    En dur | Balisés |
| ----------------------------------------------- | --------: | ------: |
| arena.html                                      |        21 |       4 |
| referee.html                                    |        23 |      42 |
| pool.html                                       |        12 |       5 |
| public.html                                     |        11 |       4 |
| dashboard.html (non servie)                     |        11 |      10 |
| teamReferee.html                                |         5 |       9 |
| pool-ocr.html                                   |         4 |      18 |
| kiosk.html                                      |         4 |      52 |
| login.html                                      |         2 |       5 |
| overlay-config.html                             |         2 |      31 |
| teamArena.html                                  |         2 |       3 |
| checkin / overlay / register / tireur / trainer | 1 chacune |       — |
| lobby / matchs                                  |         0 |       — |

Total : 102 textes en dur. Détail : `node scripts/inventory-remote-i18n.js`.

## Tester la traduction actuelle

Paramètres → langue **English** → démarrer la saisie distante → ouvrir `/login`, `/areneN`, `/areneN/arbitre`, `/kiosk` (recharger la page si déjà ouverte).
