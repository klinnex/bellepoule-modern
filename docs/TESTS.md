# Tests opérationnels

> ⚠️ Fichier **généré** par `npm run docs:tests` (`scripts/generate-tests-doc.js`).
> Ne pas éditer à la main : modifier le script pour la partie fixe, les fichiers
> de test pour l'inventaire. Régénéré par la CI à chaque push sur `dev`
> (commit `🔖 Dev Build`) : ne pas le committer dans les PR (évite les conflits).

## Contrôles qualité en CI

Workflow réutilisable `.github/workflows/quality.yml` (`workflow_call`), appelé par
`.github/workflows/pr-quality.yml` (PR vers `dev`, à rendre requis dans la
protection de branche), `build-dev.yml` (push sur `dev`) et `build.yml`
(push sur `main`). Les builds par plateforme dépendent de ce job. Le job `nix-build` (mêmes déclencheurs) build le paquet
Nix de `flake.nix`. Ce n'est pas une dépendance des builds par plateforme.

| Étape | Commande | Échoue si |
|---|---|---|
| Typage | `npm run type-check` | erreur TypeScript (`tsc --noEmit`, mode strict) |
| i18n | `npm run check:i18n` | clé manquante / en trop vs `fr.json`, ou vs `src/remote/i18n/fr.js` pour les pages distantes (paramètres `{{x}}` compris) ; avertit sans échouer des libellés > 1,6x le français (`scripts/check-i18n-completeness.js`) |
| Doc i18n | `npm run check:i18n-doc` | `docs/I18N.md` pas à jour, ou clé `data-i18n` d'une page distante absente de `src/remote/i18n.js` |
| Doc Socket.IO | `npm run check:socket-doc` | `docs/SOCKET_EVENTS.md` pas à jour, ou événement émis par une page sans écouteur serveur |
| Cliquet qualité | `npm run check:quality` | hausse du nombre de textes JSX en dur, `any`, `console.*`, `style={{…}}` (#1157), `fontSize` en px (#1156), locale `'fr'` en dur (#1160), messages d'erreur serveur en clair (#1159), emoji en tête de texte d’interface ou de libellé de locale, ou emoji dans les pages distantes `src/remote` (#1532), ou couleur hexadécimale en dur dans les pages distantes `src/remote` (hors `tokens.css`, #1538), ou fichier source > 1500 lignes (exceptions plafonnées, #1155) vs `scripts/quality-baseline.json` (`--update` pour verrouiller une baisse) |
| Build Nix | `nix build .#default` (job `nix-build`) | le paquet `flake.nix` ne build pas : `npmDepsHash` périmé vs `package-lock.json`, dépendance native cassée, etc. |
| Tests unitaires | `npm run test:run` | un test Vitest échoue |
| Budget bundle | `npm run build:renderer` + `node scripts/check-bundle-size.js` | JS renderer : initial > 2.75 MiB, un chunk à la demande > 1.25 MiB, total > 6 MiB, ou aucun chunk à la demande (`scripts/check-bundle-size.js`) |

Hors CI (manuel) : `npm run lint`, `npm run format:check`, `npm run test:coverage`,
`npm run test:e2e`.

Sécurité : `.github/workflows/codeql.yml` (CodeQL JS/TS, PR vers `dev` + hebdo) et `security.yml` (`npm audit --omit=dev` non bloquant + SBOM CycloneDX), Dependabot (`.github/dependabot.yml`).

Revue de code automatique : `.github/workflows/claude-code-review.yml` sur les PR.

## Tests unitaires — Vitest

- Config : `vitest.config.ts` — `globals: true`, environnement `node` par défaut.
- Fichiers : `src/**/*.{test,spec}.{ts,tsx}`, co-localisés avec le code testé.
- Composants / hooks React : pragma `// @vitest-environment jsdom` en tête de fichier.
- Couverture (`npm run test:coverage`, v8) : `src/**/*.ts` hors `src/main`,
  `src/renderer`, `src/remote`.

```bash
npm test                 # watch
npm run test:run         # exécution unique (CI)
npx vitest run src/shared/utils/poolCalculations.test.ts   # un fichier
```

## Tests E2E — Playwright

- Config : `playwright.config.ts` — `testDir: ./e2e`, projets chromium, firefox,
  webkit, Mobile Chrome, Mobile Safari ; 2 retries et 1 worker en CI.
- `webServer` : `npm run dev`, attendu sur `baseURL` `http://localhost:3000`.
  ⚠️ Le dev server Webpack écoute sur le port **8066** : aligner `baseURL`/`url`
  avant de lancer la suite.
- **Non exécutés en CI.**
- Beaucoup de scénarios appellent `test.skip()` à l'exécution si l'état requis
  (compétition existante, poule, tableau…) est absent.

```bash
npm run test:e2e         # tous navigateurs
npm run e2e:debug        # mode debug
npx playwright test --project=chromium e2e/pools.spec.ts
```

## Simulateur et benchmarks

- `src/shared/utils/tournamentSimulator.ts` : joue une compétition complète
  (poules → tableau → classement) avec des scores aléatoires valides, déterministe
  pour une graine donnée. Testé de bout en bout (200 tireurs) dans
  `tournamentSimulator.test.ts`.
- `npm run bench` (`vitest bench`, fichiers `*.bench.ts`) : classement de poules,
  placement / création / classement de tableau, tournoi complet. **Non exécuté en CI**
  (mesures trop bruitées sur les runners partagés) : lancer avant/après une
  optimisation.

## Maintenir cette documentation

1. Ajouter / modifier un test.
2. Ne pas committer `docs/TESTS.md` : la CI `build-dev.yml` le régénère au push sur
   `dev` (`npm run docs:tests` reste utilisable en local pour consulter l'inventaire).

## Synthèse

| Domaine | Fichiers | Tests |
|---|---:|---:|
| `src/shared/utils/` | 50 | 663 |
| `src/shared/services/` | 8 | 92 |
| Feature `analytics` (`src/features/analytics/`) | 2 | 12 |
| Feature `bracket` (`src/features/bracket/`) | 2 | 26 |
| Feature `competition` (`src/features/competition/`) | 3 | 20 |
| Feature `doubleelimination` (`src/features/doubleelimination/`) | 1 | 13 |
| Feature `latefencers` (`src/features/latefencers/`) | 1 | 14 |
| Feature `matchAuditLog` (`src/features/matchAuditLog/`) | 1 | 9 |
| Feature `pdfTemplates` (`src/features/pdfTemplates/`) | 1 | 6 |
| Feature `penalties` (`src/features/penalties/`) | 3 | 36 |
| Feature `pools` (`src/features/pools/`) | 3 | 32 |
| Feature `rapieres` (`src/features/rapieres/`) | 7 | 49 |
| Feature `teams` (`src/features/teams/`) | 7 | 53 |
| `src/database/` | 6 | 138 |
| `src/main/` | 53 | 424 |
| `src/renderer/services/` | 8 | 51 |
| `src/renderer/hooks/` | 27 | 132 |
| `src/renderer/components/` | 83 | 399 |
| E2E Playwright (`e2e/`) | 10 | 39 |
| `src/remote/` | 55 | 354 |
| `src/renderer/contexts/` | 1 | 4 |
| `src/renderer/styles/` | 5 | 17 |
| `src/renderer/utils/` | 1 | 1 |
| **Total** | **338** | **2584** |

Unitaires : 328 fichiers, 2545 tests. E2E : 10 fichiers, 39 tests (comptage statique ; `it.each` / `describe.each` comptent pour 1).

## Inventaire détaillé

### `src/shared/utils/`

<details>
<summary><code>src/shared/utils/actionableError.test.ts</code> — 3 tests</summary>

- **classifyError**
  - %s -\> %s _(each)_
  - chaque cause a une clé i18n errors.hint\_\*
- **actionableMessage**
  - compose base et conseil

</details>

<details>
<summary><code>src/shared/utils/blackCardRanking.test.ts</code> — 10 tests</summary>

- **isBlackCarded**
  - exclusion avec motif black\_card uniquement
- **applyBlackCardRanking**
  - sans carton noir : liste inchangée
  - le 2e exclu : 3e-\>2e, 4e-\>3e, 5e-\>4e, exclu en bas sans rang
  - le vainqueur exclu : tous remontent
  - le dernier exclu : les autres gardent leur rang
  - ex aequo 3e derrière un exclu : départagés par le classement du tableau
  - ex aequo 3e AU-DESSUS de l'exclu : inchangés
  - plusieurs cartons noirs
  - idempotent
  - exclu simple (sans carton noir) : rang conservé

</details>

<details>
<summary><code>src/shared/utils/bulkImport.test.ts</code> — 32 tests</summary>

- **parseCSV**
  - parse une ligne simple
  - parse plusieurs lignes
  - gère les champs entre guillemets
  - gère les guillemets doubles à l'intérieur des champs
  - trim les espaces
  - retourne un tableau vide pour une chaîne vide
- **parseExcel**
  - parse du contenu TSV
  - trim les cellules
- **autoDetectMapping**
  - détecte les colonnes Club, Licence, Nation, Classement, Sexe
  - détecte les colonnes ranking et gender anglais
  - utilise 0/1 comme fallback si non détecté
  - retourne un objet avec toutes les clés requises
- **importFencers**
  - importe des tireurs valides
  - mappe correctement les champs
  - gère les genres français (H/F)
  - ignore les lignes vides
  - renvoie une erreur pour données vides
  - signale les erreurs de validation (lastName manquant)
  - signale les erreurs de validation (firstName manquant)
  - signale une erreur pour un classement invalide
  - utilise FRA comme nationalité par défaut
  - fonctionne sans en-tête (hasHeader=false) avec mapping numérique
  - importe plusieurs tireurs en reportant les erreurs ligne par ligne
- **generateImportTemplate**
  - retourne un template CSV non vide
  - contient les colonnes standard
- **detectFileType**
  - détecte le CSV
  - détecte l'Excel (TSV)
  - retourne unknown si non reconnu
  - TSV prime sur CSV si les deux sont présents
- **bulkImportFencers**
  - importe depuis un CSV valide
  - importe depuis du TSV
  - détecte automatiquement le type si non fourni

</details>

<details>
<summary><code>src/shared/utils/cardSystem.test.ts</code> — 40 tests</summary>

- **determineCardType - Système d'escalade FFE**
  - **Groupe 1: Blanc → Jaune → Jaune**
    - 1ère faute Groupe 1 = Carton BLANC (0 point)
    - 2ème faute Groupe 1 = Carton JAUNE (+1 point)
    - 3ème faute Groupe 1 = Carton JAUNE (+1 point)
    - 4ème faute Groupe 1 = Carton JAUNE (+1 point, pas de Noir)
  - **Groupe 2: Jaune → Rouge → Rouge**
    - 1ère faute Groupe 2 = Carton JAUNE (+1 point)
    - 2ème faute Groupe 2 = Carton ROUGE (+1 point)
    - 3ème faute Groupe 2 = Carton ROUGE (+1 point, pas de Noir)
  - **Groupe 3: Rouge → Exclusion**
    - 1ère faute Groupe 3 = Carton ROUGE (+1 point)
    - 2ème faute Groupe 3 = Carton NOIR (exclusion)
  - **Groupe 4: Exclusion immédiate**
    - Refus de combattre = Carton NOIR direct
    - Tricherie = Carton NOIR direct
    - Anti-sportif = Carton NOIR direct
  - **Isolation entre groupes**
    - Les cartons d'un groupe n'affectent pas les autres groupes
- **createCard**
  - crée un carton avec un ID unique
  - associe correctement le match et le tireur
  - définit le groupe correct pour chaque raison
  - ajoute un timestamp
- **getReasonsByGroup**
  - retourne les 4 groupes
  - Groupe 1 contient les bonnes raisons
  - Groupe 4 contient les exclusions directes
- **getCardsForFencer**
  - filtre correctement les cartons par tireur
  - retourne un tableau vide si pas de cartons
- **isFencerExcluded**
  - retourne true si carton noir reçu
  - retourne false si pas de carton noir
  - retourne false pour un tireur sans cartons
- **Labels français**
  - toutes les raisons ont un label
  - tous les groupes ont un label
  - les labels sont en français
- **Dissociation par arme**
  - **getWeaponCardConfig**
    - retourne une config pour chaque arme
    - chaque arme a une config indépendante (pas de référence partagée)
  - **getAvailableReasons**
    - retourne toutes les raisons pour le Sabre Laser
    - retourne des raisons pour l'épée
  - **getReasonsByGroupForWeapon**
    - retourne les 4 groupes pour le Laser
    - retourne les 4 groupes pour l'épée
  - **determineCardType avec weapon param**
    - comportement identique avec ou sans weapon (config actuelle identique)
    - scoreImpact yellow reflète la config arme
    - scoreImpact personnalisable par arme
    - raison non applicable retourne BLANC (0 point)
  - **createCard avec weapon param**
    - crée un carton avec l'arme courante
    - reste compatible sans weapon param

</details>

<details>
<summary><code>src/shared/utils/categoryLabel.test.ts</code> — 4 tests</summary>

- **categoryLabel (#931)**
  - traduit les codes en libellés officiels
  - laisse un code inconnu tel quel
- **weaponLabel / genderLabel**
  - traduit les codes arme et genre
  - laisse un code inconnu tel quel

</details>

<details>
<summary><code>src/shared/utils/conflictResolution.test.ts</code> — 20 tests</summary>

- **resolveConflict**
  - **Cas sans conflit**
    - retourne local si remote est null
    - retourne remote si local est null
    - retourne local si les deux sont null
    - retourne local si timestamps identiques
  - **Résolution de conflits**
    - préfère la version la plus récente (local)
    - préfère la version la plus récente (remote)
  - **Gestion des timestamps manquants**
    - gère local sans timestamp
    - gère remote sans timestamp
    - préfère local si aucun timestamp
- **mergeActionsById**
  - fusionne des listes sans doublons
  - garde la version la plus récente en cas de doublon
  - garde la version locale si plus récente
  - gère les listes vides
  - préserve tous les items sans timestamp en cas de conflit
- **detectConflicts**
  - détecte les items uniquement locaux
  - détecte les items uniquement distants
  - détecte les conflits (timestamps différents)
  - ne détecte pas de conflit si timestamps identiques
  - gère les listes vides
  - cas complexe avec tous types

</details>

<details>
<summary><code>src/shared/utils/countries.test.ts</code> — 8 tests</summary>

- **countries**
  - codes uniques et bien formés
  - drapeau emoji depuis code CIO ou ISO2
  - nom localisé et repli sur le code
  - liste triée avec drapeaux
  - formatNationality
- **countries - drapeaux SVG et recherche**
  - flagIso depuis CIO ou ISO2
  - un SVG embarqué existe pour chaque pays
  - findCountryIndex : premier pays commençant par la saisie

</details>

<details>
<summary><code>src/shared/utils/customFormulaSettings.test.ts</code> — 10 tests</summary>

- **customFormulaSettings (#1125)**
  - dérive score max, chrono, tours et 3e place de la formule
  - la formule prime sur les réglages par défaut (arme CUSTOM seulement)
  - vainqueurs de poule → poolWinnersOnly
  - règles de qualification par tour et vers le tableau
  - nombre de qualifiés
  - applique la coupure au classement du tableau, égalités retenues
  - règles armes modernes choisies dans la formule : repos dérivé (défaut 60 s)
  - usesModernRules : E/F/S toujours, CUSTOM selon la formule, Laser jamais
  - usesModernRules : rapières en armes modernes par défaut, Sabre Laser si choisi (#1118)
  - resolveCompetitionSettings : rapières respecte thirdPlaceMatch du mode « Tableau normal » (#1441)

</details>

<details>
<summary><code>src/shared/utils/customRankingCalculator.test.ts</code> — 30 tests</summary>

- **buildRankingComparator**
  - sorts by vm\_ratio — higher ratio ranks first
  - returns 0 when tied on all criteria
  - falls through to secondary criterion when primary is tied
  - ignores disabled criteria
  - resolves direct\_bout via match map
  - sorts by touches\_received ascending (less is better)
  - sorts by initial\_ranking ascending
- **calculatePoolRankingCustom**
  - ranks 3 fencers by vm\_ratio
  - assigns ranks starting at 1
  - pushes forfeit fencers to end
  - pushes excluded fencers to end
  - handles pool with no completed matches
- **calculateOverallRankingCustom**
  - combines rankings from multiple pools
  - assigns overallRank to all entries
- **resolveAdvancement**
  - mode all — advances everyone
  - mode fixed\_count — advances exact count
  - mode percentage — rounds correctly
  - mode fixed\_bracket — rounds down to power of 2
  - mode fixed\_bracket — minimum is 2
  - excludes forfeit/abandoned from eligible pool
  - fixed\_count does not exceed eligible count
- **simulateFormula**
  - simulates a pool-only formula
  - simulates pool + DE formula
  - returns correct pool count for 32 fencers (5-7 per pool)
  - calculates match count as n\*(n-1)/2 per pool
  - warns when pool size is below 3
  - returns empty simulation for 0 fencers
  - computes bracket size as next power of 2
  - warns when too many byes
  - includes classification phase without match count

</details>

<details>
<summary><code>src/shared/utils/customTouchSystem.test.ts</code> — 8 tests</summary>

- **calculateMatchScoreCustom**
  - retourne 0-0 sans touche
  - additionne les points par zone et par tireur
  - attribue 1 point par défaut pour une zone inconnue
  - traite tout fencerId non-A comme B
- **isMatchCompleteCustom**
  - est complet quand A atteint le maxScore
  - est complet quand B atteint le maxScore
  - n’est pas complet en dessous du maxScore
- **getDefaultZones**
  - retourne 3 zones avec des points décroissants

</details>

<details>
<summary><code>src/shared/utils/departments.test.ts</code> — 3 tests</summary>

- **departments**
  - codes uniques, Corse et outre-mer inclus
  - normalise la saisie
  - nom et libellé

</details>

<details>
<summary><code>src/shared/utils/errorLogger.test.ts</code> — 7 tests</summary>

- **logError / getErrorLogs**
  - persiste une erreur avec message et stack
  - accepte une chaîne en entrée (sans stack)
- **logWarning / logInfo**
  - enregistre les niveaux warn et info
- **getErrorStats**
  - compte par niveau et liste les récents
- **clearErrorLogs**
  - supprime tous les logs
- **exportLogs**
  - exporte un JSON parsable
- **trim à 100 entrées**
  - ne conserve que les 100 dernières

</details>

<details>
<summary><code>src/shared/utils/fencerExport.test.ts</code> — 12 tests</summary>

- **exportFencersToFFF**
  - commence par l’en-tête FFF standard
  - met le nom en majuscules et convertit le genre
  - formate la date de naissance en DD/MM/YYYY
  - incrémente la position pour chaque tireur
  - laisse la date vide si absente
- **exportFencersToTXT**
  - inclut le titre souligné quand fourni
  - indique le nombre de tireurs
  - gère la liste vide
  - affiche le nom en majuscules et l’année de naissance
  - affiche le classement préfixé de # ou un tiret
  - clôt la liste par une ligne de fin
- **exportFencersToFFF — département (#1504)**
  - écrit le département après le classement

</details>

<details>
<summary><code>src/shared/utils/fencerStatsCalculator.test.ts</code> — 20 tests</summary>

- **FencerStatsCalculator.calculateFencerPoolStats**
  - **Calcul des victoires et défaites**
    - compte correctement les victoires
    - compte correctement les défaites
    - calcule le ratio de victoire
  - **Calcul des touches**
    - compte les touches données et reçues
    - gère le tireur comme fencerB
  - **Filtrage des matchs**
    - ignore les matchs non terminés
    - ignore les matchs où le tireur ne participe pas
  - **Cas spéciaux (abandon, forfait, exclusion)**
    - gère l'abandon (adversaire gagne)
    - gère le forfait adversaire (victoire automatique)
  - **Stats vides**
    - retourne des stats à zéro si pas de matchs
- **FencerStatsCalculator.calculateStatsBatch**
  - calcule les stats pour tous les tireurs
  - retourne une Map vide si pas de tireurs
- **FencerStatsCalculator.calculateFencerQuestStats**
  - **Calcul des points Quest**
    - attribue 4 pts Quest pour écart \>= 8
    - attribue 3 pts Quest pour écart 6-7
    - attribue 2 pts Quest pour écart 4-5
    - attribue 1 pt Quest pour écart \<= 3
  - **Cumul des points Quest**
    - cumule les points de plusieurs victoires
    - ne compte pas les défaites
  - **Stats vides**
    - retourne 0 si pas de matchs
    - retourne 0 si que des défaites

</details>

<details>
<summary><code>src/shared/utils/fileParser.test.ts</code> — 45 tests</summary>

- **parseSimpleTXTFile**
  - fichier vide → success=false, erreur
  - fichier avec seulement des lignes vides → success=false
  - ligne header (nom/prenom) ignorée en position 0
  - header contenant "club" ignoré
  - 2 tireurs séparés par ;
  - 2 tireurs séparés par virgule
  - séparateur tabulation
  - extraction gender M
  - extraction gender F
  - gender H interprété comme MALE
  - gender absent → MIXED par défaut
  - lastName toujours en majuscules
  - status NOT\_CHECKED\_IN par défaut
  - warning si aucun tireur trouvé
  - nationalité FRA par défaut
  - BOM UTF-8 supprimé correctement
- **parseFFEFile**
  - fichier vide → success=false, erreur
  - format standard NOM;PRENOM;SEXE;DATE;NATION;LIGUE;CLUB;LICENCE;CLASSEMENT
  - BOM UTF-8 supprimé
  - ligne malformée (moins de 2 champs) ignorée avec warning
  - gender F détecté
  - gender M détecté
  - tireur complet avec toutes les colonnes
  - plusieurs tireurs
  - status NOT\_CHECKED\_IN par défaut
  - lastName toujours en majuscules
- **parseXMLFile**
  - XML vide → success=false
  - XML sans balises Tireur → success=false
  - un tireur complet
  - tireur féminin détecté
  - plusieurs tireurs
  - tireur sans Nom ou Prenom ignoré
  - status NOT\_CHECKED\_IN par défaut
  - nation FRA par défaut si absente
- **issue #906 — import .fff**
  - aller-retour avec seulement nom/prénom
  - nom contenant « nom » / « x » (pas pris pour un en-tête)
  - fichier sans en-tête : premier tireur conservé
  - club contenant une virgule : champs non décalés
  - département : aller-retour export/import FFF (#1504)
  - département : lu après le classement, nationalité non confondue (#1504)
  - fichier FFE réel (Windows-1252, lignes de métadonnées)
  - decodeTextFile garde l’UTF-8 valide
  - .fff ouvert via « Importer XML » → parseur FFE
- **issue #906 — lignes .fff avec champs omis**
  - tireur conservé : %s _(each)_
  - section personnelle incomplète : club et licence non décalés

</details>

<details>
<summary><code>src/shared/utils/fileParser/fencerTemplate.test.ts</code> — 3 tests</summary>

- **buildFencerImportTemplate**
  - commence par un BOM UTF-8 et contient les colonnes attendues
  - est relu par le parseur d'import avec tous les champs de l'exemple
  - relit un champ entre guillemets contenant un séparateur (cas Excel)

</details>

<details>
<summary><code>src/shared/utils/fileParser/rankingParser.test.ts</code> — 4 tests</summary>

- **import de classement CSV à en-têtes (#1025)**
  - détecte l'en-tête quel que soit l'ordre des colonnes
  - affecte le classement par nom + prénom, sans accents ni casse
  - identifie en priorité par numéro de licence
  - ignore les lignes sans classement valide

</details>

<details>
<summary><code>src/shared/utils/forfeit.test.ts</code> — 19 tests</summary>

- **hasStartedPoolMatch**
  - aucun match commencé
  - match en cours ou joué
  - match clos par le forfait de l'adversaire : non commencé
  - ignore les matchs d'autres tireurs
- **checkInForfeitReason**
  - DNS si aucun match de poule commencé
  - pas DNS si un match est commencé
- **isDns / statusCode / poolEliminatedAt**
  - DNS uniquement pour un forfait ou médical marqué dns
  - sigle MED, F, X
  - motif de sortie dans « Éliminé en »
- **checkInStatusUpdate**
  - forfait à l’appel : DNS ou motif effacé
  - médical à l’appel : DNS ou motif effacé
  - réactivation : motif effacé
  - exclusion : motif inchangé
- **finalRankLabel**
  - DNS en poules (forfait ou médical)
  - DNF forfait/médical en poules
  - rang conservé pendant le tableau ou sans forfait
- **specialStatusPatch (#1418)**
  - médical / forfait : statut seul
  - exclusion : carton noir seulement si confirmé
- **finalRankLabel carton noir (#1418)**
  - rang null : « - »

</details>

<details>
<summary><code>src/shared/utils/gregPublication.test.ts</code> — 11 tests</summary>

- **buildGregFields (#1328)**
  - traduit une compétition individuelle en champs GREG
  - bascule sur les équipes, le sexe féminin et le statut terminé
  - mixte = H comme dans l'ancien BellePoule
  - refuse une compétition sans lieu (le serveur l'exige)
  - refuse les armes et catégories sans code GREG
  - mappe les catégories jeunes sur leur code M\<âge\>
- **gregFileName (#1328)**
  - produit un nom sûr avec extension .xml
- **toNativeRootTag (#1328)**
  - passe au pluriel pour les équipes
  - laisse le XML individuel intact
- **isGregUrl (#1331)**
  - reconnaît les adresses escrime-info.com comme l'ancien BellePoule
  - laisse passer les autres serveurs

</details>

<details>
<summary><code>src/shared/utils/i18nCsv.test.ts</code> — 5 tests</summary>

- **i18n CSV (#1079)**
  - exporte key, fr, langue avec échappement CSV et BOM
  - aller-retour : parse ce qu’il exporte
  - accepte le point-virgule (Excel FR) et les retours à la ligne dans une cellule
  - applique les traductions, garde l’ordre de la référence, ignore cellules vides et clés inconnues
  - refuse un CSV sans en-tête attendu

</details>

<details>
<summary><code>src/shared/utils/inlineScoreInput.test.ts</code> — 6 tests</summary>

- **parseInlineScoreInput**
  - vide
  - score numérique
  - V = score max (insensible à la casse)
  - V sans score max = invalide
  - W+chiffre = victoire de départage
  - formats invalides

</details>

<details>
<summary><code>src/shared/utils/localeFormat.test.ts</code> — 10 tests</summary>

- **formats selon la langue active (#1160)**
  - français par défaut
  - anglais : date jour/mois, point décimal
  - allemand : date à points, virgule décimale
  - cantonais (zh-HK) : date et heure localisées
  - langue inconnue : étiquette transmise telle quelle
  - italien : it-IT
  - portugais : pt-PT, russe : ru-RU
- **pluriels (Intl.PluralRules, #1160)**
  - 0 / 1 / 2 en français (0 est singulier) et en anglais
  - cantonais : une seule forme
  - clés candidates : catégorie, puis \_other, puis la clé nue

</details>

<details>
<summary><code>src/shared/utils/matchReplay.test.ts</code> — 7 tests</summary>

- **buildMatchReplay (#1074)**
  - trie par horodatage et calcule le temps écoulé
  - score\_change fait foi : les touches ne sont pas recomptées
  - score final seul : le score progresse avec les touches puis se recale
  - sans score\_change : cumule touches et sorties d’arène (points à l’adversaire)
  - accumule les cartons par côté sans muter les images précédentes
  - journal vide → aucune image
- **formatReplayOffset**
  - mm:ss

</details>

<details>
<summary><code>src/shared/utils/multiFormatExport.test.ts</code> — 47 tests</summary>

- **exportRankingCSV**
  - includes header row
  - uses semicolon as separator
  - assigns sequential rank numbers
  - marks FORFAIT fencer with F
  - marks EXCLUDED fencer with X
  - marks ABANDONED fencer with MED (médical, #1256)
  - normal fencer has empty status cell
  - outputs Excel formula when includeFormulas=true
  - outputs numeric index when includeFormulas=false
  - handles empty ranking list
- **exportResultsXMLFFE**
  - produces valid XML declaration
  - includes competition title
  - includes fencer data
  - escapes XML special chars in title
  - uses final rank from finalResults when available
  - uses CompetitionIndividuelle root tag
  - uses CompetitionParEquipe root tag for team events
  - includes pool phase when pools provided
  - inclut les exempts du 1er tour dans leurs cases (#1328)
  - includes elimination bracket when tableauMatches provided
  - maps ABANDONED to A
  - maps EXCLUDED to X
  - maps FORFAIT to F
  - maps ELIMINATED to E
  - **carton noir (#1418)**
    - rang vide (NULL) pour le carton noir, les suivants remontent
    - exclusion simple : rang conservé
- **exportDetailedStatsCSV**
  - includes competition title in header
  - includes VMoy and DMoy columns
  - calculates average correctly (3V 1D → 75%)
  - handles zero matches without division error
- **describeMatchEvent**
  - describes touch event with zone and points
  - describes card event without exclusion
  - describes card event with exclusion
  - describes voluntary arena exit
  - describes non-voluntary arena exit
  - describes score\_change with scores and referee
  - returns empty string for unknown event type
- **exportMatchTimelineJSON**
  - produces valid JSON
  - includes title and event count
  - includes competition name when provided
  - sets competitionName to null when omitted
  - includes exportedAt ISO timestamp
- **exportResultsHTML**
  - returns valid HTML structure
  - includes competition title
  - includes ranking table headers
  - renders fencer row in final results
  - renders pool ranking row

</details>

<details>
<summary><code>src/shared/utils/pdfExport/bookToc.test.ts</code> — 5 tests</summary>

- **bookToc**
  - pages de départ après garde + sommaire
  - échappe le HTML
  - sommaire avec numéros de page
  - sans comptage : pas de numéros
  - ordre et inclusion des sections

</details>

<details>
<summary><code>src/shared/utils/pdfExport/pdfI18n.test.ts</code> — 5 tests</summary>

- **pdfT**
  - sans traducteur : texte français, paramètres interpolés, lang fr
  - avec traducteur : langue active ; clé absente → repli français
  - chaque appel du code a sa clé dans fr.json, avec le même texte
  - liste d’appel : colonne nationalité avec drapeau
  - PDF en anglais : aucun libellé français dans la liste d’appel et le classement

</details>

<details>
<summary><code>src/shared/utils/pdfExport/poolPdf.test.ts</code> — 9 tests</summary>

- **generatePoolHTML – options export (#932)**
  - affiche les colonnes statistiques par défaut
  - masque V, V/M, TD, TR, Ind et Rg avec hideStatColumns
  - conserve les colonnes non statistiques (club) avec hideStatColumns
  - applique le format paysage
- **exportMultiplePoolsToPDF – un seul PDF (#1413)**
  - nom par défaut « \<compétition\>-poules.pdf », caractères interdits remplacés
  - toutes les poules dans un seul fichier, une seule boîte de dialogue
- **printMultiplePoolsHTML – une seule fenêtre (#1413)**
  - toutes les feuilles dans un seul appel d'impression
- **generatePoolHTML – couleurs du modèle (#992)**
  - la surcharge de couleurs suit le CSS de base (sinon écrasée)
  - couleur invalide ignorée (injection CSS)

</details>

<details>
<summary><code>src/shared/utils/pdfExport/printHtml.test.ts</code> — 5 tests</summary>

- **impression via la boîte intégrée (#1214)**
  - printHTML transmet le HTML à file.printHtml
  - printHTML : annulation = pas d’erreur, échec = erreur
  - classement intermédiaire : imprime le HTML du classement
  - résultats finaux : imprime le HTML des résultats
  - rapières : imprime le tableau de classement

</details>

<details>
<summary><code>src/shared/utils/pdfExport/refereeCommentsPdf.test.ts</code> — 2 tests</summary>

- **generateRefereeCommentsHTML (#989)**
  - une page par arbitre commenté, textes échappés
  - message si aucun commentaire

</details>

<details>
<summary><code>src/shared/utils/pdfExport/resultsPdf.test.ts</code> — 3 tests</summary>

- **generateResultsHTML**
  - affiche le classement sans modèle
  - affiche le classement avec le modèle « ranking » (feuille vide avant)
  - masque la table si l’élément est masqué dans le modèle

</details>

<details>
<summary><code>src/shared/utils/pdfExport/tableauPdf.test.ts</code> — 4 tests</summary>

- **generateTableauHTML – feuilles d’arbitrage**
  - par défaut : sous-titre et pastille de l’élimination directe
  - options : sous-titre, pastille et libellé de tour personnalisés (feuilles de vague)
  - flux continu (feuilles de vague, #1441) : pas de saut de page forcé entre pages de feuilles
  - feuilles seules (vagues rapières, #1441) : ni bandeau titre ni pied de page

</details>

<details>
<summary><code>src/shared/utils/pdfExport/teamPdf.test.ts</code> — 12 tests</summary>

- **teamPdf**
  - groupTeamPools : regroupe par numéro de poule
  - classement final : vainqueur, finaliste, demi-finalistes 3e ex æquo
  - classement final provisoire tant que la finale n’est pas jouée
  - sans tableau : ordre de poule
  - HTML poules : classement, score, relais, échappement
  - HTML poules format arène : poules A/B, points cumulés
  - HTML tableau : tours, exempt et matchs
  - HTML classement : rangs et tireurs titulaires
  - export : passe par savePDF (dialogue + impression HTML)
  - export sans rencontre : erreur explicite
  - dossier équipes : sommaire + sections choisies dans l ordre
  - dossier équipes sans donnée : erreur explicite

</details>

<details>
<summary><code>src/shared/utils/pdfTemplates.test.ts</code> — 6 tests</summary>

- **TEMPLATES**
  - contient au moins un modèle
  - chaque clé correspond à l’id du modèle
  - chaque modèle a un nom, une description et une organisation
  - toutes les couleurs sont des valeurs hexadécimales valides
  - chaque modèle définit des tailles de police positives
- **getAvailableTemplates**
  - retourne toutes les valeurs de TEMPLATES

</details>

<details>
<summary><code>src/shared/utils/phaseEta.test.ts</code> — 10 tests</summary>

- **median**
  - impair, pair, vide
- **estimatePhaseEta**
  - utilise la médiane des durées mesurées + changement de piste
  - valeur par défaut tant que moins de 3 matchs sont mesurés
  - arrondit les vagues au supérieur et borne les pistes à 1
  - rien à jouer → fin = maintenant
  - ne garde que les durées récentes et valides
- **sequentialWaves (poules sur pistes)**
  - une poule par piste : la plus longue poule fixe la fin
  - plus de poules que de pistes : répartition sur la piste la moins chargée
  - aucun groupe → 0 vague
  - estimatePhaseEta tient compte des pistes pour les poules

</details>

<details>
<summary><code>src/shared/utils/poolCalculations.test.ts</code> — 44 tests</summary>

- **generatePoolMatchOrder**
  - should generate correct match order for pool of 3 fencers
  - should generate correct match order for pool of 4 fencers
  - should generate correct match order for pool of 5 fencers
  - should generate correct match order for pool of 6 fencers
  - should generate correct match order for pool of 7 fencers
  - should generate correct match order for pool of 8 fencers
  - should generate correct count for non-standard pool sizes
  - should not have duplicate matches
  - should not have consecutive bouts for same fencer (pools 5-10)
  - should cover all fencer pairs exactly once (pools 2-10)
- **calculateFencerPoolStats**
  - should calculate stats correctly for a winner
  - should calculate stats correctly for a loser
  - should ignore unfinished matches
  - should return zero stats when no matches played
  - devrait conserver les matchs déjà disputés contre un tireur déclaré forfait (#1144)
- **calculatePoolRanking**
  - should rank fencers by victory ratio
  - should rank by ratio, not absolute victories — same wins but different match counts
  - should rank by indice (TD-TR) when V/M ratio is tied — règle officielle FIE/FFE
  - should rank active fencer first and append excluded/forfeit/abandoned at the end
- **calculateOverallRanking**
  - départage les égalités de V/M par l’indice puis par TD (#910)
  - classe ex aequo en cas d’égalité parfaite V/M, indice et TD
  - l’indice prime sur les points Quest hors Sabre Laser (#944)
  - classe les forfaits/abandons/exclus en dernier (#944)
- **formatRatio**
  - should format perfect ratio
  - should format zero ratio
  - should format ratio with 3 decimal places
- **formatIndex**
  - should format positive index
  - should format negative index
  - should format zero index
- **classement Quest (Sabre Laser)**
  - départage par Q/M et non par le total de points Quest
  - départage par indice avant les victoires par cotation
  - départage par victoires par cotation à Q/M et indice égaux
  - classement de poule : indice avant les cartons
- **forfait en cours de poule (Sabre Laser)**
  - conserve les matchs disputés et le match du forfait, ignore les matchs annulés
  - armes olympiques : match du forfait annulé, matchs déjà disputés conservés (#1144)
  - armes olympiques : le forfait est classé en fin de poule
  - DNS : forfait déclaré à l'appel (motif dns) ≠ DNF (#1256)
  - classe le forfait sur ses matchs disputés dans la poule
  - place le forfait en fin de classement général (non qualifié pour le tableau)
- **isMatchVoidedByForfeit (#1144)**
  - match terminé normal : non annulé
  - forfait ou abandon saisi sur un score : annulé
  - match non terminé : jamais annulé
- **distributeFencersGroupedByLevel (rapières, #1441)**
  - regroupe les mêmes niveaux dans les mêmes poules (tailles équilibrées)
  - séparation club : clubs alternés à niveau égal

</details>

<details>
<summary><code>src/shared/utils/poolOptimizer.test.ts</code> — 6 tests</summary>

- **countConflicts / minConflicts**
  - compte les tireurs en trop par poule
  - ignore les valeurs vides
- **optimizePoolConflicts**
  - atteint le minimum en conservant la taille des poules
  - préfère l'échange entre tireurs au classement le plus proche
  - ne sacrifie pas le critère prioritaire au profit du suivant
  - ne modifie pas l'entrée et ne fait rien sans critère

</details>

<details>
<summary><code>src/shared/utils/poolRounds.test.ts</code> — 10 tests</summary>

- **getRoundQualifierCount**
  - retourne le nombre pour le tour demandé
  - 0 ou absent = tous
- **selectNextRoundFencers**
  - garde les N premiers et seed = place du tour
  - garde tous les ex-aequo à la coupure
  - écarte abandons / exclusions
  - sans quota : tous les actifs
- **seedFencersFromRanking**
  - nouveau tirage différent du tirage initial
  - tireurs absents du classement précédent en fin
- **mergeRoundRankings**
  - dernier tour puis éliminés, sans cumul, éliminés marqués
  - conserve les ex-aequo des éliminés

</details>

<details>
<summary><code>src/shared/utils/poolStrips.test.ts</code> — 3 tests</summary>

- **computePoolStrips**
  - attribue les pistes dans l’ordre des poules
  - respecte les pistes imposées et saute les pistes prises
  - ignore les poules au-delà du nombre de pistes

</details>

<details>
<summary><code>src/shared/utils/pseudoLocale.test.ts</code> — 6 tests</summary>

- **pseudoLocalize**
  - accentue les lettres et encadre la chaîne
  - préserve les paramètres {{nom}}
  - allonge la chaîne d'environ 40 %
  - laisse intacts chiffres, accents et symboles
- **isPseudoLocaleEnabled**
  - vrai uniquement si le drapeau vaut "1"
  - faux si le stockage lève une exception

</details>

<details>
<summary><code>src/shared/utils/questScheduler.test.ts</code> — 13 tests</summary>

- **calculateFightsPerFencer**
  - calcule correctement avec la formule officielle
  - retourne 0 si les paramètres sont invalides
- **generateQuestSchedule**
  - génère un planning sans paires dupliquées
  - chaque tireur effectue exactement K combats (ou K±1)
  - retourne \[\] si moins de 2 tireurs
  - retourne \[\] si fightsPerFencer = 0
  - respecte la contrainte de club
  - respecte la contrainte de région
  - respecte la contrainte de nation
- **validateQuestSchedule**
  - valide un planning correct
  - détecte les doublons
  - détecte une distribution déséquilibrée
  - compte correctement les combats par tireur

</details>

<details>
<summary><code>src/shared/utils/refereeStats.test.ts</code> — 15 tests</summary>

- **computeRefereeMatchStats**
  - compte matchs de poule terminés et en attente
  - compte matchs de tableau, ignore les exempts, crédite chaque arbitre en mode expert
  - trie par total décroissant puis nom
- **autoAssignReferees**
  - répartit les matchs sur l’arbitre le moins chargé
  - évite les conflits de club et les indisponibles
  - tient compte de la charge existante et la met à jour
  - retourne une map vide sans arbitre
- **getRefereePresence (#1016)**
  - non pointé si indisponible
  - pointé tant qu’aucun match n’est généré
  - occupé avec un match assigné non terminé
  - libre quand ses matchs sont terminés
  - occupé quand la limite d’assignations est atteinte
- **propagatePoolReferee (#977)**
  - assigne le principal aux matchs sans arbitre
  - remplace l'ancien principal mais conserve une assignation manuelle
  - retire l'ancien principal quand la poule n'a plus d'arbitre

</details>

<details>
<summary><code>src/shared/utils/scoreValidation.test.ts</code> — 18 tests</summary>

- **validateMatchScore**
  - should validate correct score
  - should detect scores exceeding max
  - should detect negative scores
  - should detect tie when not allowed
  - should allow tie when explicitly allowed
  - should warn when winner does not have max score
  - should warn about unilateral score
  - should handle null scores
- **checkDuplicateMatches**
  - should return null when no duplicate
  - should detect exact duplicate
  - should detect reverse duplicate
  - should ignore cancelled matches
- **validatePoolMatches**
  - should validate all matches in pool
- **formatValidationMessage**
  - should format error messages
  - should return empty string for valid result
- **isValidCompleteScore**
  - should return true for valid complete score
  - should return false for null scores
  - should return false for invalid score

</details>

<details>
<summary><code>src/shared/utils/splitCompetition.test.ts</code> — 6 tests</summary>

- **splitCompetition**
  - propose un titre par défaut
  - copie les paramètres sans le mode couplé et lie la compétition source
  - borne le score de poule et normalise une date sérialisée
  - extrait et renumérote le classement du groupe
  - prépare les données tireur avec le rang après poules et pointe les non-pointés
  - remappe les tireurs en conservant les stats de poule

</details>

<details>
<summary><code>src/shared/utils/stripRange.test.ts</code> — 4 tests</summary>

- **stripRange (#1501)**
  - liste les pistes de l’intervalle
  - normalise les bornes invalides
  - répartit en rotation sur l’intervalle
  - computePoolStrips n’utilise que les pistes de l’intervalle

</details>

<details>
<summary><code>src/shared/utils/suddenDeath.test.ts</code> — 33 tests</summary>

- **checkChallengerSuddenDeath**
  - **Déclenchement**
    - se déclenche quand les 2 tireurs ont exactement 10 pts
    - se déclenche si les 2 tireurs dépassent 10 pts
  - **Non-déclenchement**
    - ne se déclenche PAS si un seul tireur a 10+
    - ne se déclenche PAS si personne n'a 10
    - retourne mode null quand pas de déclenchement
- **checkTimeoutSuddenDeath**
  - **Déclenchement**
    - retourne SUPPLEMENTARY\_TIME si scores \< 10 à égalité
    - retourne SUPPLEMENTARY\_TIME si scores = 9 à égalité (sous le seuil)
    - se déclenche même avec égalité à 0-0
    - retourne SUDDEN\_DEATH\_TIMEOUT si scores = 10 à égalité
    - retourne SUDDEN\_DEATH\_TIMEOUT si scores \> 10 à égalité
  - **Non-déclenchement**
    - ne se déclenche PAS si du temps reste
    - ne se déclenche PAS si pas d'égalité (même temps = 0)
- **isValidSuddenDeathTouch**
  - **En mode Mort Subite**
    - Zone C est VALIDE
    - Zone A est INVALIDE (priorité seulement)
    - Zone B est INVALIDE (priorité seulement)
  - **En mode Temps Supplémentaire**
    - Toutes les zones sont VALIDES (A, B, C)
  - **En mode Normal**
    - Toutes les zones sont VALIDES
- **shouldEndMatch**
  - **Mode Normal**
    - termine si score atteint 15
    - ne termine PAS si score \< 15
    - respecte un maxScore personnalisé
  - **Mode Temps Supplémentaire**
    - termine dès qu'il y a un écart de score
    - ne termine PAS s'il y a égalité
  - **Mode Mort Subite**
    - termine si Zone C et écart de score
    - ne termine PAS si Zone C mais égalité
    - ne termine PAS si Zone A/B
- **drawWinner**
  - retourne soit A soit B
  - distribution aléatoire (sur 100 tirages)
- **Constantes et formatage**
  - durée mort subite = 30 secondes
  - durée match = 180 secondes (3 min)
  - formatSuddenDeathTime formate correctement
  - getSuddenDeathRules retourne les règles
- **isSupplementaryTime**
  - retourne true pour SUPPLEMENTARY\_TIME
  - retourne false pour les autres modes

</details>

<details>
<summary><code>src/shared/utils/tableCalculations.test.ts</code> — 41 tests</summary>

- **calculateTableSize**
  - retourne 2 pour 2 tireurs
  - retourne la puissance de 2 immédiatement supérieure
  - retourne la valeur exacte si déjà une puissance de 2
  - gère 1 tireur (cas limite)
- **calculateByeCount**
  - aucun exempt pour un tableau plein
  - calcule correctement les exempts
- **getSeedPosition**
  - seed 1 est toujours à la position 0
  - seed 2 est toujours à la dernière position
  - seed 1 et 2 ont des positions bien définies
- **generateSeedingChart**
  - retourne un tableau de la bonne taille
  - contient chaque seed exactement une fois (#1080)
  - suit le placement FIE (1-8, 5-4, 3-6, 7-2)
  - chaque paire du premier tour totalise tableSize + 1
  - refuse une taille qui n’est pas une puissance de 2
  - seed 1 est à la position 0
- **placeFencersInTable**
  - place les tireurs selon leur classement pool
  - remplit avec null pour les exempts
  - place le maximum de tireurs possible
- **createDirectEliminationTable**
  - crée un tableau de 8 (8 tireurs)
  - crée un tableau de 8 pour 5 tireurs avec byes
  - le tableau a un ID unique
  - les nœuds bye avec un tireur ont un gagnant automatique
  - les nœuds avec deux tireurs ont un match créé
  - la structure du tableau est complète (tous les tours créés)
  - utilise le nom et firstPlace fournis
  - isComplete est false à la création
- **getRoundName**
  - retourne "Finale" pour round=1 en français
  - retourne "Final" pour round=1 en anglais
  - retourne "Demi-finales" pour round=2
  - retourne "Quarts de finale" pour round=4
  - retourne un nom générique pour une valeur inconnue
- **countRemainingMatches**
  - retourne 0 pour un tableau sans matchs
  - compte les matchs non-terminés (hors byes)
- **canTableStart**
  - retourne true pour un tableau plein
  - retourne true pour un tableau avec byes
- **findNodeById**
  - trouve un nœud existant
  - retourne undefined si introuvable
- **findNodeByMatch**
  - trouve un nœud via son match
  - retourne undefined pour un matchId inconnu
- **getMatchesInRound**
  - retourne les matchs du premier tour (hors byes)
  - retourne un tableau vide pour un tour sans matchs créés

</details>

<details>
<summary><code>src/shared/utils/tieBreak.test.ts</code> — 2 tests</summary>

- **allowsVictoryTieBreak**
  - vrai pour laser, épée, fleuret, sabre et rapières
  - faux pour arme à la carte hors rapières

</details>

<details>
<summary><code>src/shared/utils/touchSystem.test.ts</code> — 23 tests</summary>

- **ZONE\_POINTS - Points par zone FFE**
  - Zone A (Main/Arme) = 1 point
  - Zone B (Bras/Jambes) = 3 points
  - Zone C (Tête/Tronc) = 5 points
- **createTouch**
  - **Mode Normal - Toutes zones valides**
    - Zone A crée une touche de 1 point
    - Zone B crée une touche de 3 points
    - Zone C crée une touche de 5 points
    - assigne correctement matchId et fencerId
    - génère un ID unique
    - ajoute un timestamp
  - **Mode Mort Subite - Seule Zone C compte**
    - Zone C donne 5 points normalement
    - Zone A donne 0 points (reversed)
    - Zone B donne 0 points (reversed)
- **undoLastTouch**
  - supprime la dernière touche du tireur
  - ne supprime que les touches du tireur spécifié
  - retourne le tableau intact si pas de touches pour ce tireur
  - retourne tableau vide si tableau vide
- **getTouchSummary**
  - calcule le total des points
  - compte les touches par zone
  - ignore les touches reversed
  - filtre par tireur
  - retourne 0 si pas de touches
- **Constantes de style**
  - ZONE\_COLORS définit les couleurs hex
  - ZONE\_BG\_CLASSES définit les classes Tailwind

</details>

<details>
<summary><code>src/shared/utils/tournamentSimulator.test.ts</code> — 5 tests</summary>

- **createRng**
  - est déterministe pour une graine donnée
- **simulateTournament**
  - joue un tournoi complet de 200 tireurs (poules → tableau → classement)
  - est reproductible : même graine → même vainqueur
  - tient pour %i tireurs _(each)_
  - refuse moins de 4 tireurs

</details>

<details>
<summary><code>src/shared/utils/tournamentTemplates.test.ts</code> — 9 tests</summary>

- **OFFICIAL\_TEMPLATES**
  - contient au moins un modèle officiel
  - a des ids uniques
  - expose une catégorie valide pour chaque modèle
  - getOfficialTemplates retourne la même liste
- **getTemplateById**
  - retrouve un modèle officiel existant
  - retourne null pour un id inconnu
- **applyTemplate**
  - reporte arme, genre, catégorie, couleur et settings
  - utilise le nom du modèle comme titre par défaut
  - utilise le titre fourni s’il est présent

</details>

### `src/shared/services/`

<details>
<summary><code>src/shared/services/cloudSyncService.test.ts</code> — 6 tests</summary>

- **compression (round-trip)**
  - compresse puis décompresse vers la donnée d’origine
  - renvoie la donnée telle quelle si compression désactivée
  - decompressData laisse passer un JSON non préfixé
- **chiffrement (round-trip AES-GCM)**
  - chiffre puis déchiffre vers la donnée d’origine
  - ne chiffre pas sans clé
  - ne chiffre pas si encryptData=false

</details>

<details>
<summary><code>src/shared/services/errorService.test.ts</code> — 6 tests</summary>

- **ErrorService.handle**
  - utilise logWarning pour une sévérité low
  - utilise logError pour les sévérités \>= medium
  - utilise medium par défaut
  - enveloppe une valeur non-Error dans une Error
  - émet un évènement bp:critical-error en sévérité critical
  - n’émet pas d’évènement pour une sévérité non critical

</details>

<details>
<summary><code>src/shared/services/ffeConnectService.test.ts</code> — 8 tests</summary>

- **constructor**
  - accepte l’URL par défaut (https)
  - refuse une base non https
  - refuse une URL invalide
- **toFencer**
  - mappe les champs de base + statut par défaut
  - mappe le sexe F vers FEMALE
  - reporte le classement sur ranking et initialRanking
  - parse une date de naissance valide
  - ignore une date de naissance invalide

</details>

<details>
<summary><code>src/shared/services/logger.test.ts</code> — 7 tests</summary>

- **logger - enregistrement**
  - enregistre une entrée par appel
  - conserve l’erreur passée à error()
- **logger - filtrage par niveau minimal**
  - ignore les niveaux inférieurs au minimum
- **logger - getEntries**
  - filtre par niveau seuil
  - filtre par catégorie
- **logger - clear / export**
  - vide les entrées
  - exporte un JSON parsable des entrées

</details>

<details>
<summary><code>src/shared/services/notificationService.test.ts</code> — 9 tests</summary>

- **NotificationService - payloads**
  - notifyMatchStarting construit titre/corps/piste
  - notifyMatchCompleted indique le vainqueur (meilleur score)
  - notifyCompetitionStarted / Ended référencent le titre
  - notifyFencerLate inclut le délai
  - respecte la désactivation d’un évènement
- **NotificationService - isWebhookUrlSafe**
  - accepte une URL https publique
  - refuse le http
  - refuse localhost et les IP privées
  - refuse une URL invalide

</details>

<details>
<summary><code>src/shared/services/performanceService.test.ts</code> — 15 tests</summary>

- **CacheService**
  - stocke et relit une valeur
  - retourne undefined pour une clé absente
  - supprime et vide le cache
  - calcule le hitRate et la taille
  - a un hitRate de 0 sans accès
  - **expiration TTL**
    - expire une entrée après son TTL
    - respecte un TTL par entrée
- **memoize**
  - ne calcule qu’une fois pour les mêmes arguments
  - recalcule pour des arguments différents
  - utilise le générateur de clé fourni
- **calculateVirtualListState**
  - démarre à 0 en haut de liste
  - décale start/offset selon le scroll et l’overscan
  - borne endIndex au dernier élément
- **debounce**
  - ne déclenche qu’après le délai et une seule fois
- **throttle**
  - exécute immédiatement puis limite les appels

</details>

<details>
<summary><code>src/shared/services/refereeManager.test.ts</code> — 17 tests</summary>

- **RefereeManager**
  - **constructeur**
    - filtre les arbitres unavailable
    - config par défaut appliquée
    - config partielle fusionne avec defaults
  - **assignRefereesToMatches**
    - 1 match + 1 arbitre → assignment créée
    - 0 arbitres → map vide
    - 0 matchs → map vide
    - plusieurs matchs avec plusieurs arbitres → tous assignés si possible
    - arbitre assigné a son status mis à jour
  - **conflit de club**
    - arbitre et tireurA même club → conflit détecté (warning dans recordAssignment)
    - arbitre sans club → pas de conflit
    - conflit via fenceur dans pool → arbitre pénalisé
  - **rotation / maxConsecutiveMatches**
    - un arbitre reçoit plusieurs matchs si assez de matchs
    - maxMatchesPerDay limite les assignations
  - **getRefereeStats**
    - retourne 0 matchs pour un arbitre non assigné
    - compte les matchs après assignation
  - **generateRotationReport**
    - rapport vide si aucun arbitre
    - rapport contient toutes les infos

</details>

<details>
<summary><code>src/shared/services/tournamentFlow.test.ts</code> — 24 tests</summary>

- **TournamentFlowManager**
  - constructeur avec config par défaut crée une instance
  - DEFAULT\_TOURNAMENT\_CONFIG a les valeurs attendues
  - constructeur avec config personnalisée
  - 0 matchs → schedule vide
  - 0 matchs → metrics.totalDuration = 0
  - plusieurs matchs non terminés → schedule non vide
  - matchs FINISHED exclus du schedule
  - 0 arènes disponibles → schedule vide
  - arène unavailable ignorée
  - 1 arène disponible → schedule contient arenaId correct
  - résultat contient metrics avec arenaUtilization
  - schedule trié par scheduledTime croissant
  - updateHistoricalData ne plante pas sur match FINISHED
  - updateHistoricalData ignoré si match pas FINISHED
- **TournamentFlowManager — calculs successifs (#1018)**
  - un second calcul ne plante pas et repart de maintenant
  - planning vide : pas de NaN ni d’exception
- **TournamentFlowManager — estimations du planning (#1018)**
  - fin estimée = fin du dernier match planifié, pas maintenant
  - pas de « pistes sous-utilisées » quand toutes les pistes servent
  - signale les pistes inutilisées quand il y en a trop
  - calcule l'attente des tireurs entre deux matchs
- **TournamentFlowManager — ordre officiel des poules (#1018)**
  - conserve l’ordre des matchs de chaque poule, une piste par poule
  - attente calculée sur la poule la plus grande, selon son ordre
- **TournamentFlowManager — planning du tableau (#1018)**
  - compte les duels prêts et en attente, enchaîne les tours
  - une seule piste : les duels se suivent

</details>

### Feature `analytics` (`src/features/analytics/`)

<details>
<summary><code>src/features/analytics/hooks/useAnalyticsStore.test.tsx</code> — 4 tests</summary>

- **loadFencerStats**
  - charge les stats via le service
  - retourne une liste vide sans API (pas d’erreur)
- **loadCompetitionMetrics**
  - charge les métriques agrégées
- **clearError**
  - efface l’erreur

</details>

<details>
<summary><code>src/features/analytics/services/analyticsService.test.ts</code> — 8 tests</summary>

- **getPoolStats**
  - retourne des zéros sans electronAPI
  - agrège matchs, terminés et durée moyenne
  - durée moyenne 0 si aucun match terminé
- **getCompetitionStats**
  - retourne une structure vide sans electronAPI
  - agrège matchs sur phases/poules et calcule la durée moyenne
- **getCompetitionMetrics**
  - dérive totalFencers et completedMatches de getCompetitionStats
- **getCompetitionFencerStats / getFencerCompetitionStats**
  - retournent des valeurs vides sans electronAPI
  - délèguent à electronAPI.db

</details>

### Feature `bracket` (`src/features/bracket/`)

<details>
<summary><code>src/features/bracket/services/bracketGenerator.test.ts</code> — 16 tests</summary>

- **BracketGenerator.generate**
  - generates correct node count for table of 8
  - generates correct node count for table of 16
  - generates correct node count for table of 4
  - generates correct node count for table of 2
  - assigns unique node IDs
  - final match is at round=1 (lowest round)
  - first competition round (highest round number) has tableSize/2 nodes
  - all rounds except the first competition round have parent links
  - parent links point to valid node IDs
  - isBye is false on generated nodes by default
  - accepts empty seededFencers without error
- **BracketGenerator.generateByes**
  - returns empty array when fencerCount equals tableSize
  - returns correct bye count
  - returns tableSize byes when fencerCount is 0
  - bye positions are within bracket bounds
  - returns 1 bye for 15 fencers in table of 16

</details>

<details>
<summary><code>src/features/bracket/services/bracketService.test.ts</code> — 10 tests</summary>

- **generateBracket - emptyTable**
  - retourne un tableau vide sans electronAPI, taille = puissance de 2 ≥ count
  - arrondit la taille (12 → 16, 64 → 64)
  - vide aussi si la liste de tireurs est vide
- **generateBracket - avec tireurs**
  - construit un tableau et y injecte le competitionId
- **updateMatchResult**
  - ne fait rien si le match est introuvable
  - marque la victoire du bon tireur (A) et termine le match
  - gère les scores absents (value null)
- **getProgression**
  - valeurs par défaut sans electronAPI
  - agrège complétés/total et déduit le tour courant
  - currentRound = totalRounds quand tout est terminé

</details>

### Feature `competition` (`src/features/competition/`)

<details>
<summary><code>src/features/competition/hooks/useCompetitionStore.test.tsx</code> — 8 tests</summary>

- **loadCompetitions**
  - charge les compétitions via le service
  - positionne une erreur si la DB est indisponible
- **createCompetition**
  - ajoute en tête et définit la compétition courante
  - propage l’erreur et la stocke
- **selectCompetition / deleteCompetition**
  - selectCompetition met à jour la compétition courante
  - deleteCompetition retire de la liste
- **setCurrentCompetition / clearError**
  - définit la compétition courante
  - efface l’erreur

</details>

<details>
<summary><code>src/features/competition/services/competitionService.test.ts</code> — 6 tests</summary>

- **garde "Database not available"**
  - chaque méthode rejette sans electronAPI
- **délégation à la DB**
  - getAll / getById relaient les appels DB
  - create transmet les champs et settings par défaut {}
  - create conserve les settings fournis
  - update appelle updateCompetition et retourne le patch
  - delete appelle deleteCompetition

</details>

<details>
<summary><code>src/features/competition/utils/competitionUtils.test.ts</code> — 6 tests</summary>

- **validateCompetition**
  - retourne null pour des données valides
  - exige un titre non vide
  - exige date, arme, genre, catégorie
- **generateCompetitionId**
  - génère des UUID distincts
- **formatCompetitionDate**
  - formate en français lisible
- **generateCompetitionTitle**
  - assemble arme/genre/catégorie/date

</details>

### Feature `doubleelimination` (`src/features/doubleelimination/`)

<details>
<summary><code>src/features/doubleelimination/hooks/useDEBracketStore.test.tsx</code> — 13 tests</summary>

- **generateBracket**
  - crée un tableau winners + finale pour 8 tireurs
  - arrondit la taille à la puissance de 2 supérieure
- **updateMatchResult**
  - enregistre le score, le vainqueur et marque le match terminé
- **advanceWinner**
  - place le vainqueur dans le prochain match qui l'attend
  - ne fait rien si le match source est incomplet
- **advanceLoser**
  - envoie le perdant dans le tableau des repêchés et marque son round d’élimination
- **resetGrandFinal**
  - ajoute une deuxième manche de finale et pose resetRequired
- **getFencerPath / getNextMatch / isInLosersBracket**
  - retrouve le parcours, le prochain match et la présence en repêchage
- **canWinChampionship**
  - retourne false pour un tireur éliminé
  - retourne true pour un tireur toujours en lice
- **finalizeBracket / getFinalRanking**
  - désigne le champion et classe les tireurs par round d’élimination
  - renvoie un classement vide si le tableau n'est pas terminé
- **clearBracket**
  - réinitialise le tableau et les tireurs

</details>

### Feature `latefencers` (`src/features/latefencers/`)

<details>
<summary><code>src/features/latefencers/hooks/useLateFencerStore.test.tsx</code> — 14 tests</summary>

- **registerFencer / markAsPresent**
  - enregistre un tireur en attente
  - remplace l’entrée existante (pas de doublon)
  - markAsPresent retire le tireur
- **updateDelays - statuts selon les seuils**
  - passe en "warned" au-delà du seuil d’avertissement
  - passe en "critical" sans auto-forfait
  - passe en "forfeit" avec auto-forfait au-delà du seuil
- **sélecteurs**
  - getLateFencers / getCriticalFencers filtrent par délai
- **sendWarning / getForfeitCandidates / getFencerStatus**
  - sendWarning incrémente le compteur d’avertissements
  - getForfeitCandidates filtre les tireurs au-delà du seuil de forfait
  - getFencerStatus renvoie undefined pour un tireur inconnu
- **updateConfig**
  - fusionne la config partielle sans écraser le reste
- **startMonitoring / stopMonitoring**
  - active isMonitoring et rafraîchit les délais périodiquement
- **markAsForfeit / getLateStats**
  - markAsForfeit force le statut forfeit
  - getLateStats agrège les compteurs

</details>

### Feature `matchAuditLog` (`src/features/matchAuditLog/`)

<details>
<summary><code>src/features/matchAuditLog/hooks/useMatchAuditStore.test.tsx</code> — 9 tests</summary>

- **loadMatchTimeline**
  - charge les entrées et positionne activeMatchId
  - positionne une erreur en cas d’échec
- **loadCompetitionTimeline**
  - charge les entrées et positionne activeCompetitionId
- **loadCompetitionTimeline - erreur**
  - positionne une erreur en cas d’échec
  - positionne un message générique si l’erreur n’est pas une Error
- **setFilterTypes / clearError / reset**
  - met à jour les filtres
  - clearError remet l’erreur à null
  - reset réinitialise tout
  - reset ne touche pas aux filtres actifs

</details>

### Feature `pdfTemplates` (`src/features/pdfTemplates/`)

<details>
<summary><code>src/features/pdfTemplates/hooks/usePdfTemplateStore.test.tsx</code> — 6 tests</summary>

- **usePdfTemplateStore**
  - fournit des modèles par défaut pour les 3 types
  - setTemplate remplace le modèle d’un type
  - resetTemplate restaure le modèle par défaut
  - importTemplate cible le bon type via docType
  - resetTemplate restaure indépendamment pool et tableau
  - setTemplate n'affecte que le type ciblé, les deux autres restent par défaut

</details>

### Feature `penalties` (`src/features/penalties/`)

<details>
<summary><code>src/features/penalties/hooks/usePenaltyStore.test.tsx</code> — 8 tests</summary>

- **addPenalty / removePenalty**
  - ajoute une pénalité avec scoreImpact issu de la config
  - supprime une pénalité par id
- **getFencerHistory**
  - compte les cartons par type et déduit l’exclusion
  - isole les pénalités par tireur
- **shouldExcludeFencer**
  - exclut après 2 cartons jaunes
  - exclut immédiatement sur carton noir
- **getNextCardType**
  - jaune par défaut, rouge après le seuil de jaunes
- **calculateScoreImpact / updateConfig**
  - reflète la config courante

</details>

<details>
<summary><code>src/features/penalties/penalties.test.ts</code> — 20 tests</summary>

- **CardGroup progression – Sabre Laser**
  - **GROUP\_1: Blanc → Jaune → Jaune (pas d'exclusion)**
    - premier carton GROUP\_1 → WHITE
    - deuxième carton GROUP\_1 → YELLOW
    - troisième carton GROUP\_1 → toujours YELLOW (pas de BLACK)
  - **GROUP\_2: Jaune → Rouge**
    - premier carton GROUP\_2 → YELLOW (+1 point)
    - deuxième carton GROUP\_2 → RED (+1 point)
  - **GROUP\_3: Rouge → Exclusion (BLACK)**
    - premier carton GROUP\_3 → RED
    - deuxième carton GROUP\_3 → BLACK (exclusion)
  - **GROUP\_4: Exclusion immédiate**
    - premier carton REFUSAL → BLACK direct
    - premier carton CHEATING → BLACK direct
    - BLACK GROUP\_4 même avec historique GROUP\_4
  - **Groupes indépendants par match**
    - cartons GROUP\_1 ne font pas monter GROUP\_2
    - cartons GROUP\_3 ne font pas monter GROUP\_4
    - cartons d'autres groupes ignorés pour GROUP\_2
- **isFencerExcluded**
  - retourne true si un carton BLACK avec exclusion
  - retourne false sans carton noir
- **penaltyUtils**
  - getPenaltyDescription retourne une chaîne non vide pour chaque raison
  - getPenaltyColor retourne des codes hex valides
  - validatePenalty valide une pénalité complète
  - validatePenalty invalide si fencerId manquant
  - getCardTypeLabel retourne le bon label français

</details>

<details>
<summary><code>src/features/penalties/utils/penaltyUtils.test.ts</code> — 8 tests</summary>

- **getPenaltyDescription**
  - traduit chaque motif connu
- **getPenaltyColor**
  - retourne une couleur par type de carton
- **getCardTypeLabel**
  - libellé français par type
- **validatePenalty**
  - valide une pénalité complète
  - liste les champs requis manquants
  - exige fencerId
- **getImpactDescription**
  - jaune = avertissement, noir = exclusion
  - rouge = retrait de touches avec accord pluriel

</details>

### Feature `pools` (`src/features/pools/`)

<details>
<summary><code>src/features/pools/hooks/usePoolStore.test.tsx</code> — 5 tests</summary>

- **loadPools**
  - charge les poules via le service
  - retourne une liste vide sans API (pas d’erreur)
- **computeRanking**
  - stocke le classement calculé
- **setCurrentPool / clearError**
  - définit la poule courante
  - efface l’erreur

</details>

<details>
<summary><code>src/features/pools/services/poolCalculator.test.ts</code> — 19 tests</summary>

- **PoolCalculator.calculatePoolDistribution**
  - returns 1 pool when fencer count fits single pool
  - returns correct distribution for 35 fencers (5-7)
  - fencersPerPool sums to fencerCount
  - falls back to single pool when no valid distribution exists
  - uses default min=5 max=7 when not provided
  - returns pool count of 1 for small number of fencers within range
- **PoolCalculator.isPoolComplete**
  - returns false for empty matches
  - returns true when all matches are finished
  - returns false when any match is not finished
  - returns false when matches array is undefined
- **PoolCalculator.calculateRankings**
  - returns rankings for all fencers
  - returns isComplete=true when all matches finished
  - returns isComplete=false with pending match
  - returns correct completedMatches count
  - returns 0 averageTouchesPerMatch when no completed matches
  - calculates correct average touches per match
- **PoolCalculator.calculateVictoryRatio**
  - returns 1.0 for fencer who won all matches
  - returns 0.0 for fencer who lost all matches
  - returns 0.5 for fencer with equal wins and losses

</details>

<details>
<summary><code>src/features/pools/services/poolService.test.ts</code> — 8 tests</summary>

- **getByCompetition**
  - retourne \[\] sans electronAPI
  - agrège les poules de toutes les phases
- **updateScore**
  - ne fait rien sans electronAPI.db.updateMatch
  - construit les scores avec victoire du gagnant A
  - positionne le flag abandon sur le perdant
  - laisse un score à undefined s’il n’est pas fourni
- **computeOverallRanking**
  - retourne \[\] s’il n’y a pas de poule
  - trie par ratio puis index et réassigne les rangs

</details>

### Feature `rapieres` (`src/features/rapieres/`)

<details>
<summary><code>src/features/rapieres/RapieresComponents.test.tsx</code> — 3 tests</summary>

- **Tournoi des rapières : composants (#1118)**
  - fenêtre équipe : nom, niveau, deux tireurs avec catégorie
  - barre des vagues : lancement, vague incomplète, fin anticipée
  - fenêtre d'import : équipes cochées par défaut, sélection transmise (#1211)

</details>

<details>
<summary><code>src/features/rapieres/rapieresAge.test.ts</code> — 5 tests</summary>

- **rapieresAge**
  - lit l’année de naissance depuis AAAA-MM-JJ
  - applique les tranches d’âge de la saison (1er septembre)
  - catégorie d’équipe = moyenne des années de naissance des deux tireurs
  - une seule date connue : elle sert ; aucune : catégorie saisie
  - sexe d’équipe : M, F, mixte ; indéterminé si un sexe manque

</details>

<details>
<summary><code>src/features/rapieres/rapieresCalculations.test.ts</code> — 21 tests</summary>

- **Tournoi des rapières (#1118)**
  - libellé des tireurs de l’équipe
  - **répartition**
    - regroupe par niveau, tailles équilibrées
  - **vagues**
    - ${n} équipes (impair) : une équipe au repos par vague, la dernière d'abord
    - ${n} équipes : round-robin complet, toutes les équipes tirent à chaque vague
    - ordre des matchs de la poule suivant les vagues
    - vague suivante lancée seulement quand la précédente est saisie
    - équipe retirée : ses matchs ne bloquent pas la vague
  - **feuilles de la vague active**
    - ne contient que les matchs de la vague, triés par poule
    - vague 0 ou inexistante : aucune feuille
    - exclut les matchs annulés et ceux d’une équipe retirée
    - reprend la piste de la poule
  - **qualification**
    - mode %s : toutes les équipes au tableau _(each)_
    - mode semis : 4 équipes
    - équipe retirée exclue
    - réglages : petite finale sauf en normal, toutes places en « all »
  - **classements**
    - filtre par niveau : équipes seules, rangs conservés (#1441)
    - filtre par catégorie d’équipe (moyenne des années de naissance, #1441)
    - filtre par sexe d’équipe : M, F, mixte ; sexe incomplet exclu (#1441)
    - filtres cumulables (niveau + sexe)
    - rapieresPoolNumbers : numéro de poule par équipe
    - final : tableau, puis non qualifiées, exclues en dernier

</details>

<details>
<summary><code>src/features/rapieres/rapieresImport.test.ts</code> — 10 tests</summary>

- **rapieresImport (#1211)**
  - parseDelimited gère BOM, guillemets et CRLF
  - parseBirthDate lit JJ/MM/AAAA, ISO et série Excel
  - catégorie selon l’âge atteint dans l’année de début de saison
  - parseRapieresGender reconnaît homme/femme et variantes
  - parseRapieresTeams lit le sexe en R et W
  - parseRapieresTeams lit D/E/Q, T/U/V et Y, ignore l’en-tête et les lignes incomplètes
- **rapieresImport : club de l’équipe (#1441)**
  - club des deux tireurs (colonnes S et X) : distincts joints par « / », identiques une seule fois
- **buildRapieresImportTemplate (modèle d'import des équipes)**
  - commence par un BOM et reprend les 25 colonnes de l'export d'inscriptions
  - est relu par l'import : une équipe d'exemple, colonnes correctement placées
  - un modèle sans ligne d'exemple ne produit aucune équipe

</details>

<details>
<summary><code>src/features/rapieres/rapieresPdf.test.ts</code> — 3 tests</summary>

- **generateRapieresRankingHTML**
  - aligne les colonnes selon leur nature quand des colonnes sont masquées (#1279)
  - garde la mise en page par défaut sans kinds
  - reprend le style du classement après poules et colore l'indice (#1279)

</details>

<details>
<summary><code>src/features/rapieres/rapieresSemifinals.test.ts</code> — 6 tests</summary>

- **rapieresSemifinalists**
  - 2 poules : croisement A1–B2 et B1–A2, ordre de tête de série
  - 3 poules : 1res + meilleure 2e du général, ordre du général
  - 4 poules : les 4 premiers de poule
  - 1 poule : les 4 premières de la poule
  - plus de 4 poules : pas de scénario
  - équipe retirée : écartée, rangs de poule renumérotés

</details>

<details>
<summary><code>src/features/rapieres/useRapieresTeams.test.tsx</code> — 1 test</summary>

- **useRapieresTeams : import des équipes (#1211)**
  - ouvre la fenêtre de sélection puis ajoute toutes les équipes en un lot

</details>

### Feature `teams` (`src/features/teams/`)

<details>
<summary><code>src/features/teams/hooks/useTeamStore.test.tsx</code> — 7 tests</summary>

- **addTeam / updateTeam / removeTeam**
  - ajoute une équipe
  - met à jour puis supprime une équipe
- **createMatch**
  - crée un match entre deux équipes existantes
  - lève une erreur si une équipe est introuvable
- **updateBoutScore**
  - désigne le vainqueur et incrémente le score d’équipe
- **finishMatch**
  - marque le match terminé et le vainqueur
- **generatePools**
  - répartit les équipes en poules selon la taille

</details>

<details>
<summary><code>src/features/teams/utils/laserArenaBracketRules.test.ts</code> — 4 tests</summary>

- **buildPoolPairHistory**
  - n'enregistre que les rencontres de poule terminées
- **applyRematchAvoidanceSwap**
  - ne modifie rien avec moins de 6 équipes classées
  - ne modifie rien si aucune revanche n'est détectée au 1er tour
  - échange les équipes classées 5 et 6 si leur confrontation au 1er tour est une revanche de poule

</details>

<details>
<summary><code>src/features/teams/utils/laserArenaCalculations.test.ts</code> — 9 tests</summary>

- **getLaserArenaBoutCap**
  - plafonne à 5 touches ou 3 minutes
- **isLaserArenaBoutComplete**
  - se termine dès que le cumul des deux côtés atteint 5
  - se termine au bout de 3 minutes même sans 5 touches
- **calculateLaserArenaMatchScore**
  - additionne uniquement les assauts terminés
- **isLaserArenaMatchComplete / getLaserArenaMatchWinner**
  - n'est pas terminée tant que tous les assauts ne le sont pas
  - désigne le vainqueur au total de points, pas au nombre d’assauts gagnés
  - renvoie null en cas d’égalité totale (départage au niveau poule)
- **calculateLaserArenaPoolRanking**
  - classe par total de points marqués, pas par nombre de victoires
  - signale une égalité totale (points et ratio) sans la départager

</details>

<details>
<summary><code>src/features/teams/utils/laserArenaPoolSchedules.test.ts</code> — 5 tests</summary>

- **getLaserArenaPoolSchedule**
  - renvoie le calendrier figé pour 8 et 12 équipes uniquement
- **assignTeamsToPoolSlots**
  - affecte les équipes par blocs de 4 (A puis B puis C)
- **resolveLaserArenaSchedule — 12 équipes**
  - génère exactement 6 rencontres par poule (round-robin complet à 4 équipes)
  - chaque équipe rencontre toutes les autres de sa poule exactement une fois
- **resolveLaserArenaSchedule — 8 équipes**
  - génère exactement 6 rencontres par poule pour 2 poules de 4

</details>

<details>
<summary><code>src/features/teams/utils/teamCalculations.test.ts</code> — 21 tests</summary>

- **generateRelayBouts**
  - génère 9 relais dans l’ordre standard
  - ignore les réservistes et trie par teamOrder
  - lève une erreur si moins de 3 titulaires
- **calculateTeamScore**
  - compte uniquement les relais terminés avec vainqueur
- **validateTeamComposition**
  - valide une équipe de 3 titulaires d’ordres 1,2,3
  - refuse moins de 3 titulaires
  - refuse plus d’un réserviste
- **isTeamMatchComplete / getTeamMatchWinner**
  - est complet après 9 relais terminés
  - retourne null si le match n’est pas terminé
- **generateRelayOrder**
  - génère le motif FIE standard pour une équipe de 3
  - génère N² relais où chaque titulaire rencontre chaque adversaire exactement une fois (N=4)
- **getTeamTargetRule / getRelayCap**
  - E/F/S comptent toujours en touches, cible = stepSize × N²
  - Sabre Laser respecte le mode configuré (touches ou points)
  - getRelayCap calcule le palier cumulé (5-10-15…)
- **calculateTeamPoolRanking**
  - classe les équipes par victoires, puis relais gagnés, puis touches
  - ignore les matchs non terminés
- **placeRankedTeamsInTable / resolveTeamTableauSlot**
  - place la tête de série n°1 en première position
  - résout un exempt (bye) quand une équipe est seule dans son couple de départ
  - propage un exempt jusqu’à la finale quand l’adversaire du tour suivant est aussi exempté
  - résout la finale à partir des vainqueurs des demi-finales persistées en DB
  - demi-finale terminée + autre en cours : finale en attente, pas d’exempt prématuré

</details>

<details>
<summary><code>src/features/teams/utils/teamCardEscalation.test.ts</code> — 3 tests</summary>

- **determineTeamCardEscalation**
  - attribue un carton blanc à la première désignation tardive de la rencontre
  - attribue un carton jaune dès qu’un blanc a déjà été donné, même dans un autre assaut
- **countTeamYellowCards**
  - compte uniquement les jaunes de l’équipe concernée

</details>

<details>
<summary><code>src/features/teams/utils/teamRelayLive.test.ts</code> — 4 tests</summary>

- **teamRelayLive (#1086)**
  - cumul = relais précédents terminés + relais en cours
  - palier progressif plafonné à la cible
  - relais terminé au palier ou au bout de 3 minutes
  - vainqueur au cumul, null si égalité

</details>

### `src/database/`

<details>
<summary><code>src/database/bpmSnapshot.test.ts</code> — 3 tests</summary>

- **.bpm snapshot (DatabaseManager réel)**
  - restitue à l’identique le contenu de chaque table de la compétition
  - n’embarque aucune donnée d’une autre compétition
  - ré-import remplace l’état existant : aucun match obsolète ne subsiste

</details>

<details>
<summary><code>src/database/competitionArchive.test.ts</code> — 4 tests</summary>

- **competitionArchive (#1117)**
  - keepOnlyCompetition ne garde que la compétition demandée
  - mergeAttachedDatabase importe la compétition et remplace l'état existant
  - mergeAttachedDatabase purge les orphelins au lieu d'échouer (FOREIGN KEY)
  - keepOnlyCompetition retire poules et matchs des autres compétitions

</details>

<details>
<summary><code>src/database/database.test.ts</code> — 36 tests</summary>

- **DatabaseManager**
  - **initialize (open)**
    - crée une Database et configure les pragmas
    - configure busy\_timeout et synchronous NORMAL (#1007)
    - lance runMigrations après ouverture
    - isOpen() retourne true après open()
    - isOpen() retourne false avant open()
  - **createCompetition**
    - insère une compétition et retourne un objet avec id
    - utilise un id fourni si présent
    - persiste isTeamEvent (#1087)
  - **getFencer**
    - retourne null si le tireur n'est pas trouvé
    - retourne un objet Fencer si trouvé
  - **addFencer : texte normalisé (#1147)**
    - retire \< \> et caractères de contrôle des champs texte avant insertion
  - **createMatch**
    - insère un match avec les champs requis
  - **updateMatch**
    - appelle prepare avec score\_a pour scoreA
    - appelle prepare avec score\_b pour scoreB
    - appelle prepare avec status pour status
  - **getPoolsByPhase**
    - retourne un tableau vide si aucune poule
    - retourne un tableau de poules si des poules existent
  - **cartons des relais par équipes (#1086)**
    - createTeamBoutCard stocke le carton sérialisé, getTeamBoutCards le restitue
  - **arbitres multiples par poule (#908)**
    - updatePoolReferees stocke principal + liste JSON dédupliquée
    - updatePoolReferees(\[\]) efface les arbitres
    - getPoolsByPhase restitue tous les arbitres de referee\_ids dans l'ordre
    - getPoolsByPhase se replie sur referee\_id sans referee\_ids
  - **syncPoolSnapshot (#905)**
    - recrée phase et poule absentes de la base puis insère tireurs et matchs
    - ne recrée pas une poule déjà présente
  - **Validation – ID invalide**
    - saveSessionState lance ValidationError pour ID vide
    - getSessionState lance ValidationError pour ID vide
    - clearSessionState lance ValidationError pour ID vide
    - saveSessionState lance ValidationError pour ID \> 255 chars
  - **close**
    - ferme la DB et isOpen() retourne false
- **DatabaseManager — historique tableau (#927)**
  - journalise une nouvelle saisie de score tableau
  - ne journalise pas si le score est inchangé
  - ne journalise pas un match sans score
- **safeJsonParse (#1007)**
  - parse un JSON valide
  - retourne le repli sur JSON corrompu sans lever
  - retourne le repli sur null / vide
- **cache de statements borné (#1007)**
  - ne dépasse pas la taille max et réutilise les statements

</details>

<details>
<summary><code>src/database/repos/rowMappers.test.ts</code> — 4 tests</summary>

- **rowMappers**
  - healMatchStatus : scores complets → terminé
  - healMatchStatus : en cours sans score → non commencé
  - parsePoolRefereeIds : liste JSON, sinon repli sur referee\_id
  - rowToReferee : découpe nom / prénom

</details>

<details>
<summary><code>src/database/repos/signatureRepo.test.ts</code> — 4 tests</summary>

- **SignatureRepo**
  - enregistre une signature de poule (upsert)
  - mappe les lignes en camelCase
  - ne requête pas sans identifiants de match
  - requête par lot avec placeholders

</details>

<details>
<summary><code>src/database/validation.test.ts</code> — 87 tests</summary>

- **ValidationError**
  - est une instance de Error
  - expose le champ optionnel
  - fonctionne sans champ
- **validateId**
  - accepte un ID valide
  - rejette une chaîne vide
  - rejette une chaîne blanche
  - rejette un ID \> 255 caractères
  - accepte exactement 255 caractères
  - utilise le nom de champ par défaut "ID"
  - inclut le fieldName fourni dans le message
- **validateRequiredString**
  - accepte une chaîne valide
  - rejette une chaîne vide
  - rejette une chaîne uniquement blanche
  - rejette une chaîne dépassant maxLength
  - accepte une chaîne égale à maxLength
  - utilise maxLength=255 par défaut
- **validateOptionalString**
  - accepte undefined
  - accepte une chaîne valide
  - rejette une chaîne trop longue
  - accepte null (traité comme undefined)
- **validateNumber**
  - accepte un nombre dans la plage
  - rejette NaN
  - rejette un nombre inférieur au min
  - rejette un nombre supérieur au max
  - accepte la valeur min
  - accepte la valeur max
  - fonctionne sans max
- **validateOptionalNumber**
  - accepte undefined
  - accepte null (traité comme undefined)
  - valide si présent
- **validateDate**
  - accepte une Date valide
  - rejette une Date invalide
  - rejette une chaîne
- **validateOptionalDate**
  - accepte undefined
  - valide si présent
- **validateEnum**
  - accepte une valeur valide
  - rejette une valeur hors de la liste
  - inclut les valeurs valides dans le message
- **validateOptionalEnum**
  - accepte undefined
  - valide si présent
- **validateArray**
  - accepte un tableau valide
  - accepte un tableau vide
  - rejette un non-tableau
  - rejette un tableau dépassant maxLength
  - accepte un tableau égal à maxLength
- **validateCompetitionSettings**
  - accepte des settings valides
  - rejette un defaultPoolMaxScore \> 15
  - rejette un poolRounds hors plage
  - rejette un minTeamSize \< 1
- **validateCompetitionData**
  - accepte des données valides
  - rejette un titre vide
  - rejette une date invalide
  - rejette une arme inconnue
  - rejette une URL invalide
  - accepte une URL valide
  - rejette une couleur invalide
  - accepte une couleur hex valide
- **validateFencerData**
  - accepte des données valides
  - rejette un ref à 0
  - rejette un lastName vide
  - rejette une nationalité invalide
  - accepte une nationalité 2 lettres
  - rejette une date de naissance dans le futur
- **validateMatchData**
  - accepte des données valides
  - rejette un maxScore de 0
  - rejette endTime \<= startTime
  - accepte startTime \< endTime
  - rejette un statut inconnu
- **validatePoolData**
  - accepte des données valides
  - rejette un numéro de poule à 0
  - rejette un phaseId vide
  - rejette un tableau de tireurs \> 20
  - rejette un tireur sans id dans le tableau
- **validateSessionState**
  - accepte un objet valide vide
  - rejette null
  - rejette une chaîne
  - valide currentPhase si présent
  - rejette uiState non-objet
- **sanitizeString**
  - supprime les espaces en début et fin
  - supprime les balises \< et \>
  - conserve les caractères normaux
- **sanitizeText (#1147)**
  - retire \< et \> mais garde les noms usuels
  - remplace les caractères de contrôle par des espaces et réduit les espaces
  - null et undefined donnent une chaîne vide
- **sanitizeId**
  - conserve lettres, chiffres, tirets et underscores
  - supprime les caractères spéciaux
  - trim avant de filtrer

</details>

### `src/main/`

<details>
<summary><code>src/main/appLifecycle.test.ts</code> — 4 tests</summary>

- **shutdownDb**
  - checkpoint puis ferme une base ouverte
  - ne fait rien si la base est déjà fermée
- **handleAllWindowsClosed**
  - macOS : la base reste ouverte et l’app ne quitte pas
  - Windows / Linux : ferme la base puis quitte

</details>

<details>
<summary><code>src/main/certManager.test.ts</code> — 2 tests</summary>

- **certManager**
  - buildAltNames : localhost, loopback et IPv4 externes uniquement
  - ensureCert génère un certificat avec SAN réels, puis le réutilise

</details>

<details>
<summary><code>src/main/demoScreensLayout.test.ts</code> — 5 tests</summary>

- **demoScreens**
  - liste arènes, tablette arbitre et affichage du tournoi
  - borne le nombre d’écrans d’arène entre 1 et 2
- **tileLayout**
  - vide si aucun écran
  - une fenêtre occupe toute la zone
  - mosaïque 2 colonnes

</details>

<details>
<summary><code>src/main/diagnosticReport.test.ts</code> — 6 tests</summary>

- **buildDiagnosticReport (#1326)**
  - ne garde que la liste blanche de champs
  - sérialise la date en ISO et conserve les versions
- **diagnosticFileName (#1326)**
  - produit un nom de fichier horodaté sans caractères interdits
- **exportDiagnosticReport (#1326)**
  - écrit le JSON au chemin choisi avec le nom proposé
  - signale une annulation sans rien écrire
  - renvoie une erreur lisible si l'écriture échoue

</details>

<details>
<summary><code>src/main/eventLoopMonitor.test.ts</code> — 3 tests</summary>

- **EventLoopMonitor (#1154)**
  - snapshot vide avant toute mesure
  - détecte un blocage synchrone et se remet à zéro
  - start/stop idempotents

</details>

<details>
<summary><code>src/main/ipc/cryptoHandlers.test.ts</code> — 4 tests</summary>

- **registerCryptoHandlers (#1341)**
  - enregistre les trois canaux crypto:\*
  - protect / unprotect font l’aller-retour en base64
  - renvoie null sans chiffrement disponible
  - refuse les entrées non-chaîne

</details>

<details>
<summary><code>src/main/ipc/dbHandlers.test.ts</code> — 3 tests</summary>

- **bus d’événements db (#1298)**
  - emitCompetitionEvent diffuse aux fenêtres
  - db:updateMatch et db:createMatch émettent matches:changed
  - db:addFencer émet fencers:changed pour la compétition

</details>

<details>
<summary><code>src/main/ipc/fileHandlers.test.ts</code> — 2 tests</summary>

- **registerFileHandlers (#1341)**
  - enregistre les canaux file:\* et dialog:\*
  - refuse d’écrire un chemin non autorisé par une boîte de dialogue (#1146)

</details>

<details>
<summary><code>src/main/ipc/ftpHandlers.test.ts</code> — 12 tests</summary>

- **parseRemoteUrl (#1331)**
  - accepte ftp et ftps, avec port et dossier décodé
  - accepte http et https pour un dépôt HTTP PUT
  - refuse les autres schémas, les URL sans hôte et les identifiants dans l'URL
- **parseFtpRequest (#1331)**
  - accepte une requête bien formée
  - refuse un nom de fichier, un XML, une URL ou des identifiants invalides
- **publishRemote en FTP/FTPS (#1331)**
  - se connecte, va dans le dossier, dépose le fichier puis ferme
  - n'envoie pas d'identifiant vide et ne change pas de dossier à la racine
  - ferme toujours la connexion et remonte l'erreur, sans le mot de passe
- **publishRemote en HTTP PUT (#1331)**
  - envoie le XML en PUT vers \<dossier\>/\<fichier\> avec authentification Basic
  - sans identifiant complet, n'envoie pas d'en-tête Authorization
  - remonte le code HTTP en cas d'échec, sans le mot de passe
- **publishRemote : URL refusée (#1331)**
  - ne se connecte pas si le schéma est refusé

</details>

<details>
<summary><code>src/main/ipc/gregHandlers.test.ts</code> — 8 tests</summary>

- **parseGregRequest (#1328)**
  - accepte une requête bien formée
  - refuse un nom de fichier qui sort du dossier attendu
  - refuse un champ inconnu ou manquant
  - ignore les champs supplémentaires (jamais transmis)
  - refuse un XML vide ou une requête non objet
- **publishToGreg (#1328)**
  - envoie le fichier puis valide le formulaire, dans cet ordre
  - s'arrête à la première étape en erreur HTTP
  - remonte une erreur réseau sans lever d'exception

</details>

<details>
<summary><code>src/main/ipc/remoteClientsHandlers.test.ts</code> — 4 tests</summary>

- **registerRemoteClientsHandlers (#1341)**
  - enregistre les canaux clients et synthèse vocale
  - getConnectedClients : serveur absent → liste vide
  - getLogos : fichier absent → liste vide
  - saveLogos : entrée non tableau refusée

</details>

<details>
<summary><code>src/main/ipc/remoteDisplayHandlers.test.ts</code> — 2 tests</summary>

- **registerRemoteDisplayHandlers (#1341)**
  - enregistre les canaux écrans / notes / signature
  - clearOrgNote : serveur absent

</details>

<details>
<summary><code>src/main/ipc/remoteMatchHandlers.test.ts</code> — 2 tests</summary>

- **registerRemoteMatchHandlers (#1341)**
  - enregistre tous les canaux de session / rencontres
  - refuse proprement quand le serveur n’est pas démarré

</details>

<details>
<summary><code>src/main/ipc/remoteServerHandlers.test.ts</code> — 3 tests</summary>

- **registerRemoteServerHandlers (#1341)**
  - enregistre les canaux de cycle de vie du serveur
  - getServerInfo / stopServer : serveur absent
  - getNetworkInterfaces propose toujours 0.0.0.0

</details>

<details>
<summary><code>src/main/ipc/remoteSessionHandlers.test.ts</code> — 2 tests</summary>

- **registerRemoteSessionHandlers (#1341)**
  - enregistre les canaux de session et de réglages
  - stopSession : serveur absent

</details>

<details>
<summary><code>src/main/ipc/remoteSettingsHandlers.test.ts</code> — 2 tests</summary>

- **registerRemoteSettingsHandlers (#1341)**
  - enregistre les canaux de réglages
  - setCheckinEnabled : serveur absent

</details>

<details>
<summary><code>src/main/ipc/windowPrintHandlers.test.ts</code> — 3 tests</summary>

- **registerWindowPrintHandlers (#1341)**
  - enregistre les canaux fenêtre / impression / shell
  - shell:openExternal : https uniquement
  - sans fenêtre : setSize et print sont sans effet

</details>

<details>
<summary><code>src/main/mainWindowRef.test.ts</code> — 2 tests</summary>

- **mainWindowRef**
  - renvoie null par défaut puis la fenêtre définie
  - renvoie null si la fenêtre est détruite

</details>

<details>
<summary><code>src/main/menu.test.ts</code> — 3 tests</summary>

- **createMenu (#1341)**
  - construit un menu avec plusieurs sections
  - Ctrl+S force la sauvegarde et notifie le renderer
  - échec de sauvegarde : signale autosave:failed

</details>

<details>
<summary><code>src/main/menuActions.test.ts</code> — 4 tests</summary>

- **createMenuActions (#1341)**
  - handleExport relaie le format au renderer
  - showAbout prévient le renderer
  - « Enregistrer sous » exporte la compétition courante, nom de fichier assaini
  - sans compétition courante : export global

</details>

<details>
<summary><code>src/main/pathAuthorization.test.ts</code> — 14 tests</summary>

- **chemins autorisés (#1146)**
  - refuse un chemin jamais choisi par dialogue
  - accepte un chemin autorisé, refuse l’autre sens
  - refuse chemins relatifs et octet nul
  - autorisation expirée
  - refuse extensions exécutables en écriture
  - contrôle l’extension attendue en lecture
  - refuse un lien symbolique
- **limites ZIP (#1146)**
  - noms d’entrée dangereux
  - ne renvoie que des noms sûrs (JSZip neutralise déjà ../)
  - refuse trop d’entrées
  - refuse une bombe (entrée trop grosse décompressée)
  - refuse un fichier trop gros avant lecture
- **validation fencers.json (#1146)**
  - accepte une liste valide
  - refuse non-tableau, éléments mal formés, champs trop longs

</details>

<details>
<summary><code>src/main/pdfPageCount.test.ts</code> — 2 tests</summary>

- **countPdfPages**
  - compte les pages et ignore /Pages
  - 0 si aucun objet page

</details>

<details>
<summary><code>src/main/pdfPreview.test.ts</code> — 5 tests</summary>

- **previewPdf (#1214)**
  - écrit un PDF temporaire, l’ouvre dans la fenêtre interne et le supprime à la fermeture
  - repli sur le lecteur externe si la fenêtre ne peut pas s’ouvrir
  - repli sur le lecteur externe si le chargement échoue
  - repli externe : le PDF n’est pas supprimé à la fermeture de la fenêtre ratée
  - erreur de rendu : échec sans fichier résiduel

</details>

<details>
<summary><code>src/main/pendingUpdate.test.ts</code> — 7 tests</summary>

- **pendingUpdate**
  - relit un JSON valide
  - rejette un chemin hors du dossier privé
  - accepte un fichier dans le répertoire de téléchargement choisi (et lui seul)
  - rejette un traversal de chemin
  - rejette un JSON falsifié (champs manquants / invalide)
  - rejette des droits trop larges
  - nom aléatoire sans traversal

</details>

<details>
<summary><code>src/main/printDialog.test.ts</code> — 20 tests</summary>

- **parsePageRanges (#1214)**
  - vide = toutes les pages
  - page seule et plage
  - trie et fusionne les plages qui se touchent
  - rejette %s _(each)_
  - format printToPDF
- **normalizePrintSettings (#1214)**
  - valeurs par défaut pour une entrée invalide
  - borne copies et échelle, rejette énumérations et plages inconnues
  - conserve des réglages valides
- **options Electron (#1214)**
  - printToPDF : échelle en fraction, marges en pouces
  - printToPDF : le document décide du format tant que rien n’est imposé
  - print : silencieux, imprimante, pages 0-indexées
  - print : imprimante par défaut et toutes les pages sans clés superflues
- **handlers print:\* (#1214)**
  - liste les imprimantes, \[\] en cas d’erreur
  - aperçu : PDF en mémoire avec les réglages normalisés
  - refuse un HTML vide ou non textuel
  - impression : envoie les options et remonte les échecs
- **enregistrement PDF (#1214)**
  - nom de fichier sans caractère interdit
  - rend avec les réglages puis écrit au chemin choisi
  - annulation du dialogue : rien n’est rendu ni écrit
  - erreur d’écriture remontée, HTML vide refusé

</details>

<details>
<summary><code>src/main/proxySettings.test.ts</code> — 8 tests</summary>

- **normalizeProxyServer**
  - hôte:port → http implicite
  - schémas acceptés
  - refuse identifiants, chemin, port absent/invalide, schéma inconnu
- **normalizeBypass**
  - nettoie la liste
- **sanitizeProxySettings / toElectronProxyConfig**
  - modes système et direct
  - manuel : serveur + exclusions, machine locale toujours en direct
  - manuel sans serveur valide ou mode inconnu → null
- **persistance**
  - défaut système ; relit ce qui est écrit ; fichier corrompu → défaut

</details>

<details>
<summary><code>src/main/remote/activeWave.test.ts</code> — 4 tests</summary>

- **applyActiveWave**
  - réapplique la vague mémorisée (y compris aucune vague lancée = liste vide)
  - vagues terminées : fermeture des poules réappliquée au redémarrage (#1118)
  - rien de mémorisé (hors rapières) : serveur laissé sans filtre
  - setActiveWave sans serveur : mémorisé ; avec serveur : appliqué ; non-tableau = null

</details>

<details>
<summary><code>src/main/remote/arenaSlots.test.ts</code> — 7 tests</summary>

- **sous-pistes des rapières (#1118)**
  - identifiants : piste de base et détection
  - copie de la piste : numéro, mot de passe, poule, état vierge
  - attribution : piste puis sous-pistes, stable par tablette, piste occupée sautée
  - préférence pour la sous-piste actuelle, plafond par piste
  - libération : seules les sous-pistes sans match en cours
  - matchs pris par les autres sous-pistes (terminés exclus)
  - match seulement préchargé (ni ouvert, ni chrono lancé) : pas pris

</details>

<details>
<summary><code>src/main/remote/auth.test.ts</code> — 10 tests</summary>

- **parseCookies**
  - décode les paires et ignore les parties malformées
- **mots de passe scrypt**
  - hash salé, vérification à temps constant
  - variante asynchrone équivalente (#1154)
  - refuse un mot de passe trop court, accepte le vide (suppression)
- **jetons de session**
  - valides jusqu’à expiration, puis supprimés
  - plafond par portée : évince les plus anciens
  - purge des jetons expirés
- **LoginGuard**
  - 5 tentatives par IP et par minute
  - blocage exponentiel après 5 échecs, alerte opérateur, levé par un succès
- **MinuteRateLimiter**
  - limite par clé sur une minute

</details>

<details>
<summary><code>src/main/remote/csp.test.ts</code> — 7 tests</summary>

- **CSP pages distantes (#1149)**
  - nonce aléatoire base64 de 16 octets
  - addNonces marque script et style, sans doublon
  - politique : script-src sans unsafe-inline, objets et base verrouillés
  - sendHtmlPage pose en-tête et nonce cohérents
  - %s : aucun handler inline ni javascript: _(each)_
  - app.js sans handler inline
  - chaque data-click statique cible une fonction définie dans la page

</details>

<details>
<summary><code>src/main/remote/demoMode.test.ts</code> — 13 tests</summary>

- **touchPoints**
  - compte 1 point par touche hors Laser
  - Laser : zone tirée parmi les zones autorisées (1, 3 ou 5 points)
- **decideDemoAction**
  - démarre un match prêt
  - ne fait rien hors match en cours (arène terminée ou libre)
  - termine dès qu’un tireur atteint la limite
  - marque un point du côté tiré au sort quand le tirage passe le seuil
- **DemoPlayer**
  - génère des matchs avec deux tireurs fictifs et des identifiants uniques
  - joue un match complet de bout en bout jusqu’à la limite
  - Laser restreint à la zone C : chaque touche vaut 5 points
  - ignore les arènes sans match
  - pilote l’arbitrage à intervalle régulier et s’arrête sur demande
- **DemoPlayer + poules**
  - enregistre le score final dans la poule à la fin du match
- **DemoPlayer chrono**
  - diffuse le temps restant des matchs en cours

</details>

<details>
<summary><code>src/main/remote/demoTournament.test.ts</code> — 6 tests</summary>

- **bracketSeedOrder**
  - place 1 et 2 aux extrémités du tableau
- **DemoTournament**
  - distribue chaque duel de poule une seule fois, puis passe au classement
  - matrice : duels en cours signalés jusqu’au score
  - enchaîne classement → tableau → classement final → nouveau tournoi
  - ignore un score inconnu
  - classement de poule : V/M puis indice

</details>

<details>
<summary><code>src/main/remote/fencerSchedule.test.ts</code> — 9 tests</summary>

- **buildFencerSchedule (#1078)**
  - liste les matchs du tireur avec scores de son point de vue
  - donne le prochain match, sa piste et le nombre de matchs avant
  - marque le match en cours sur une piste
  - piste inconnue si la poule n’est assignée à aucune arène
  - null pour un tireur sans match
  - **tableau (#1078)**
    - sépare poules et tableau, tableau trié par tour
    - prochain match de tableau : piste assignée au match
    - piste du match en cours prioritaire sur la piste prévue
    - piste prévue de la poule quand aucune arène ne la joue encore (#1078)

</details>

<details>
<summary><code>src/main/remote/htmlLoader.test.ts</code> — 3 tests</summary>

- **htmlLoader**
  - inlineSocketIoClient remplace la balise sans interpréter les motifs \`$&\`
  - inlineSocketIoClient laisse le HTML intact sans balise connue
  - loadRemoteHtmlFiles ne charge que des pages connues et injecte le client

</details>

<details>
<summary><code>src/main/remote/i18nBundle.test.ts</code> — 6 tests</summary>

- **i18n des pages distantes découpé par langue (#1213)**
  - /i18n.js = langues puis moteur ; T() traduit dans la langue configurée
  - chaque langue a les mêmes clés que le français
  - modules js/ extraits des pages servis en /js/\<nom\>.js (#1401)
  - src/remote/js/kioskEta.js est bien servi
  - tokens.css servi et styles.css sans couleur hexadécimale en dur (#1538)
  - fichiers communs : absents ignorés, i18n.js concaténé

</details>

<details>
<summary><code>src/main/remote/pageStore.test.ts</code> — 9 tests</summary>

- **negotiateEncoding (#1151)**
  - préfère br puis gzip, respecte q et \*
- **etagMatches**
  - liste, faible, \*
- **extractInlineScripts**
  - extrait, déduplique, garde src et JSON, conserve l’ordre
  - balise fermante tolérante : \</script \>, \</SCRIPT foo\> (CodeQL js/bad-tag-filter)
  - page sans inline restant
- **sendStored**
  - brotli, gzip ou identité selon Accept-Encoding
  - 304 si ETag identique
- **jsonCompression**
  - compresse au-delà du seuil seulement
- **critère #1151 : referee.html \< 60 Ko en brotli (client socket.io compris)**
  - premier chargement

</details>

<details>
<summary><code>src/main/remote/publicDto.test.ts</code> — 8 tests</summary>

- **stripPersonalData**
  - retire date de naissance, licence et photo à toute profondeur, sans muter
  - photo conservée sur demande (affichage des photos actif)
  - retire le code (licence) des arbitres et les IP des événements
  - valeurs non objets et instances (Date, Buffer) inchangées
- **publicJson (REST)**
  - GET sans cookie : aucune donnée personnelle dans le JSON
- **createPublicParser (Socket.IO)**
  - paquet sortant filtré, paquet source intact
  - photo diffusée quand l’affichage des photos est actif, jamais la licence
  - décodage côté client inchangé (format standard)

</details>

<details>
<summary><code>src/main/remote/reducedMotion.test.ts</code> — 2 tests</summary>

- **pages distantes — prefers-reduced-motion**
  - common.js injecte le repli
  - ${page}.html charge common.js

</details>

<details>
<summary><code>src/main/remote/refereeResolver.test.ts</code> — 4 tests</summary>

- **refereeResolver (#1240)**
  - resolveReferee : trouve par id, null sinon ou sans session
  - resolvePoolReferee : joint les arbitres de la poule, repli sur les champs du payload
  - resolveTableauMatchReferees : seulement à partir de 2 arbitres, consolantes incluses
  - resolveDeMatchReferee : referees, puis referee, puis refereeId

</details>

<details>
<summary><code>src/main/remote/routes/pageRoutes.test.ts</code> — 4 tests</summary>

- **registerPageRoutes (#1065)**
  - planning tireur : données de session via le contexte
  - planning tireur : matchs de tableau terminés lus en base
  - planning tireur : 404 inconnu, 400 identifiant invalide
  - ETA publique : null sans session ou en entraînement

</details>

<details>
<summary><code>src/main/remote/routes/registrationRoutes.test.ts</code> — 3 tests</summary>

- **POST /api/register**
  - refuse un champ texte de plus de 200 caractères sans le traiter
  - retire chevrons et caractères de contrôle, garde apostrophes et &
  - ignore les champs non textuels sans planter

</details>

<details>
<summary><code>src/main/remote/stripPlan.test.ts</code> — 4 tests</summary>

- **normalizeStripPlan**
  - valeurs par défaut pour une entrée invalide
  - trie, déduplique et filtre les pistes indisponibles
- **visibleArenas**
  - masque les arènes avant la piste de départ
  - tout visible par défaut

</details>

<details>
<summary><code>src/main/remote/trainingLobby.test.ts</code> — 12 tests</summary>

- **TrainingLobby (#1500)**
  - occupe une piste : un autre client est refusé
  - liste : occupée pour les autres, « mine » pour le propriétaire
  - libération après 3 minutes sans activité
  - l'activité repousse l'expiration
  - release : seulement par le propriétaire ; releaseAll libère tout
  - changer de piste libère la précédente
- **routes du lobby entraînement (#1500)**
  - sert la page /entrainement-lobby
  - hors entraînement : état vide, occupation refusée
  - liste les pistes principales (sans sous-pistes) avec leur occupation
  - piste occupée : 409 arena\_occupied pour un autre client
  - validation : piste inconnue 404, client invalide 400
  - release libère la piste (ou toutes sans numéro)

</details>

<details>
<summary><code>src/main/remoteScoreServer.test.ts</code> — 105 tests</summary>

- **RemoteScoreServer**
  - **démarrage du serveur**
    - construit une instance sans erreur
    - reprend la langue de l'application dès la création (#1213)
    - getServerUrl retourne une URL avec le bon port
    - getLocalIPAddress retourne une chaîne non vide
    - start() appelle server.listen
    - stop() appelle server.close
  - **route /api/auth/login/:arenaId**
    - retourne 401 si PIN incorrect pour une arène avec mot de passe
    - retourne succès si mot de passe correct (stocké hashé via setArenaPassword)
    - retourne succès si arène sans mot de passe
  - **rate limiting score**
    - checkScoreRateLimit retourne true pour le premier appel
    - checkScoreRateLimit retourne false après SCORE\_RATE\_LIMIT appels
    - SCORE\_RATE\_LIMIT est défini et \> 0
  - **arenaEventBuffer**
    - le buffer est initialement vide pour toutes les arènes
    - pushArenaEvent ajoute un événement dans le buffer
    - EVENT\_BUFFER\_MAX limite la taille du buffer
    - EVENT\_BUFFER\_TTL\_MS est supérieur à 60 secondes
  - **persistArenaState**
    - n'appelle pas saveArenaState si pas de session
    - appelle saveArenaState si une session est active
  - **plan des pistes partagé (#1501)**
    - masque les arènes hors intervalle et diffuse le plan
  - **kiosk:data (#1152)**
    - regroupe les notifications sur 300 ms
    - s’abonne aux écritures de la base et se désabonne à l’arrêt
  - **broadcastDashboardUpdate (#1069)**
    - ne relit pas la base quand aucun dashboard n’est abonné
    - diffuse aux dashboards abonnés
  - **horodatage des touches pour le replay (#1074)**
    - conserve la date des événements déjà vus et date les nouveaux
  - **fin estimée de phase (#1077)**
    - le snapshot dashboard inclut une ETA basée sur les durées réelles
    - tableau : seul le tour en cours est estimé, sur les pistes de la session
    - ajouter des pistes en cours de session crée les arènes
  - **liste des arbitres de session**
    - inclut les arbitres ajoutés après le démarrage de la session
    - ne lit pas la base en mode entraînement
  - **ordre des matchs public (#911) et arbitre de poule (#908)**
    - expose uniquement noms, ordre, statut et scores, sans authentification
    - la liste tablette porte l'arbitre de la poule quand le match n'en a pas
  - **carton noir (paramètre compétition)**
    - désactivé par défaut et exposé via /api/session
    - updateBlackCardEnabled active le flag et le diffuse aux arènes
  - **score max et repos issus des paramètres (#1125 #1134)**
    - épée : score max poules / tableau des propriétés, pas 15
    - formule personnalisée : score max du tableau appliqué aux matchs de tableau
    - tableau illimité (0) : pas de notification de fin
    - Laser Sabre : 15 inchangé
  - **piste assignée aux poules (pool.strip)**
    - poule assignée piste 3 → match sur arena3, pas arena1
    - piste au-delà du nombre configuré → arènes étendues
    - sans piste → ordre des poules sur pistes libres
  - **réassignation manuelle de piste (#1037)**
    - match réassigné en tête de liste de la piste cible, retiré de la piste source
    - rapières : seuls les matchs de la vague active sont proposés aux tablettes (#1118)
    - rapières : vagues terminées, plus aucun match de poule proposé (#1118)
    - rapières : une sous-piste par tablette, matchs non partagés entre sous-pistes (#1118)
    - rapières : sous-piste authentifiée avec le jeton de la piste (#1118)
    - les réassignations suivantes se rajoutent par le haut
    - joué ensuite, puis la piste reprend sa propre poule
  - **arbitre des matchs de tableau assigné depuis l'appli (#977)**
    - arbitre transmis au match chargé sur la tablette
    - changement d'arbitre → match en cours mis à jour
    - arbitre retiré → plus d'arbitre sur la tablette
    - mode expert : tous les arbitres affichés
    - match en file d'attente : arbitre porté
  - **annulation carton noir depuis la tablette**
    - égalité finale : le tireur prioritaire tiré (coin\_flip) gagne (#1442)
    - liste le carton noir de l'arène
    - annule : réintègre le combattant, rouvre le match avec son score et rend ses matchs jouables
    - refuse l'annulation d'un carton noir en tableau
    - 404 pour une autre arène
  - **appel distant (#919)**
    - refuse la connexion tant que le DT n'a pas défini de mot de passe
    - refuse un mot de passe incorrect et ne stocke pas le mot de passe en clair
    - liste tireurs/arbitres uniquement avec un cookie valide
    - pointe un tireur présent (statut P) et un arbitre disponible
    - n'écrase pas un statut sportif (éliminé)
    - ferme l'appel hors phase CHECKIN
    - invalide les sessions quand le mot de passe change
  - **P0 : actions mutantes protégées par l'auth d'arène**
    - POST /api/arenas/:arenaId/%s refuse sans cookie (401) _(each)_
    - POST /api/arenas/:arenaId/score accepte avec un cookie valide
    - POST /api/session/%s réservé au loopback (403) _(each)_
    - POST /api/session/stop accepté depuis le loopback
    - POST /api/sync refuse sans cookie (401)
    - socket arena\_control refusé sans cookie, sans avoir rejoint l'arène
    - socket arena\_control accepté avec cookie valide
    - socket arena\_control toggle\_swap reste autorisé pour l'écran d'arène
    - **événements team\_\***
      - %s refusé sans cookie _(each)_
      - team\_touch accepté avec cookie, points invalides ignorés
      - **relais FIE (#1086)**
        - touche simple uniquement (pas de zones hors mode points)
        - relais suivant : vainqueur au cumul, score du relais persisté
        - carton individuel : escalade, persistance, motif inconnu refusé
        - état public : cumul, palier du relais, cible, motifs de carton
  - **P1 : anti force brute**
    - hash scrypt salé : deux hash du même mot de passe diffèrent et se vérifient
    - refuse un mot de passe de moins de 8 caractères (arène et appel), vide autorisé
    - X-Forwarded-For ignoré : un en-tête aléatoire ne contourne plus la limite par IP
    - X-Forwarded-For lu seulement si trustProxy activé
    - limite par arène : 20 tentatives/min tous clients confondus
    - blocage progressif après 5 échecs, même après la fenêtre d'une minute
    - un succès remet à zéro les échecs de l'IP
    - jeton expiré côté serveur refusé
    - nombre de jetons plafonné par arène
  - **P2 : durcissement réseau / DoS**
    - isAllowedOrigin : même hôte / LAN acceptés, origine externe refusée
    - POST avec Origin étrangère refusé (403), Origin même hôte accepté
    - limite JSON réduite sur les routes de connexion
    - /api/debug réservé à la machine hôte
    - refuse au-delà de 30 sockets simultanées par IP, libère à la déconnexion
    - déconnecte une socket qui inonde le serveur d'événements
    - client:register enregistre l'IP de la socket, pas X-Forwarded-For
  - **#993/#995/#997 : DoS socket et XSS**
    - %s avec données nulles : aucune exception _(each)_
    - sanitizeAnnouncement : balises retirées, carton inconnu normalisé
    - journal : numéro de piste non numérique refusé (400)
    - résultats : identifiant de compétition hors format refusé (400)
  - **#989 : espace formateurs**
    - fermé tant que non activé / sans mot de passe
    - login puis commentaire enregistré ; sans cookie → 401
    - mauvais mot de passe refusé
  - **finishPoolMatch (saisie dans l'application)**
    - conserve le drapeau forfait sur le perdant (#1144)
    - sans statut spécial : score simple, aucun drapeau
- **mode démo (session d’entraînement)**
  - joue seule les matchs de chaque arène jusqu’à la fin et alimente l’historique
  - simule l’arme choisie : Laser restreint à la zone C → scores par tranches de 5

</details>

<details>
<summary><code>src/main/splash.test.ts</code> — 6 tests</summary>

- **splash : langue mémorisée (#1341)**
  - fr par défaut sans fichier
  - aller-retour de la langue enregistrée
  - fichier corrompu : repli sur fr
  - splash activé par défaut
  - désactivation du splash conserve la langue
  - closeSplash sans fenêtre appelle le rappel immédiatement

</details>

<details>
<summary><code>src/main/updateAssets.test.ts</code> — 24 tests</summary>

- **detectInstallKind**
  - AppImage sous Linux
  - exe portable sous Windows
  - installeur par défaut
- **detectInstallKind — macOS / paquets Linux**
  - macOS : bundle .app dans un dossier inscriptible → macapp
  - macOS : dossier en lecture seule (translocation) → installer
  - Linux hors AppImage : deb sur Debian/Ubuntu, rpm sinon
  - AppImage prioritaire sur le paquet
  - macAppBundle
- **selectUpdateAsset**
  - Windows installé → setup NSIS, jamais le portable
  - Windows portable → portable
  - macOS respecte l’architecture
  - Linux AppImage → AppImage de la bonne arch
  - Linux paquet → deb en priorité
  - macOS .app inscriptible → zip de la bonne arch
  - macOS .app sans zip publié → dmg
  - Linux deb / rpm → format du système, sinon AppImage
  - accepte un asset sans arch
  - null si rien d’adapté
- **replaceExecutableInPlace**
  - remplace le fichier cible (${platform})
  - false si le dossier n’existe pas
- **portableSideBySidePath**
  - nom de l’asset dans le dossier de l’exe courant
  - même nom que l’exe courant ou fichier existant → suffixe
  - nom d’asset hostile ou absent neutralisé
- **isSafePortableCleanup**
  - uniquement un autre .exe du même dossier

</details>

<details>
<summary><code>src/main/updateIntegrity.test.ts</code> — 9 tests</summary>

- **parseSha256Digest**
  - extrait le hash sha256
  - rejette les formats invalides
- **isTrustedDownloadUrl**
  - accepte les hôtes GitHub en HTTPS
  - rejette HTTP, hôtes inconnus et valeurs invalides
- **sha256File / verifyFileSha256**
  - calcule le sha256
  - valide un hash correct
  - rejette un hash incorrect ou invalide
- **toTrustedDownloadUrl**
  - reconstruit l’URL sur l’hôte de confiance
  - refuse autre hôte, http, port, identifiants

</details>

<details>
<summary><code>src/main/updateNativeInstall.test.ts</code> — 6 tests</summary>

- **replaceMacAppBundle**
  - remplace le bundle par celui de l’archive (ditto simulé)
  - archive sans .app → erreur, bundle intact, pas de reste
  - extraction en échec → bundle intact
- **linuxPackageInstallCommand**
  - deb : apt-get via pkexec, sinon dpkg
  - rpm : dnf, zypper, puis rpm
  - null sans pkexec ou chemin relatif

</details>

<details>
<summary><code>src/main/updateReleases.test.ts</code> — 4 tests</summary>

- **parseReleaseBuild**
  - lit le build dans le nom, sinon le tag, sinon le corps
- **pickLatestRelease**
  - canal dev : build le plus élevé, quel que soit l’ordre
  - canal stable : ignore les pré-releases
  - ignore les brouillons ; null si rien

</details>

<details>
<summary><code>src/main/updaterSettings.test.ts</code> — 8 tests</summary>

- **updaterSettings**
  - vérification auto activée par défaut
  - persiste la désactivation
  - JSON invalide → défaut
  - persiste le canal choisi, ignore une valeur invalide
  - resolveChannel : choix utilisateur prioritaire sur le paquet
  - conserve cleanupExe (ancien exe portable à supprimer)
  - répertoire de téléchargement : persisté, absent par défaut
  - isUsableDownloadDir : dossier absolu existant uniquement

</details>

<details>
<summary><code>src/main/webhook.test.ts</code> — 6 tests</summary>

- **webhook (#1269)**
  - ajoute content (Discord) à partir de text (Slack) et conserve les champs
  - ajoute text à partir de content
  - message par défaut si le corps est sans texte
  - refuse une URL non sécurisée sans requête
  - succès sur 204 (Discord) et envoie le JSON avec content
  - échec explicite sur 4xx et sur erreur réseau

</details>

<details>
<summary><code>src/main/windowSecurity.test.ts</code> — 11 tests</summary>

- **isAppUrl (#1148)**
  - prod : file:// du bundle uniquement
  - dev : serveur webpack uniquement
- **isAllowedExternalUrl**
  - https oui, http seulement réseau local, autres schémas non
- **isPermissionAllowed**
  - caméra depuis l’app uniquement, sans micro
- **configuration Electron (#1148)**
  - fenêtre principale en sandbox avec garde-fous
  - fuses : RunAsNode off, asar seul
  - meta CSP du renderer sans unsafe-inline pour les scripts
  - meta CSP du renderer sans unsafe-inline pour les styles (#1157)
- **CSP de session (#1343)**
  - fenêtre principale : style-src strict
  - impression / PDF : unsafe-inline pour les styles seulement
  - seule la fenêtre principale est stricte

</details>

<details>
<summary><code>src/main/xlsxToCsv.test.ts</code> — 2 tests</summary>

- **xlsxToCsv (#1211)**
  - lit chaînes partagées, chaînes en ligne, nombres et cellules manquantes
  - rowsToCsv protège séparateurs et guillemets

</details>

### `src/renderer/services/`

<details>
<summary><code>src/renderer/services/ipcError.test.ts</code> — 3 tests</summary>

- **ipcErrorText (#1159)**
  - code traduit, paramètres de la réponse interpolés
  - texte libre, code inconnu, absence d’erreur
  - chaque code renvoyé par le process principal a sa clé errors.\* (fr)

</details>

<details>
<summary><code>src/renderer/services/logoLibrary.test.ts</code> — 7 tests</summary>

- **logoLibrary**
  - sanitize filtre les entrées invalides et doublons
  - sanitize borne la taille
  - ensureActiveInLibrary migre le logo actif hérité
  - addLogo refuse au-delà du maximum
  - renameLogo ignore un nom vide
  - removeLogo bascule le logo actif
  - logoNameFromFile retire l’extension

</details>

<details>
<summary><code>src/renderer/services/offlineStorage.test.ts</code> — 6 tests</summary>

- **cache compétition**
  - met en cache et relit une compétition
  - retourne null/undefined pour une compétition absente
- **pending actions**
  - ajoute, liste (triées par timestamp) et supprime
  - incrémente le compteur de tentatives
- **conflits**
  - ajoute, liste (non résolus) et résout
- **getSyncStatus**
  - agrège les compteurs en attente et conflits

</details>

<details>
<summary><code>src/renderer/services/offlineSync.test.ts</code> — 10 tests</summary>

- **triggerSync - gardes**
  - échoue si hors ligne
  - échoue si une synchro est déjà en cours
- **triggerSync - succès**
  - synchronise une file vide et notifie les callbacks
- **helpers / état**
  - isCurrentlyOnline reflète le drapeau interne
  - getEntityTypeFromAction déduit le type
  - getEntityIdFromAction extrait l’identifiant
- **conflits - deux tablettes hors ligne modifient le même match**
  - un 409 serveur transforme l’action en conflit stocké, sans bloquer les autres actions
  - resolveConflict("local") écrase le serveur avec la version locale
  - resolveConflict("remote") accepte la version serveur et met en cache
  - resolveConflict échoue si le conflit est introuvable

</details>

<details>
<summary><code>src/renderer/services/settingsTransfer.test.ts</code> — 5 tests</summary>

- **settingsTransfer**
  - exporte uniquement les clés connues, logos compris
  - aller-retour export → import restaure les valeurs
  - rejette un JSON invalide ou un autre format
  - ignore les clés inconnues et les valeurs invalides
  - nom de fichier daté

</details>

<details>
<summary><code>src/renderer/services/slashCommands.test.ts</code> — 14 tests</summary>

- **slashCommands – analyse**
  - parse le nom et les arguments
  - suggère par préfixe
  - garde la suggestion quand l’argument est saisi
  - résout la sélection : gabarit, saisie ou complétion
  - toutes les commandes ont une description i18n
- **slashCommands – exécution**
  - /update quiet active le mode silencieux, /update quiet off le coupe
  - /update vérifie et signale une version disponible
  - /update channel et /update auto
  - /remote start ouvre la phase et émet l’événement
  - /remote exige une compétition ouverte
  - /remote status donne l’URL
  - /phase, /open, /theme, /lang
  - commande inconnue → erreur
  - une exception devient un message d’erreur

</details>

<details>
<summary><code>src/renderer/services/uiDensity.test.ts</code> — 3 tests</summary>

- **densité d’affichage (#1541)**
  - valeurs admises uniquement, standard par défaut
  - enregistrement : attribut appliqué et relu au démarrage
  - tokens.css : variables de densité compacte et confortable

</details>

<details>
<summary><code>src/renderer/services/uiScale.test.ts</code> — 3 tests</summary>

- **taille du texte de l’interface (#1156)**
  - valeurs admises uniquement, 100 % par défaut
  - enregistrement : variable CSS appliquée et relue au démarrage
  - tokens.css : racine en fonction de --ui-scale, échelle --fs-\*, contraste élevé

</details>

### `src/renderer/hooks/`

<details>
<summary><code>src/renderer/hooks/useAppState.test.tsx</code> — 7 tests</summary>

- **useAppState - état initial**
  - démarre sur la vue home, en chargement
- **handleBack / setView**
  - handleBack ramène à home
- **handleUpdateCompetition**
  - met à jour la compétition courante, la liste et les onglets
- **handleTabSwitch**
  - bascule sur l’onglet ouvert correspondant
  - ne fait rien pour un onglet inexistant
- **loadCompetitions**
  - charge depuis electronAPI et termine le chargement
- **setters de modals**
  - basculent les drapeaux d’affichage

</details>

<details>
<summary><code>src/renderer/hooks/useColumnMeasures.test.tsx</code> — 2 tests</summary>

- **useColumnMeasures**
  - reste vide sans conteneur ou inactif
  - mesure les colonnes relativement au conteneur

</details>

<details>
<summary><code>src/renderer/hooks/useColumnVisibility.test.tsx</code> — 7 tests</summary>

- **useColumnVisibility**
  - expose les colonnes par défaut visibles
  - colonnes de poule par défaut : Victoires, Ratio V/M, Indice uniquement
  - toggleColumn masque puis réaffiche une colonne
  - setVisibleColumns remplace la liste
  - réglage par poule indépendant du défaut global
  - setAllPoolColumns applique à tous et efface les réglages propres
  - persiste dans localStorage

</details>

<details>
<summary><code>src/renderer/hooks/useCompetitionEvent.test.ts</code> — 4 tests</summary>

- **useCompetitionEvent**
  - appelle le callback pour la compétition concernée uniquement
  - filtre par type : matches:changed n'active pas fencers:changed
  - se désabonne au démontage
  - ne plante pas sans electronAPI

</details>

<details>
<summary><code>src/renderer/hooks/useCompetitionSession.test.tsx</code> — 4 tests</summary>

- **restoreState**
  - marque isLoaded même sans electronAPI
  - restaure l’état depuis la DB avec mapping de phase
- **saveState**
  - ne sauvegarde pas tant que non chargé / sans API
  - sérialise l’état et mappe la phase en nombre

</details>

<details>
<summary><code>src/renderer/hooks/useDebounce.test.tsx</code> — 3 tests</summary>

- **useDebounce**
  - retourne la valeur initiale immédiatement
  - ne met à jour la valeur qu’après le délai
  - réinitialise le minuteur à chaque changement rapide

</details>

<details>
<summary><code>src/renderer/hooks/useElectronDB.test.tsx</code> — 6 tests</summary>

- **useElectronDB - délégation**
  - getAllCompetitions relaie l’appel DB
  - getCompetition transmet l’identifiant
  - createCompetition transmet les données
- **useElectronDB - API indisponible**
  - lève ElectronAPIUnavailableError si la méthode manque
  - lève aussi si db existe mais pas la méthode
- **useElectronDB - propagation d’erreur**
  - relaie l’erreur du backend

</details>

<details>
<summary><code>src/renderer/hooks/useEventManager.test.tsx</code> — 8 tests</summary>

- **useEventManager - listeners**
  - ajoute et déclenche un listener
  - removeEventListener stoppe la réception
  - cleanup retire tous les listeners
  - retire les listeners au démontage
- **useEventManager - timers**
  - managedSetTimeout exécute après le délai
  - managedClearTimeout annule le timer
  - cleanup annule les intervals en cours
  - annule les timers au démontage

</details>

<details>
<summary><code>src/renderer/hooks/useExport.test.tsx</code> — 4 tests</summary>

- **exportFencersList**
  - écrit un contenu FFF et notifie le succès
  - écrit un contenu TXT incluant le titre de la compétition
  - n’écrit rien si la boîte de dialogue est annulée
  - notifie une erreur si l’écriture échoue

</details>

<details>
<summary><code>src/renderer/hooks/useFencerManagement.test.tsx</code> — 9 tests</summary>

- **addFencer**
  - ajoute le tireur et notifie le parent
  - lève une erreur si l’API est absente
- **updateFencer**
  - met à jour le tireur et notifie
- **setFencersStatus**
  - met à jour plusieurs tireurs en un seul état (#1051)
- **updateFencers**
  - applique des MAJ différentes par tireur en un seul état (#1051)
- **deleteFencer**
  - supprime le tireur et notifie
  - propose d’annuler : le tireur est ré-ajouté sans identifiant (#1535)
- **deleteAllFencers**
  - vide la liste et notifie
- **bus fencers:changed (#1298)**
  - recharge les tireurs une seule fois pour une rafale, et se désabonne

</details>

<details>
<summary><code>src/renderer/hooks/useFocusTrap.test.tsx</code> — 4 tests</summary>

- **useFocusTrap**
  - place le focus sur le premier élément focusable
  - appelle onClose sur Échap
  - boucle du dernier au premier avec Tab
  - boucle du premier au dernier avec Shift+Tab

</details>

<details>
<summary><code>src/renderer/hooks/useGregAutoPublish.test.ts</code> — 2 tests</summary>

- **useGregAutoPublish**
  - publie immédiatement puis toutes les 15 s, et s'arrête à OFF
  - mémorise l'état ON/OFF par compétition

</details>

<details>
<summary><code>src/renderer/hooks/useHistory.test.tsx</code> — 7 tests</summary>

- **useHistory**
  - démarre vide, sans undo/redo possible
  - addAction rend l’annulation possible
  - undo invoque action.undo et redo invoque action.redo
  - une nouvelle action après undo écrase le futur (pas de redo)
  - getHistoryInfo reflète les compteurs undo/redo
  - clear réinitialise tout
  - appelle les callbacks onUndo / onRedo

</details>

<details>
<summary><code>src/renderer/hooks/useKeyboardShortcuts.test.tsx</code> — 7 tests</summary>

- **useKeyboardShortcuts**
  - déclenche l’action sur la bonne touche + modificateur
  - ne déclenche pas si les modificateurs ne correspondent pas
  - respecte enabled=false
  - ignore les raccourcis dans un input (sauf Escape)
  - appelle preventDefault par défaut
  - respecte preventDefault=false
  - capture les erreurs de l’action sans planter

</details>

<details>
<summary><code>src/renderer/hooks/useKioskTheme.test.tsx</code> — 4 tests</summary>

- **useKioskTheme**
  - préréglage par défaut, relu par compétition
  - applyKioskPreset : mémorise, envoie seulement si session active
  - applyKioskCustomTheme : thème courant + variables envoyées, préréglage effacé ensuite
  - ouverture / fermeture de l'éditeur

</details>

<details>
<summary><code>src/renderer/hooks/useModalFlags.test.tsx</code> — 2 tests</summary>

- **useModalFlags**
  - démarre à false et accepte valeur ou fonction
  - garde des setters stables entre les rendus

</details>

<details>
<summary><code>src/renderer/hooks/usePagination.test.tsx</code> — 6 tests</summary>

- **usePagination**
  - calcule pages et tranche initiale
  - navigue next/prev/first/last
  - borne setPage dans \[0, totalPages-1\]
  - setPageSize remet à la première page et recalcule
  - gère une liste vide (au moins 1 page)
  - startIndex / endIndex cohérents

</details>

<details>
<summary><code>src/renderer/hooks/usePoolManagement.test.tsx</code> — 7 tests</summary>

- **generatePools**
  - refuse moins de 4 tireurs
  - génère des poules avec matchs pour 8 tireurs
- **nextPoolRound**
  - archive le tour et fige son appel (#1051)
- **areAllPoolsComplete**
  - faux si un match n’est pas terminé
  - vrai si tous les matchs sont terminés
- **computePoolRanking**
  - retourne un classement (tableau)
- **handleBlackCardCancelled**
  - réintègre le combattant, rouvre le match du carton et rend ses résultats aux adversaires

</details>

<details>
<summary><code>src/renderer/hooks/usePoolOptimizations.test.tsx</code> — 8 tests</summary>

- **usePoolCalculations - fencerStats**
  - agrège victoires, touches et matchs joués
  - ignore les matchs non terminés
- **useOrderedMatches**
  - réordonne tous les matchs (permutation) en limitant les enchaînements
  - sépare terminés et en attente
- **useScoreEditing**
  - startEditing initialise les champs depuis le match
  - cancelEditing réinitialise tout
- **useFencerDisplay**
  - formate l’affichage long et court
- **usePoolGridData**
  - remplit la grille avec scores et vainqueur

</details>

<details>
<summary><code>src/renderer/hooks/usePoolsViewSettings.test.tsx</code> — 3 tests</summary>

- **usePoolsViewSettings**
  - mode grille et index 0 par défaut
  - relit et persiste le mode
  - recale l'index quand le nombre de poules diminue

</details>

<details>
<summary><code>src/renderer/hooks/usePrintShortcut.test.tsx</code> — 3 tests</summary>

- **usePrintShortcut**
  - déclenche onPrint sur Ctrl+P quand activé
  - ignore le raccourci quand désactivé
  - se désabonne au démontage

</details>

<details>
<summary><code>src/renderer/hooks/useRemoteNetworkSettings.test.tsx</code> — 3 tests</summary>

- **useRemoteNetworkSettings**
  - valeurs par défaut : HTTPS, port 8066, toutes les interfaces
  - relit les réglages enregistrés (port par compétition)
  - charge la liste des interfaces réseau

</details>

<details>
<summary><code>src/renderer/hooks/useStateGroup.test.tsx</code> — 3 tests</summary>

- **useStateGroup**
  - expose les valeurs initiales et accepte valeur ou fonction
  - garde des setters stables
  - gère les Set immuables

</details>

<details>
<summary><code>src/renderer/hooks/useStripPlanSync.test.tsx</code> — 3 tests</summary>

- **useStripPlanSync**
  - envoie le plan quand la session est active
  - ne fait rien sans session active
  - renvoie le plan quand les pistes indisponibles changent

</details>

<details>
<summary><code>src/renderer/hooks/useTableauUndo.test.tsx</code> — 4 tests</summary>

- **useTableauUndo**
  - restaure les matchs enregistrés
  - isole l’instantané des mutations en place
  - refuse l’annulation après transmission d’une piste
  - refuse l’annulation après les résultats finaux

</details>

<details>
<summary><code>src/renderer/hooks/useTheme.test.tsx</code> — 7 tests</summary>

- **useTheme**
  - par défaut "default" sans classe de thème
  - setTheme applique la classe et persiste
  - passer à "default" retire les classes de thème
  - toggleTheme bascule dark/light
  - charge le thème sauvegardé au montage
  - isLight vrai en mode clair
  - expose 3 thèmes disponibles

</details>

<details>
<summary><code>src/renderer/hooks/useUndoStack.test.tsx</code> — 5 tests</summary>

- **useUndoStack**
  - restaure les états dans l’ordre inverse
  - borne la pile
  - refuse l’annulation hors fenêtre
  - lock masque l’annulation jusqu’à la prochaine action locale
  - vide la pile au changement de portée

</details>

### `src/renderer/components/`

<details>
<summary><code>src/renderer/components/AboutModal.test.tsx</code> — 5 tests</summary>

- **AboutModal**
  - affiche le titre et la licence
  - bouton fermer déclenche onClose
  - affiche un placeholder de version sans electronAPI
  - affiche la version récupérée via electronAPI
  - affiche le suffixe -dev.N pour un build du canal dev

</details>

<details>
<summary><code>src/renderer/components/AddFencerModal.test.tsx</code> — 7 tests</summary>

- **AddFencerModal**
  - ajoute un tireur avec nom en majuscules puis ferme
  - ne soumet pas sans nom/prénom
  - annuler efface les champs sans fermer la modale
  - droitier par défaut, gaucher transmis
  - département choisi dans la liste transmis (#1504)
  - Ajouter garde la modale ouverte et vide le formulaire
  - la liste déroulante des nationalités sélectionne le code

</details>

<details>
<summary><code>src/renderer/components/AddFencerToPoolModal.test.tsx</code> — 5 tests</summary>

- **AddFencerToPoolModal**
  - affiche les tireurs disponibles (hors poule)
  - sélectionne un tireur et confirme l’ajout (poule locale + synchro DB)
  - ajoute quand même le tireur si la poule est absente de la base (#905)
  - exclut les tireurs déjà placés dans une autre poule
  - le bouton ajouter est désactivé sans sélection

</details>

<details>
<summary><code>src/renderer/components/AnalyticsDashboard.test.tsx</code> — 1 test</summary>

- **AnalyticsDashboard**
  - n'avance l'horodatage que lorsque les données changent, sans timer

</details>

<details>
<summary><code>src/renderer/components/BookSectionsModal.test.tsx</code> — 2 tests</summary>

- **moveItem**
  - déplace vers le haut et le bas
  - borne aux extrémités

</details>

<details>
<summary><code>src/renderer/components/ChangePoolModal.test.tsx</code> — 3 tests</summary>

- **ChangePoolModal**
  - liste les autres poules (pas la poule courante)
  - le bouton déplacer est désactivé tant qu’aucune poule n’est choisie
  - sélectionner une poule puis déplacer appelle onMove + onClose

</details>

<details>
<summary><code>src/renderer/components/CoachMark.test.tsx</code> — 2 tests</summary>

- **CoachMark**
  - affiche l’aide à la première apparition puis la masque définitivement
  - reste disponible au survol après fermeture, sans bouton de fermeture

</details>

<details>
<summary><code>src/renderer/components/CommandPalette.test.tsx</code> — 10 tests</summary>

- **CommandPalette**
  - propose la navigation vers les phases accessibles (#1536)
  - affiche les compétitions et les actions statiques
  - filtre selon la requête
  - affiche un message si aucun résultat
  - clic sur une compétition déclenche la sélection
  - Échap ferme la palette
  - clic sur l’action « nouvelle compétition »
  - « / » affiche les commandes et Entrée exécute
  - commande à argument : Entrée complète puis exécute
  - commande inconnue : Entrée la transmet telle quelle

</details>

<details>
<summary><code>src/renderer/components/CompetitionList.test.tsx</code> — 7 tests</summary>

- **CompetitionList (accueil vide)**
  - propose de créer une compétition avec le parcours guidé
- **CompetitionList (export accueil)**
  - bouton Exporter ouvre le choix de compétition puis appelle onExport avec l’identifiant
  - pas de bouton Exporter sans compétition
- **CompetitionList (filtres et tri #1534)**
  - filtre par arme avec une puce, puis réinitialise
  - trie par nom et mémorise la préférence
- **CompetitionList (récentes #1534)**
  - affiche la section après une ouverture, et mémorise l’identifiant
  - épingler une carte la place dans la section

</details>

<details>
<summary><code>src/renderer/components/CompetitionPropertiesModal.test.tsx</code> — 4 tests</summary>

- **CompetitionPropertiesModal**
  - affiche 4 onglets verticaux et seulement le contenu de l'onglet actif
  - range scores, temps et cases à cocher dans des champs distincts de la formule
  - place tours de poules et élimination directe dans Configuration
  - enregistre les valeurs saisies dans les autres onglets

</details>

<details>
<summary><code>src/renderer/components/CompetitionView.test.tsx</code> — 12 tests</summary>

- **CompetitionView**
  - affiche la navigation des phases, appel actif et poules verrouillées
  - sans élimination directe, la phase tableau est absente
  - « Préparer les poules » désactivé sous 4 tireurs pointés
  - génère les poules, les persiste en base et passe en préparation
  - restaure la phase sauvegardée (session) et permet de revenir en arrière
  - cliquer une phase désactivée ne change pas de phase
  - plusieurs tours de poules : libellé « tour 1/2 »
  - l'appel se stabilise : plus aucun rendu une fois chargé
  - pointer un tireur met à jour son statut en base
  - **accès aux étapes et relance (#1499)**
    - Préparation grisée avant « Préparer », Poules grisée avant « Lancer »
  - **compétition par équipes (#1085)**
    - remplace poules/tableau individuels par les phases équipes
    - « Composer les équipes » ouvre la phase équipes intégrée (sans modale)

</details>

<details>
<summary><code>src/renderer/components/Confetti.test.tsx</code> — 4 tests</summary>

- **Confetti**
  - ne rend rien quand inactif
  - rend un canvas plein écran quand actif
  - ne rend rien quand désactivé dans les paramètres
  - ne rend rien quand le système demande de réduire les animations

</details>

<details>
<summary><code>src/renderer/components/ConfirmDialog.test.tsx</code> — 10 tests</summary>

- **ConfirmProvider / useConfirm**
  - affiche le message et les libellés par défaut
  - résout true sur confirmation
  - résout false sur annulation
  - utilise des libellés personnalisés
  - Échap annule le dialogue
- **useConfirm hors provider**
  - refuse sans appeler window.confirm
- **prompt()**
  - résout la valeur saisie sur OK
  - Entrée valide la saisie
  - résout null sur annulation
  - hors provider résout null (window.prompt non supporté)

</details>

<details>
<summary><code>src/renderer/components/EditFencerModal.test.tsx</code> — 3 tests</summary>

- **EditFencerModal**
  - préremplit les champs depuis le tireur
  - enregistre les modifications (nom en majuscules) puis ferme
  - le bouton fermer ferme la modale

</details>

<details>
<summary><code>src/renderer/components/ErrorBoundary.test.tsx</code> — 3 tests</summary>

- **ErrorBoundary**
  - rend les enfants quand il n’y a pas d’erreur
  - affiche l’UI par défaut quand un enfant lève une erreur
  - affiche le fallback personnalisé s’il est fourni

</details>

<details>
<summary><code>src/renderer/components/FencerList.test.tsx</code> — 5 tests</summary>

- **FencerList**
  - affiche les tireurs
  - filtre via la recherche (debounce)
  - colonne nationalité masquée par défaut, affichable avec drapeau
  - le bouton ajouter déclenche onAddFencer
  - abandon : sans modale, toast Annuler qui restaure le statut

</details>

<details>
<summary><code>src/renderer/components/GuidedTour.test.tsx</code> — 13 tests</summary>

- **GuidedTour**
  - se propose une fois sur une compétition vide
  - ne se propose pas sur une compétition déjà remplie
  - passer le parcours le masque et ne le refait pas apparaître
  - se relance depuis les paramètres
  - propose la saisie distante (optionnelle) en première étape
  - met en évidence la phase de l’étape en cours
  - revient à l’étape précédente avec le bouton Retour
  - entoure d’un halo les boutons utiles de l’étape
  - propose l’édition d’un match de tableau en dernière étape
  - Suivant avance d’une étape, Retour revient
  - refaire l’action après Retour fait avancer de nouveau
  - étape poules : explication glisser-déposer et halo sur Lancer quand la préparation est ouverte
  - étape poules : validée seulement une fois les poules lancées

</details>

<details>
<summary><code>src/renderer/components/HyperspaceCrawl.test.tsx</code> — 8 tests</summary>

- **toRoman**
  - convertit en chiffres romains
  - retombe en chiffres arabes hors bornes
- **warpSpeed**
  - accélère au saut puis revient en croisière
- **HyperspaceCrawl**
  - affiche épisode romain, titre et build
  - clic ferme
  - Échap ferme le crawl sans fermer la modale À propos
  - Entrée sur le numéro de build lance le crawl
- **playBladeMarch**
  - programme un swish + un clang par note de la marche

</details>

<details>
<summary><code>src/renderer/components/ImportModal.test.tsx</code> — 3 tests</summary>

- **ImportModal**
  - affiche le fichier et la liste des tireurs parsés
  - importe les tireurs sélectionnés (tous par défaut) puis ferme
  - le bouton fermer déclenche onClose

</details>

<details>
<summary><code>src/renderer/components/KeyboardShortcutsHelp.test.tsx</code> — 1 test</summary>

- **KeyboardShortcutsHelp (#1533)**
  - documente la navigation entre phases : Ctrl + 1…8 et Ctrl + ←/→

</details>

<details>
<summary><code>src/renderer/components/LanguageSelector.test.tsx</code> — 4 tests</summary>

- **LanguageSelector**
  - rend les langues disponibles
  - applique directement le changement sans prop onLanguageChange
  - délègue à onLanguageChange si fourni (mode sélection)
  - affiche un état de chargement

</details>

<details>
<summary><code>src/renderer/components/LiveInterPoolRanking.test.tsx</code> — 1 test</summary>

- **LiveInterPoolRanking**
  - ne lance aucun timer et ne recalcule que lorsque les poules changent

</details>

<details>
<summary><code>src/renderer/components/MultiStripManager.test.tsx</code> — 3 tests</summary>

- **MultiStripManager**
  - affiche le titre avec le nombre de pistes
  - rend une carte par piste
  - le bouton fermer déclenche onClose

</details>

<details>
<summary><code>src/renderer/components/NewCompetitionModal.test.tsx</code> — 3 tests</summary>

- **NewCompetitionModal**
  - crée une compétition avec le titre saisi
  - génère un titre par défaut si vide
  - le bouton annuler ferme la modale

</details>

<details>
<summary><code>src/renderer/components/PoolPrepView.test.tsx</code> — 3 tests</summary>

- **PoolPrepView (#1499)**
  - titres Min / Max séparés au-dessus des deux champs
  - le tireur ajouté depuis l'appel n'entre pas dans les poules avant la repréparation
  - bouton « Lancer » puis « Relancer » une fois les poules lancées

</details>

<details>
<summary><code>src/renderer/components/PoolView.test.tsx</code> — 19 tests</summary>

- **PoolView - saisie simplifiée : suppression au survol**
  - survoler une case scorée puis appuyer sur Suppr efface le score du match
  - n'efface rien si la souris ne survole aucune case
  - Suppr est sans effet hors saisie simplifiée
- **PoolView - saisie simplifiée : correction d'un score enregistré (#1046)**
  - préremplit la case avec le score enregistré
  - Entrée enregistre le nouveau score en gardant celui de l'adversaire
- **PoolView - couverture saisie, matrice et statuts (#1084)**
  - matrice : affiche victoire/défaite dans les cases du match terminé
  - matrice : case non saisie proposée à la saisie
  - en-tête : indique l'avancement puis « Terminée » selon pool.isComplete
  - saisie des deux cases d'un match neuf : un seul onScoreUpdate avec les deux scores
  - refuse un match nul
  - V = victoire au score maximum
  - W+chiffre désigne le vainqueur d’une égalité (case saisie en premier)
  - W+chiffre désigne le vainqueur d’une égalité (case miroir)
  - W refusé hors égalité
  - W refusé si le départage par victoire est inactif
  - refuse un score supérieur au maximum
  - bouton « Annuler ce résultat » : déclenche onMatchReset sans ouvrir la saisie
  - feuille signée par tous : bandeau de verrouillage et saisie bloquée
  - tireur abandonné : case de la matrice marquée comme statut spécial

</details>

<details>
<summary><code>src/renderer/components/QRCodeShare.test.tsx</code> — 4 tests</summary>

- **QRCodeShare**
  - affiche le titre du mode résultats et les onglets
  - affiche un message si le serveur distant n’est pas démarré
  - bascule vers l’onglet pointage
  - le bouton Fermer déclenche onClose

</details>

<details>
<summary><code>src/renderer/components/SettingsModal.test.tsx</code> — 7 tests</summary>

- **SettingsModal**
  - affiche un onglet par section et seulement le contenu de l'onglet actif
  - change d'onglet et mémorise le choix
  - rouvre sur le dernier onglet utilisé
  - la recherche filtre toutes les sections (insensible aux accents)
  - affiche un message si aucun résultat
- **SettingsModal – export / import des paramètres**
  - importe un fichier JSON (logo inclus) et met à jour le stockage
  - signale un fichier invalide

</details>

<details>
<summary><code>src/renderer/components/Skeleton.test.tsx</code> — 1 test</summary>

- **TableSkeleton**
  - annonce le chargement et rend le nombre de lignes demandé

</details>

<details>
<summary><code>src/renderer/components/TableauView.test.tsx</code> — 8 tests</summary>

- **TableauView**
  - génère un tableau de 8 pour 5 à 8 tireurs (7 matchs, byes inclus)
  - place chaque tireur éligible une seule fois au premier tour
  - exclut les tireurs abandon / forfait / exclu du tableau
  - ajoute une petite finale (round 3) avec thirdPlaceMatch
  - en lecture seule, ne génère ni ne modifie le tableau
  - affiche les noms des tireurs et ouvre la saisie de score au clic sur un match
  - saisir un score fait avancer le vainqueur au tour suivant
  - playAllPositions : notifie les brackets de consolation sans erreur

</details>

<details>
<summary><code>src/renderer/components/Toast.test.tsx</code> — 9 tests</summary>

- **ToastProvider / useToast**
  - rend les enfants
  - affiche un toast au déclenchement
  - disparaît automatiquement après 4 s
  - peut être fermé manuellement
  - conteneur annoncé via aria-live=polite
  - empile plusieurs toasts
- **useToast hors provider**
  - fournit un showToast no-op sans planter
- **Toast d’annulation (#1535)**
  - le bouton Annuler appelle le callback et ferme le toast
- **Toast d’erreur actionnable (#1535)**
  - affiche l’échec suivi de la cause et de l’étape suivante

</details>

<details>
<summary><code>src/renderer/components/Tooltip.test.tsx</code> — 2 tests</summary>

- **Tooltip**
  - apparaît au focus clavier avec role=tooltip et aria-describedby, se ferme avec Échap
  - TipButton : aria-label par défaut et pas de title natif

</details>

<details>
<summary><code>src/renderer/components/XiaomiRemotePanel.test.tsx</code> — 2 tests</summary>

- **XiaomiRemotePanel**
  - charge la liste une fois puis ne réinterroge pas le processus principal
  - ignore la liste poussée par une autre compétition

</details>

<details>
<summary><code>src/renderer/components/__tests__/ArenaQrCodesModal.test.ts</code> — 3 tests</summary>

- **buildQrSheetsHTML (#1039)**
  - répartit les QR Codes sur le nombre de feuilles attendu
  - utilise la grille correspondant au nombre par feuille
  - échappe le HTML des libellés

</details>

<details>
<summary><code>src/renderer/components/__tests__/MatchAuditLog.test.tsx</code> — 3 tests</summary>

- **MatchAuditLog — vue compétition**
  - affiche tous les matchs avec colonne Match, puis filtre par match
  - filtre par arbitre (saisie ou assignation)
- **MatchAuditLog — replay (#1074)**
  - rejoue le match sélectionné événement par événement

</details>

<details>
<summary><code>src/renderer/components/__tests__/ProxySettingsSection.test.tsx</code> — 4 tests</summary>

- **ProxySettingsSection**
  - système / aucun : appliqué immédiatement
  - manuel : serveur + exclusions envoyés au clic sur Appliquer
  - refus du main → message d’adresse invalide
  - test de connexion : route affichée

</details>

<details>
<summary><code>src/renderer/components/__tests__/ScoreAuditLog.test.tsx</code> — 2 tests</summary>

- **ScoreAuditLog — colonne Arbitre (#1031)**
  - affiche l'arbitre saisi, sinon le ou les arbitres assignés au match
- **ScoreAuditLog — compacter / déplier (#1123)**
  - masque les entrées au-delà des premières en mode compact, puis les réaffiche

</details>

<details>
<summary><code>src/renderer/components/__tests__/UpdateMenuButton.test.tsx</code> — 6 tests</summary>

- **UpdateMenuButton — bouton clignotant de l’en-tête**
  - « À jour » après vérification ; clic → revérifie
  - « Mise à jour dispo » clignotant dès update:available
  - vérification au lancement désactivée : pas de requête, bouton « Vérifier »
  - mise à jour trouvée au lancement : clic ouvre la bannière avec la version
  - clic : réaffiche la bannière fermée
  - animation de clignotement définie (et coupée si mouvement réduit)

</details>

<details>
<summary><code>src/renderer/components/__tests__/UpdateNotification.test.tsx</code> — 6 tests</summary>

- **UpdateNotification — mise à jour intégrée**
  - s’affiche sur update:available et installe sans ouvrir le navigateur
  - affiche la progression du téléchargement
  - téléchargement lancé depuis le menu : bannière + barre de progression sans update:available
  - bouton désactivé + lame affichée pendant le téléchargement
  - erreur %s : message explicite (plus de clic muet) _(each)_
  - ses styles sont dans une feuille chargée (components.css)

</details>

<details>
<summary><code>src/renderer/components/common/CardIcon.test.tsx</code> — 2 tests</summary>

- **CardIcon**
  - est décorative par défaut et porte la couleur du carton
  - expose un nom accessible quand elle est seule

</details>

<details>
<summary><code>src/renderer/components/common/CollapseToggle.test.tsx</code> — 2 tests</summary>

- **CollapseToggle**
  - compacte puis déplie le contenu
  - mémorise l'état entre deux montages

</details>

<details>
<summary><code>src/renderer/components/common/EmptyState.test.tsx</code> — 3 tests</summary>

- **EmptyState**
  - rend titre, description et déclenche l’action principale
  - sans action : aucun bouton
  - rend les actions supplémentaires (children)

</details>

<details>
<summary><code>src/renderer/components/common/Icon.test.tsx</code> — 2 tests</summary>

- **Icon**
  - est masquée aux lecteurs d’écran par défaut
  - expose un nom accessible avec label

</details>

<details>
<summary><code>src/renderer/components/common/OperationProgress.test.tsx</code> — 4 tests</summary>

- **OperationProgress**
  - opération rapide : aucune barre
  - opération longue : barre affichée après 1 s puis retirée
  - propage l’erreur de la tâche et retire la barre
  - hors provider : exécute la tâche

</details>

<details>
<summary><code>src/renderer/components/common/RankMedal.test.tsx</code> — 2 tests</summary>

- **RankMedal**
  - affiche une médaille décorative pour les trois premiers rangs
  - ne rend rien au-delà du 3e rang ni sans rang

</details>

<details>
<summary><code>src/renderer/components/common/SpecialStatusPanel.test.tsx</code> — 4 tests</summary>

- **SpecialStatusPanel**
  - médical : confirme directement, sans question carton noir
  - exclusion : question carton noir, Oui =\> blackCard true
  - exclusion : Non =\> blackCard false
  - tireur absent désactivé ; Annuler appelle onCancel

</details>

<details>
<summary><code>src/renderer/components/common/primitives.test.tsx</code> — 11 tests</summary>

- **Modal**
  - rend titre, corps et pied ; le dialogue est nommé par son titre
  - ferme via le bouton, Échap et l’overlay ; pas via un clic dans la boîte
  - classes de taille, défilement et overlay au premier plan
- **Button**
  - variante, taille et type="button" par défaut
  - secondaire par défaut, icône + libellé
  - taille md acceptée
  - loading : désactivé, aria-busy, spinner masqué aux lecteurs, libellé conservé
  - sans loading : ni aria-busy ni spinner
  - icône seule : classe btn-icon-only et nom accessible via aria-label
- **Card**
  - en-tête, corps et pied
  - sans titre ni actions : pas d’en-tête

</details>

<details>
<summary><code>src/renderer/components/competition/CompetitionHeader.test.tsx</code> — 3 tests</summary>

- **CompetitionHeader - bouton propriétés (#1505)**
  - affiche le bouton directement dans le bandeau et ouvre les propriétés
- **CompetitionHeader - bouton saisie distante**
  - affiche le bouton et ouvre la saisie distante au clic
  - sans gestionnaire : pas de bouton

</details>

<details>
<summary><code>src/renderer/components/competition/competitionDerived.test.ts</code> — 6 tests</summary>

- **computeMatchProgress**
  - renvoie null sans poule ni tableau
  - compte les matchs de poule terminés
  - retombe sur le tableau quand il n’y a pas de poule
- **computeEffectiveTableauRanking**
  - garde le classement tel quel sans option
  - ne garde que le groupe actif et renumérote
  - exclut les groupes déjà extraits dans une compétition séparée

</details>

<details>
<summary><code>src/renderer/components/competition/phaseRegistry.test.ts</code> — 2 tests</summary>

- **phaseRegistry**
  - liste les phases accessibles hors phase courante, avec leur position
  - se vide au retrait

</details>

<details>
<summary><code>src/renderer/components/competition/phaseStepper.test.ts</code> — 4 tests</summary>

- **phaseStepStates**
  - marque fait, en cours, à faire et bloqué
  - phase inconnue : rien de fait
- **nextBlockedReason**
  - renvoie le motif de la première phase bloquée suivante
  - null si aucun motif connu après la phase courante

</details>

<details>
<summary><code>src/renderer/components/competition/usePhaseShortcuts.test.ts</code> — 5 tests</summary>

- **phaseShortcutTarget**
  - Ctrl+n va à la phase de rang n
  - ne cible pas une phase désactivée ni un rang absent
  - Ctrl+→ / Ctrl+← passent à la phase accessible suivante / précédente
  - aux bornes, pas de cible
  - autres touches : pas de cible

</details>

<details>
<summary><code>src/renderer/components/competitionListFilters.test.ts</code> — 4 tests</summary>

- **competitionListFilters**
  - filtre en ET entre groupes et OU dans un groupe
  - liste les valeurs présentes
  - trie par date et par nom sans muter la liste
  - mémorise le tri

</details>

<details>
<summary><code>src/renderer/components/competitionListRecent.test.ts</code> — 4 tests</summary>

- **competitionListRecent**
  - mémorise les ouvertures sans doublon, la plus récente en tête
  - épingle puis désépingle
  - épinglées d’abord, identifiants disparus ignorés, 5 au plus
  - tolère un stockage corrompu

</details>

<details>
<summary><code>src/renderer/components/competitionListSearch.test.ts</code> — 6 tests</summary>

- **normalizeSearchText**
  - ignore la casse, les accents et les espaces multiples
- **filterCompetitions**
  - requête vide : liste inchangée
  - cherche dans le nom sans tenir compte des accents ni de la casse
  - cherche dans le lieu
  - cherche dans la date (année)
  - toutes les parties de la requête doivent correspondre

</details>

<details>
<summary><code>src/renderer/components/guidedTourFlags.test.ts</code> — 6 tests</summary>

- **guidedTour**
  - commence par la saisie distante (optionnelle) sur une compétition vide
  - valide les étapes selon l’état de la compétition
  - la saisie distante est validée par le serveur actif ou en passant à la suite
  - l’étape poules n’est validée qu’au clic sur Lancer les poules
  - retourne null quand toutes les étapes sont faites
  - mémorise le drapeau et ignore les valeurs invalides

</details>

<details>
<summary><code>src/renderer/components/liveViewsRenderGuard.test.tsx</code> — 3 tests</summary>

- **garde-fou de rendus — vues live (#1302)**
  - LiveInterPoolRanking : 0 rendu en 10 s
  - PoolPrepView : 0 rendu en 10 s
  - LiveDashboard : seule l'horloge (1 Hz) rend, soit au plus 10 rendus en 10 s

</details>

<details>
<summary><code>src/renderer/components/pool/PoolMatchList.test.tsx</code> — 5 tests</summary>

- **PoolMatchList**
  - affiche le prochain match et déclenche openScoreModal
  - affiche la section « À venir » quand il en reste plusieurs
  - affiche « Poule terminée » sans match en attente
  - le bouton supprimer d'un match terminé n'apparaît qu'au survol de la ligne
  - clique sur supprimer déclenche onMatchReset avec l'index du match

</details>

<details>
<summary><code>src/renderer/components/pool/PoolScoreMatrix.test.tsx</code> — 6 tests</summary>

- **PoolScoreMatrix**
  - affiche les noms des tireurs en en-tête de ligne
  - affiche la colonne Victoires quand isVisible le permet
  - affiche le score V5 pour un match gagné
  - clic sur une cellule éditable déclenche onCellClick
  - ne déclenche pas onCellClick si verrouillé
  - rapières : cases de la vague en cours surlignées en violet (#1118)

</details>

<details>
<summary><code>src/renderer/components/pool/PoolStripButton.test.tsx</code> — 2 tests</summary>

- **PoolStripButton**
  - propose uniquement les pistes de l’intervalle et applique le choix
  - permet de retirer la piste (automatique)

</details>

<details>
<summary><code>src/renderer/components/pool/poolMatrixNav.test.ts</code> — 5 tests</summary>

- **poolMatrixNav**
  - reconnaît les flèches
  - droite/gauche : saute la diagonale
  - bas/haut : saute la diagonale
  - bords : null
  - touche non fléchée : null

</details>

<details>
<summary><code>src/renderer/components/pool/poolSpecialStatus.test.ts</code> — 5 tests</summary>

- **specialStatusOutcome**
  - tireur de gauche exclu : B gagne, A à 0
  - tireur de droite exclu, sans score : A gagne avec le score max
  - affichage inversé : la gauche est B
  - Sabre Laser forfait : garde ses points (max 14), adversaire à 15
  - Sabre Laser exclusion : règle classique

</details>

<details>
<summary><code>src/renderer/components/pool/usePoolReferees.test.tsx</code> — 2 tests</summary>

- **usePoolReferees**
  - bascule la sélection sans dépasser maxRefereesPerPool
  - enregistre l’affectation et notifie le parent

</details>

<details>
<summary><code>src/renderer/components/poolLaunchState.test.ts</code> — 6 tests</summary>

- **poolsHaveScores**
  - faux sans poule ou sans match saisi
  - vrai dès qu'un match est saisi ou avancé
- **inferPoolsLaunched (anciennes sessions)**
  - faux en appel / préparation sans score
  - vrai si phase postérieure, historique ou score saisi
- **poolTabLock**
  - tout verrouillé avant « Préparer les poules »
  - Préparation libre une fois préparées, Poules libre une fois lancées

</details>

<details>
<summary><code>src/renderer/components/poolPrepHistory.test.ts</code> — 3 tests</summary>

- **appendHistory**
  - plafonne le nombre d’entrées
  - abandonne les états après l’index courant
  - retire les états hors fenêtre

</details>

<details>
<summary><code>src/renderer/components/print/PrintDialog.test.tsx</code> — 14 tests</summary>

- **PrintDialog (#1214)**
  - présélectionne l’imprimante par défaut et génère l’aperçu avec les réglages
  - Imprimer : envoie les réglages choisis puis ferme et mémorise (sans pages)
  - plage invalide ou hors document : impression bloquée
  - échec d’impression : message affiché, boîte conservée
  - Enregistrer en PDF : titre du document proposé
  - enregistrement annulé dans le dialogue : la boîte reste ouverte
  - Boîte de dialogue système : bascule sur l’impression native
  - Annuler : fermeture sans erreur (pas de toast d’échec chez l’appelant)
  - fermeture après aperçu : libère pdf.js sans planter (croix ou Annuler)
  - aperçu en échec : impression et enregistrement restent possibles
- **PrintDialogHost (#1214)**
  - enregistre le gestionnaire, ouvre la boîte à la demande et renvoie le résultat
  - désenregistre le gestionnaire au démontage
- **plages de pages côté renderer (#1214)**
  - isValidPageRanges(%j) = %s _(each)_
  - pageRangesBeyond

</details>

<details>
<summary><code>src/renderer/components/remote/DisplayOptionsPanel.test.tsx</code> — 2 tests</summary>

- **DisplayOptionsPanel**
  - change le thème et le synchronise avec le serveur
  - bascule une vue du kiosk

</details>

<details>
<summary><code>src/renderer/components/remote/GregAutoPublishToggle.test.tsx</code> — 2 tests</summary>

- **GregAutoPublishToggle**
  - affiche OFF puis bascule en ON au clic
  - affiche ON quand actif

</details>

<details>
<summary><code>src/renderer/components/remote/StripPlanCard.test.tsx</code> — 7 tests</summary>

- **StripPlanCard**
  - est replié par défaut puis affiche les pistes de l’intervalle
  - passe une piste en indisponible (rouge) et la persiste
  - recharge les pistes indisponibles d’une compétition
- **répartition automatique avec pistes indisponibles**
  - availableStrips exclut les indisponibles, sans jamais renvoyer une liste vide
  - stripAtIndex tourne sur les pistes disponibles
  - computePoolStrips saute les pistes indisponibles
  - buildSessionMatches applique les pistes calculées

</details>

<details>
<summary><code>src/renderer/components/remote/StripRangeControls.test.tsx</code> — 3 tests</summary>

- **StripRangeControls**
  - incrémente la piste de départ sans dépasser la fin
  - bloque le départ à la fin et la fin au départ
  - modifie la piste de fin par saisie directe

</details>

<details>
<summary><code>src/renderer/components/remote/UrlCopyRow.test.tsx</code> — 2 tests</summary>

- **UrlCopyRow**
  - copie l’URL et ouvre le QR code
  - affiche « Copié » sur la ligne copiée

</details>

<details>
<summary><code>src/renderer/components/remote/remotePanels.test.tsx</code> — 4 tests</summary>

- **OrgNotePanel**
  - publie puis masque la note
- **ConnectedScreensPanel**
  - ne requête rien hors session distante
  - ignore la liste poussée par le serveur d'une autre compétition (#1292)
  - liste les écrans, renomme et envoie le mode kiosk

</details>

<details>
<summary><code>src/renderer/components/remote/remoteViewMode.test.tsx</code> — 4 tests</summary>

- **remoteViewMode**
  - Basique par défaut
  - mémorise le choix par compétition
  - valeur inconnue : retombe sur Basique
- **RemoteViewModeTabs**
  - affiche deux onglets et signale le changement

</details>

<details>
<summary><code>src/renderer/components/tableau/MatchCard.test.tsx</code> — 4 tests</summary>

- **MatchCard clavier**
  - Entrée sur la carte ouvre la saisie
  - Espace ouvre aussi la saisie
  - Entrée sur le bouton piste n'ouvre pas la saisie
  - lecture seule : carte non focusable

</details>

<details>
<summary><code>src/renderer/components/tableau/TableauScoreModal.test.tsx</code> — 14 tests</summary>

- **TableauScoreModal**
  - affiche le nom du tour et les tireurs
  - saisir un score appelle setEditScoreA
  - Valider déclenche onSubmit
  - saisie complète au clavier : score A, Tab, score B, Entrée valide (#1542)
  - bouton Médical : croix rouge médicale (#1256)
  - Échap ferme la modale
  - le clic hors de la fenêtre ne ferme pas (#1115)
  - **égalité Sabre Laser**
    - hors Laser : aucun bouton V ni tirage au sort, même en égalité
    - Laser sans égalité : pas de bloc vainqueur
    - Laser sans score saisi : pas de bloc vainqueur
    - bouton V affiché à côté de chaque score, même sans égalité
    - égalité : V manuel pour chaque tireur
    - V déjà actif : un second clic le retire
    - tirage au sort : le résultat désigne le vainqueur

</details>

<details>
<summary><code>src/renderer/components/tableau/matchCardNav.test.ts</code> — 5 tests</summary>

- **matchCardNav**
  - isNavKey
  - bas / haut restent dans la colonne
  - droite : tour suivant le plus proche
  - gauche : tour précédent
  - bord : -1

</details>

<details>
<summary><code>src/renderer/components/tableau/minimapGeometry.test.ts</code> — 5 tests</summary>

- **minimapGeometry**
  - entrées invalides : null
  - rectangle visible à l'origine
  - pan et zoom déplacent / réduisent le rectangle
  - tout visible quand le bracket tient dans la vue
  - clic minimap : centre la vue (aller-retour)

</details>

<details>
<summary><code>src/renderer/components/tableau/tableauCalculations.test.ts</code> — 4 tests</summary>

- **autoFillAllPositions**
  - %i tireurs (tableau de %i) : classement complet _(each)_
- **calculateFinalResults - abandon / forfait / exclusion (#1012)**
  - mentionne l’évènement entre parenthèses pour le tireur concerné
- **generateFIESeeding (#1080)**
  - tables en dur identiques à la construction FIE générique
  - tableau de 256 seedé (1 et 2 ne se rencontrent qu’en finale)

</details>

<details>
<summary><code>src/renderer/components/tableau/tableauDialogState.test.ts</code> — 3 tests</summary>

- **tableauDialogState**
  - états initiaux
  - loadDESignatures associe signature au bon côté
  - retourne undefined sans lignes ou en cas d erreur

</details>

<details>
<summary><code>src/renderer/components/tableau/tableauTypes.test.ts</code> — 11 tests</summary>

- **propagateWinners**
  - apparie les feeders par position même si matchList est désordonné
- **propagateWinners - taille périmée/invalide**
  - propage même si size vaut 0
  - propage le vainqueur des 8es vers les quarts (size correct)
- **propagateWinners - abandon / forfait / exclusion (#1012)**
  - conserve le vainqueur d’un match sans score (abandon en finale)
  - efface un vainqueur périmé qui n’est plus dans le match
- **resetTableauMatch (#1115)**
  - efface le score et retire le vainqueur du tour suivant
  - refuse si le match suivant a déjà été joué
  - vide les perdants de la petite finale pour une demi-finale
- **resolveTableauWinner**
  - le score décide hors égalité, un V éventuel est ignoré
  - en égalité, le vainqueur désigné (V ou tirage) gagne
  - en égalité sans vainqueur désigné, pas de vainqueur

</details>

<details>
<summary><code>src/renderer/components/tableau/useBracketZoomPan.test.ts</code> — 4 tests</summary>

- **zoom mémorisé du tableau**
  - renvoie 1 par défaut
  - restitue le zoom par compétition
  - ignore une valeur invalide ou hors bornes
  - supprime l entrée quand le zoom revient à 1

</details>

<details>
<summary><code>src/renderer/components/training/TrainingPrintModal.test.ts</code> — 3 tests</summary>

- **buildTrainingQrTargets (#1500)**
  - liste kiosk, arbitres, affichages puis lobby
  - respecte la sélection
  - renvoie vide si rien de coché

</details>

<details>
<summary><code>src/renderer/components/wiki/wikiData.test.ts</code> — 3 tests</summary>

- **wikiData**
  - identifiants d’articles uniques
  - **article %s** _(each)_
    - titre et contenu en %s, même structure que fr _(each)_
    - catégorie connue

</details>

### E2E Playwright (`e2e/`)

<details>
<summary><code>e2e/accessibility.spec.ts</code> — 6 tests</summary>

- **Accessibility**
  - should have proper ARIA labels
  - should be keyboard navigable
  - should respect reduced motion preference
  - should pass axe color-contrast (${scheme})
  - should pass axe color-contrast on modal (${scheme})
  - should have no critical axe violations

</details>

<details>
<summary><code>e2e/app.spec.ts</code> — 3 tests</summary>

- **Application Launch**
  - should display the main window
  - should display competition list or empty state
- **Navigation**
  - should navigate to new competition modal

</details>

<details>
<summary><code>e2e/competition-full.spec.ts</code> — 6 tests</summary>

- **Flow complet compétition**
  - ouvrir l'app affiche l'écran principal
  - cliquer "Nouvelle compétition" ouvre le formulaire
  - remplir et sauvegarder une nouvelle compétition
  - la liste de compétitions ou l'état vide est affiché
  - ouvrir une compétition existante affiche l'onglet tireurs
  - ajouter un tireur manuellement

</details>

<details>
<summary><code>e2e/competition.spec.ts</code> — 3 tests</summary>

- **Competition Management**
  - should create a new competition
  - should display competition details
  - should delete a competition

</details>

<details>
<summary><code>e2e/i18n-overflow.spec.ts</code> — 2 tests</summary>

- **i18n : pas de débordement de libellés**
  - accueil ${lang}${pseudo ? ' (pseudo-localisation)' : ''}
  - nouvelle compétition ${lang}${pseudo ? ' (pseudo-localisation)' : ''}

</details>

<details>
<summary><code>e2e/import-export.spec.ts</code> — 6 tests</summary>

- **Flow import/export**
  - l'app charge la page principale
  - le bouton Import est accessible depuis une compétition
  - cliquer Import ouvre le modal d'import
  - le modal d'import se ferme avec Annuler/Fermer
  - le bouton Export est accessible depuis une compétition
  - l'import via CSV affiche un feedback d'erreur si fichier invalide

</details>

<details>
<summary><code>e2e/pools.spec.ts</code> — 2 tests</summary>

- **Pool Management**
  - should generate pools
  - should update pool scores

</details>

<details>
<summary><code>e2e/remote-scoring.spec.ts</code> — 5 tests</summary>

- **Flow remote scoring**
  - l'application charge sans erreur critique
  - naviguer vers les paramètres remote
  - le bouton "Démarrer le serveur" est présent ou le serveur est géré depuis les settings
  - le serveur remote affiche une URL quand actif
  - arrêt du serveur remote masque l'URL

</details>

<details>
<summary><code>e2e/tableau.spec.ts</code> — 3 tests</summary>

- **Tableau (élimination directe)**
  - l'onglet Tableau est accessible depuis une compétition
  - ouvrir le tableau affiche le bracket ou un état vide
  - les contrôles de zoom du bracket fonctionnent si un tableau existe

</details>

<details>
<summary><code>e2e/visual.spec.ts</code> — 3 tests</summary>

- **Visual regression**
  - accueil (${scheme})
  - nouvelle compétition (${scheme})
  - accueil sans débordement horizontal (${size.name})

</details>

### `src/remote/`

<details>
<summary><code>src/remote/a11yPages.test.ts</code> — 5 tests</summary>

- **axe sur les pages distantes (#1537)**
  - ${page}.html : aucune violation
- **repères et annonces des pages distantes (#1537)**
  - kiosk : la navigation porte un nom accessible traduit
  - referee : chaque tireur est une région nommée
  - les scores de référence, arène et public sont annoncés (aria-live)
  - clé kiosk.menu\_label présente dans toutes les langues

</details>

<details>
<summary><code>src/remote/arenaSlotClient.test.ts</code> — 3 tests</summary>

- **claimArenaSlot (/common.js)**
  - envoie la clé de l'onglet (distincte entre onglets) et la sous-piste courante
  - deux onglets du même navigateur : deux clés différentes
  - refus, erreur réseau ou réponse invalide : piste ou sous-piste courante

</details>

<details>
<summary><code>src/remote/bpSocket.test.ts</code> — 3 tests</summary>

- **bpSocket (/common.js)**
  - applique la politique de reconnexion commune
  - permet de surcharger ou compléter les options sans modifier les défauts
  - aucune page distante ne reconstruit ces options à la main

</details>

<details>
<summary><code>src/remote/dialogsA11y.test.ts</code> — 2 tests</summary>

- **dialogues des pages distantes (#1537)**
  - ${page} : chaque role=dialog est modal et nommé
  - referee.html : 5 dialogues (fin de match, carton noir, raison, poule, signature)

</details>

<details>
<summary><code>src/remote/displayScale.test.ts</code> — 6 tests</summary>

- **échelle typographique fluide (#1540)**
  - tokens.css définit les tailles en clamp()
  - overlay-config : aucune taille de police en px
  - overlay-config : colonne latérale fluide
- **mode contraste projecteur (#1540)**
  - ?contrast=1 active la classe et mémorise
  - stockage indisponible : le paramètre reste appliqué
  - tokens.css : .theme-contrast sans couleur en dur

</details>

<details>
<summary><code>src/remote/embeddedFonts.test.ts</code> — 5 tests</summary>

- **Inter embarquée (#1153)**
  - %s : woff2 valides + licence OFL _(each)_
  - @font-face locaux, font-display: swap
  - aucun hôte Google Fonts dans les sources, pages et CSP
  - pages kiosque/dashboard : préchargement local
  - service worker met les polices en précache

</details>

<details>
<summary><code>src/remote/errorCodes.test.ts</code> — 3 tests</summary>

- **codes d’erreur du serveur distant (#1159)**
  - des codes sont bien émis
  - chaque code est traduit (%s) _(each)_
  - errorText : traduction paramétrée, texte brut, repli

</details>

<details>
<summary><code>src/remote/focusRing.test.ts</code> — 3 tests</summary>

- **focus visible global des pages distantes (#1537)**
  - tokens.css définit :focus-visible 2 px / décalage 2 px et forced-colors
  - chaque page distante charge tokens.css
  - styles.css ne supprime pas le focus sans repli visible

</details>

<details>
<summary><code>src/remote/inlineStyles.test.ts</code> — 1 test</summary>

- **styles inline des pages distantes (#1600)**
  - ${page} : au plus ${max} attribut(s) style

</details>

<details>
<summary><code>src/remote/js/arenaClient.test.ts</code> — 7 tests</summary>

- **arenaClient.js**
  - getOrCreateScreenId : créé une fois puis réutilisé
  - dispatchServerCommand : refresh / navigate / ping
  - identify : libellé commande \> mémorisé \> identifiant ; durée 5 s par défaut
  - message : texte requis
  - initialArenaUpdate : seulement avec un match et un tireur A
  - isOlympicSession
  - arena.html charge le module

</details>

<details>
<summary><code>src/remote/js/arenaDisplay.test.ts</code> — 5 tests</summary>

- **arenaDisplay.js ArenaDisplay**
  - déduit la piste de l URL et affiche son numéro
  - rejoint l arène et s enregistre à la connexion
  - applique les opérations du plan de mise à jour
  - signale la déconnexion
  - arena.html ne contient plus de script inline

</details>

<details>
<summary><code>src/remote/js/arenaDisplayUtils.test.ts</code> — 7 tests</summary>

- **arenaDisplayUtils.js**
  - bannière : texte seul, jamais interprété comme HTML
  - id d’arène depuis le chemin
  - thèmes valides, repli sur dark, mémorisation
  - thème personnalisé : variables et overlay, nettoyé au retour
  - arena.html charge le module avant le script de page
  - applyScreenTheme : variables sur :root puis retrait (#1600)
  - public, pool et referee partagent applyScreenTheme (plus de copie inline)

</details>

<details>
<summary><code>src/remote/js/arenaOverlays.test.ts</code> — 7 tests</summary>

- **arenaOverlays.js**
  - cardAnnouncement : carton simple
  - cardAnnouncement : revalorisation, type inconnu -\> NOIR / classe jaune
  - exitAnnouncement
  - coinFlipPlan : vainqueur A = vert 3600, B = rouge 3780, noms par défaut
  - showRemoteMessage : texte seul (pas de HTML interprété), masqué après la durée
  - showIdentifyOverlay : étiquette échappée, masqué après 5 s par défaut
  - arena.html charge le module

</details>

<details>
<summary><code>src/remote/js/arenaPanels.test.ts</code> — 8 tests</summary>

- **arenaPanels.js**
  - photoSrc : préfixe ajouté seulement si absent
  - setPhoto : photo ou icône
  - visibilityPlan(%s, photos=%s, cur=%s, next=%s) -\> %s _(each)_
  - applyVisibility : pose les classes
  - updatePhotoIntro : inversion et noms par défaut
  - updateNextMatchPanel : arbitre affiché seulement si la fonction est active
  - updateIdleNextMatchDisplay : aperçu ou numéro d’arène
  - arena.html charge le module

</details>

<details>
<summary><code>src/remote/js/arenaRender.test.ts</code> — 9 tests</summary>

- **arenaRender.js**
  - updateStatusBadge : libellé + classe, statut inconnu = badge vide
  - scoreValue : nombre, objet, nul
  - updateMatchDisplay : sans inversion B à gauche ; avec, A à gauche
  - cardsHtml : valeurs inconnues ignorées, lettres, échappement
  - updateCardsDisplay : inversion échange les côtés
  - timerClasses : statut + alerte
  - updateTimerDisplay : délègue le rendu puis pose les classes
  - suddenDeathFlags + bannières
  - arena.html charge le module

</details>

<details>
<summary><code>src/remote/js/arenaScreen.test.ts</code> — 5 tests</summary>

- **arenaScreen.js**
  - pulseScore : classe seulement si le score change
  - watchScores : un changement de texte déclenche la classe
  - touche B : écran noir, toute touche le quitte
  - touche B ignorée dans un champ de saisie
  - arena.html charge le module et la feuille n'a pas de couleur en dur

</details>

<details>
<summary><code>src/remote/js/arenaUpdate.test.ts</code> — 9 tests</summary>

- **arenaUpdate.js planArenaUpdate**
  - message vide : bannières et visibilité seulement
  - thème : appliqué si changé, ou personnalisé modifié
  - tireur prioritaire : cadre effacé si le nouveau match ne le contient pas
  - scores : respectent l’inversion, y compris celle du même message
  - photos : intro seulement en statut ready avec photos
  - statut finished : masque l’animation pile ou face
  - prochain match : affichage d’attente selon le statut résultant
  - mort subite : démarrage annule l’attente d’overtime
  - arena.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/icons.test.ts</code> — 10 tests</summary>

- **icons.js**
  - rend un SVG décoratif, taille 1em, couleur héritée
  - icônes pleines : fill = currentColor
  - nom inconnu ou hostile : chaîne vide, aucun HTML injecté
  - classe additionnelle échappée
  - hydrate remplit \[data-icon\] et reste idempotent
  - rank : médaille pour 1-3, texte au-delà
  - card : pastille colorée par type, texte échappé si inconnu
  - expose des noms sans doublon
- **pages distantes**
  - %s charge /js/icons.js dès qu’elle utilise une icône _(each)_
- **noms d’icônes utilisés**
  - chaque data-icon / bpIcon / icon: référence une icône du jeu

</details>

<details>
<summary><code>src/remote/js/kioskApp.test.ts</code> — 2 tests</summary>

- **kioskApp.js dans kiosk.html**
  - kiosk.html ne contient plus de script inline
  - s exécute sans erreur et branche les événements socket

</details>

<details>
<summary><code>src/remote/js/kioskArenas.test.ts</code> — 9 tests</summary>

- **kioskArenas.js scores**
  - detectScoreChanges : changement, slash à +3, rien sans historique
  - detectScoreChanges : scores non numériques, piste sans match ou sans id
  - snapshotScores : null sans match, pistes sans id ignorées
- **kioskArenas.js gabarit**
  - piste libre : en attente, aucun match
  - match en cours : B rouge à gauche, A vert à droite
  - inversion : permutation des côtés et des couleurs
  - assigné (pas en cours) et score absent
  - XSS : noms, clubs et identifiants échappés
  - kiosk.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/kioskBracketRender.test.ts</code> — 7 tests</summary>

- **kioskBracketRender.js**
  - bracketBadge : joués / total, byes exclus
  - géométrie : taille naturelle, centres des matchs, colonnes
  - réduction à la hauteur disponible
  - gabarit : cartes, vainqueur, score, arène, connecteurs, bandeau finale
  - petite finale : pas de connecteur vers ou depuis le round 3
  - XSS : noms et arène échappés, byes ignorés
  - kiosk.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/kioskBracketUtils.test.ts</code> — 9 tests</summary>

- **kioskBracketUtils.js**
  - buildOverallRanking agrège les poules et trie victoires \> indice \> touches
  - buildOverallRanking sans id : clé nom\_prénom
  - sortBySeed ordonne selon le classement, inconnus en dernier
  - getBracketRoundOrder : décroissant, petite finale en dernier
  - getBracketDims : paliers de taille
  - isFocusMode : forcé, interdit, auto selon le seuil
  - buildCinemaFrames : ensemble puis plan par tour en cours, scan si trop haut
  - buildCinemaFrames : aucun tour en cours -\> toutes les colonnes
  - kiosk.html charge le module et ne redéfinit plus ces calculs

</details>

<details>
<summary><code>src/remote/js/kioskConfig.test.ts</code> — 7 tests</summary>

- **kioskConfig.js**
  - rotation : défaut 15, minimum 3, valeur sauvegardée
  - mode du tableau : valeurs connues seulement, sinon auto
  - vues : aller-retour, JSON invalide ou absent -\> null
  - parseTargetTime
  - secondsUntil : même jour, lendemain si passée
  - formatCountdown
  - kiosk.html charge le module

</details>

<details>
<summary><code>src/remote/js/kioskData.test.ts</code> — 8 tests</summary>

- **kioskData.js vues**
  - viewDefault : final désactivé par défaut, les autres activés
  - resolveViewChecks : local prioritaire, sinon serveur, sinon null
- **kioskData.js loadKioskData**
  - sans session : false, aucun autre appel
  - compétition : poules, classement général fourni ou null, arènes, suivants
  - classement général fourni par le serveur transmis
  - entraînement : historique au lieu des poules
  - erreur réseau propagée (reprise gérée par l’appelant)
  - kiosk.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/kioskEta.test.ts</code> — 5 tests</summary>

- **kioskEta.js**
  - libellé de phase : finale, tableau, poules, défaut
  - affiche le bandeau quand il reste des matchs
  - masque sans eta, sans match restant, sur erreur ou si désactivé
  - la case à cocher persiste l’option et rafraîchit
  - kiosk.html charge le module en script externe (CSP) sans code ETA inline

</details>

<details>
<summary><code>src/remote/js/kioskLists.test.ts</code> — 10 tests</summary>

- **kioskLists.js computeFinalRanking**
  - finalResults de l’application prioritaires, triés par place
  - non terminé : pas de tableau ou finale sans vainqueur
  - finale + petite finale + perdants des tours précédents
  - sans petite finale : perdants de demi-finale classés 3e et 4e par tête de série
  - byes ignorés dans les tours principaux
- **kioskLists.js HTML**
  - rankLabel : texte du rang (la médaille SVG vient de /js/icons.js)
  - finalTableHtml : ligne de tête et échappement
  - notDoneHtml
  - suivantsHtml : vide, regroupement par poule, en cours, initiales, échappement
  - kiosk.html charge le module

</details>

<details>
<summary><code>src/remote/js/kioskRender.test.ts</code> — 7 tests</summary>

- **kioskRender.js**
  - isPoolComplete : indicateur serveur prioritaire, sinon matchs joués
  - poolsHtml : message vide, sinon cartes avec rangs et statut
  - poolsHtml : tout est échappé (XSS)
  - rankingRowsHtml : attente, puis lignes avec indice signé
  - formatBoutDuration
  - trainingRowsHtml : vide, sinon ligne avec heure formatée et échappement
  - kiosk.html charge le module

</details>

<details>
<summary><code>src/remote/js/kioskTiming.test.ts</code> — 6 tests</summary>

- **kioskTiming.js**
  - retryDelay : exponentiel plafonné à 30 s, jitter ±25 %
  - nextView : circulaire, première vue si inconnue
  - progressPct : plafonné à 100
  - createAutoScroller : délai 2 s, défilement 20 s, retour début après 3 s
  - createAutoScroller : rien à défiler -\> pas de nouvelle image
  - kiosk.html charge le module et n’a plus la logique inline

</details>

<details>
<summary><code>src/remote/js/priorityDraw.test.ts</code> — 6 tests</summary>

- **priorityDraw.js : cohérence public/arène/arbitre (#1442)**
  - sideOf / isOtherMatch se basent sur les ids
  - fromEvent : winnerId prime sur le côté diffusé
  - refreshFrame : repeint le côté du prioritaire, sauf pendant l animation
- **priorityDraw.js**
  - ralentit puis totalise ~3 s
  - alterne puis se fixe sur le tiré (%s) _(each)_
  - arbitre : tirage sans vainqueur, chrono remis à 1:00 prêt à lancer

</details>

<details>
<summary><code>src/remote/js/priorityFrame.test.ts</code> — 3 tests</summary>

- **cadre doré du prioritaire (#1442)**
  - correspondance côté logique vers panneau affiché
  - le cadre est sur le panneau qui affiche le nom du prioritaire
  - le cadre survit au recalcul des classes (updateMatchDisplay)

</details>

<details>
<summary><code>src/remote/js/publicDisplay.test.ts</code> — 6 tests</summary>

- **publicDisplay.js PublicDisplay**
  - déduit la piste de l URL
  - rejoint l arène en rôle public et s enregistre
  - affiche les scores selon l inversion locale
  - suit le statut et la sélection de l arbitre
  - signale la déconnexion
  - public.html ne contient plus de script inline

</details>

<details>
<summary><code>src/remote/js/refereeApp.test.ts</code> — 5 tests</summary>

- **refereeApp.js dans referee.html**
  - referee.html ne contient plus de script inline
  - s exécute sans erreur et branche les événements socket
- **chrono conservé après rafraîchissement (#1717)**
  - pendant le match : le chrono diffusé est mémorisé en localStorage
  - reprise du même match en cours : temps restauré, chrono à l arrêt, arène remise en cours
  - match non commencé ou autre match : durée initiale, sauvegarde effacée

</details>

<details>
<summary><code>src/remote/js/refereeCards.test.ts</code> — 8 tests</summary>

- **refereeCards.js cartons**
  - modernYellowOrRed : rouge si déjà jaune ou rouge
  - cardFromGroup : classique (historique) et moderne
  - cardEffect : classique +3 / +5, blanc, 2e blanc -\> jaune
  - cardEffect : moderne, jaune sans point, rouge +1
  - cardVibration
- **refereeCards.js passivité**
  - nextPassivityCard : rouge, noir, puis plus rien
  - passivityWinner : score, puis classement initial, puis tirage
  - referee.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/refereeControls.test.ts</code> — 10 tests</summary>

- **refereeControls.js controlButtonsState**
  - tirage du prioritaire : tout verrouillé
  - attente du temps supplémentaire : libellé avec la durée, pas de bouton repos
  - tirage au sort : seulement à égalité
  - match non commencé : désactivé sans match
  - en cours : pause / reprise, terminer actif
  - terminé : démarrer désactivé
- **refereeControls.js chrono et repos**
  - timerClasses
  - scoreButtonsLocked
  - canStartRest : toutes les conditions requises
  - referee.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/refereeDemoMirror.test.ts</code> — 3 tests</summary>

- **tablette arbitre miroir (démo autonome)**
  - ouvre seule le match de la piste puis suit le démarrage et les scores
  - piste libérée : retour à la liste
  - hors démo, les méthodes d’origine sont appelées

</details>

<details>
<summary><code>src/remote/js/refereeFaults.test.ts</code> — 5 tests</summary>

- **refereeFaults.js**
  - chaque groupe a une clé de libellé et des fautes avec key + fr
  - clés de faute uniques et groupes olympiques 2-3
  - cartons de passivité vs standard
  - lastIndexWhere
  - referee.html charge le module et ne redéfinit plus les constantes

</details>

<details>
<summary><code>src/remote/js/refereeFeedback.test.ts</code> — 11 tests</summary>

- **son optionnel**
  - désactivé par défaut, bascule mémorisée, stockage cassé toléré
  - beep : false sans WebAudio, true avec
  - le bouton #btn-sound reflète l état (aria-pressed)
- **bouton Annuler la touche temporaire**
  - visible puis masqué après le délai, clic = annulation
  - minuteurs par défaut : setTimeout appelé sans this détourné (navigateur, #1716)
  - afterScore ne lève pas avec les minuteurs natifs (+1 opérant, #1716)
  - icône SVG devant le libellé quand /js/icons.js est chargé
- **referee.html (#1539)**
  - +1/+3/+5 ont un aria-label traduit (deux côtés)
  - charge le module sans script inline et branche afterScore
  - portrait et paysage : cibles tactiles \>= 44 px dans les deux orientations
  - clés i18n présentes dans les dix langues

</details>

<details>
<summary><code>src/remote/js/refereeLists.test.ts</code> — 8 tests</summary>

- **refereeLists.js données**
  - pendingMatches : à jouer ou en cours seulement, réponse vide tolérée
  - mergeMatches : ajoute les absents sans doublon
  - filterMatches : nom ou prénom, insensible à la casse, vide = tout
- **refereeLists.js gabarit**
  - liste vide : message de fin et liens signature / journal de l’arène
  - numéro d’arène échappé
  - cartes : noms, clubs, badge selon le statut, id en data-args
  - tireur inconnu : « ? » ; XSS échappé (noms, clubs, id)
  - referee.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/refereeLobby.test.ts</code> — 10 tests</summary>

- **refereeLobby.js**
  - arenaFromPath : /areneN/arbitre et /arenaN
  - clientId : généré puis conservé dans le stockage
  - clientId : stockage indisponible toléré
  - createIdleTracker : expire après 3 minutes, l'activité repousse
  - createIdleTracker : chrono en cours = actif (jamais d'expiration)
  - install : hors entraînement, rien (pas de claim, pas de bouton)
  - install : miroir de démo (?demo=1) ignoré
  - install : piste occupée (409) → redirection vers le lobby
- **referee.html et trainingLobby.html (#1500)**
  - referee.html charge le module et lance install
  - page lobby : pistes via l’API, lien vers l’arbitrage, i18n et common.js

</details>

<details>
<summary><code>src/remote/js/refereeScoring.test.ts</code> — 9 tests</summary>

- **refereeScoring.js zones**
  - activeCustomZones : standard, pool/tableau, zones tronquées à 3
  - slotPoints et zoneLetter : standard puis personnalisé
- **refereeScoring.js validateAddScore**
  - cas simples
  - mort subite challenger : seulement +5
  - entraînement : zones autorisées
  - vibrationMs
- **refereeScoring.js mort subite challenger**
  - shouldTriggerChallenger
  - challengerExit : sous 10 -\> retour supplémentaire ou fin de mort subite
  - referee.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/refereeTimer.test.ts</code> — 15 tests</summary>

- **refereeTimer.js timerTick**
  - même dixième : ni affichage complet ni diffusion
  - changement de seconde : diffusion et annonce
  - sous 10 s : diffusion à chaque dixième, sans annonce
  - au-dessus de 10 s : dixième seul ne diffuse pas
  - fin : plancher à 0, finished
- **refereeTimer.js timeUpAction**
  - repos terminé
  - égalité en temps normal : attente (classique) ou tirage prioritaire (olympique)
  - égalité en temps supplémentaire : tirage au sort (classique) ou prioritaire (olympique)
  - pas d’égalité ou mort subite désactivée : temps écoulé
  - referee.html charge le module et délègue
- **refereeTimer.js sauvegarde locale du chrono (#1717)**
  - aller-retour : même match restauré tel quel
  - autre match, autre arène ou sauvegarde effacée : rien à restaurer
  - sauvegarde périmée (\> 6 h) ou datée du futur : ignorée
  - valeurs corrompues : ignorées ; type de prolongation inconnu neutralisé
  - stockage indisponible (navigation privée, quota) : toléré

</details>

<details>
<summary><code>src/remote/js/refereeTts.test.ts</code> — 6 tests</summary>

- **refereeTts.js**
  - ttsLangCode : normalisation, br et inconnu -\> fr
  - ttsBcp47 et message d’activation avec repli fr
  - mergeTtsConfig : champs valides seulement, announce fusionné
  - announceKey : paliers
  - announcementFor : phrase, chiffres, repli numérique, palier coupé, rien
  - referee.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/refereeUpdate.test.ts</code> — 8 tests</summary>

- **refereeUpdate.js**
  - scoreValue : nombre, objet, absent
  - shouldReloadForRules : seulement règles chargées, différentes et hors match
  - idle : poule terminée, fermé par l’appli, ou simple nettoyage
  - in\_progress : reprise avec scores (nombre ou objet), ignorée si déjà connu
  - in\_progress : tireurs du match en repli
  - ready : nouveau match, déjà courant, ou match en cours
  - replaceOrPush et markReadyOrPush
  - referee.html charge le module et délègue

</details>

<details>
<summary><code>src/remote/js/timerFormat.test.ts</code> — 8 tests</summary>

- **timerFormat.js**
  - arbitre : dixièmes + centièmes toujours affichés
  - pause : la fraction n'est pas arrondie à la seconde
  - écrans : fraction seulement dans les 10 dernières secondes
  - valeurs invalides ou négatives : 00:00
  - renderTimer : texte + span fraction
  - withTenths : timerSeconds arrondi sup. sur un stockage en centièmes
  - createSmoothTimer : les centièmes s’écoulent entre deux diffusions
  - createSmoothTimer : pas d’animation au-dessus de 10 s

</details>

<details>
<summary><code>src/remote/js/ui.test.ts</code> — 9 tests</summary>

- **ui.js**
  - bouton : variante inconnue -\> primary, libellé échappé
  - badge de statut : classe selon le statut, repli pending, libellé échappé
  - barre de score : parts proportionnelles, 50/50 sans point
  - en-tête, carte, pied de page : titre échappé
  - thème : enregistré \> préférence système ; stockage indisponible toléré
  - init : injecte la feuille une seule fois
  - la feuille des composants ne contient aucune couleur en dur
  - pages simples chargent /js/ui.js avec data-bp-init (#1538)
  - auto-init : data-bp-init applique le thème au chargement

</details>

<details>
<summary><code>src/remote/kioskNoPolling.test.ts</code> — 4 tests</summary>

- **kiosk.html sans polling HTTP (#1152)**
  - aucun setInterval ne déclenche un fetch
  - se resynchronise sur événements, reconnexion, visibilité et retour réseau
  - backoff exponentiel avec jitter sur échec
  - timers d’animation suspendus quand la page est masquée

</details>

<details>
<summary><code>src/remote/refereeOfflineQueue.test.ts</code> — 10 tests</summary>

- la classe vit dans /js/offlineQueue.js, chargée par referee.html (#1401)
- **OfflineQueueInline — chaos réseau**
  - rejoue dans l’ordre chronologique (pas dans l’ordre des UUID)
  - ne garde que le dernier score par match : un ancien score n’écrase jamais le récent
  - coupure pendant le rejeu : rien n’est perdu, tout part au retour du réseau
  - erreur serveur (HTTP 429/500) : la file est conservée
  - action refusée par le serveur : seule celle-ci reste en file
  - deux sync simultanés (reconnexion + bouton) : aucun doublon envoyé
  - envoie par lots de 50 au plus
- **Badge de synchronisation (#1304)**
  - hors ligne prime sur un échec de synchronisation
  - en ligne : échec signalé, sinon état normal

</details>

<details>
<summary><code>src/remote/refereeTouchErgonomics.test.ts</code> — 7 tests</summary>

- **referee.html ergonomie tactile (#1539)**
  - espace les cibles de score et de cartons d au moins 8 px
  - donne un retour visuel à l appui sur les boutons de score et de contrôle
  - rend le focus visible sur les contrôles de saisie
  - garde le bouton Annuler plus grand que les sorties d arène
  - annonce les scores aux lecteurs d écran
  - hiérarchie : le bouton de score domine les cartons et les sorties (#1539)
  - prévoit une mise en page paysage compacte qui garde des cibles \>= 44 px

</details>

<details>
<summary><code>src/remote/remoteEscapeAnalysis.test.ts</code> — 14 tests</summary>

- **escHtml (/common.js)**
  - échappe & \< \> " ' et \`
  - null et undefined donnent une chaîne vide, 0 reste 0
- **gabarit html (/common.js)**
  - échappe les interpolations par défaut
  - html.raw laisse passer un fragment de confiance, les tableaux sont concaténés
- **analyseur des interpolations HTML**
  - signale une donnée brute dans un gabarit HTML
  - accepte escHtml, esc, escapeHtml, tk, nombres et conditions entre littéraux
  - ignore les gabarits sans balise
  - accepte un fragment audité marqué par un commentaire html
  - arr.map(…).join() : seuls les gabarits internes comptent
  - signale une concaténation brute assignée à innerHTML
  - bpIcon(…) (icône SVG de /js/icons.js) est une interpolation sûre
  - analyse les scripts inline des pages HTML
- **pages distantes (barrière de non-régression)**
  - aucune interpolation HTML non échappée dans src/remote
  - chaque page qui utilise escHtml charge /common.js

</details>

<details>
<summary><code>src/remote/remoteHtmlEscaping.test.ts</code> — 2 tests</summary>

- **échappement HTML des pages distantes**
  - dashboard.html échappe noms et clubs
  - app.js échappe les noms des tireurs

</details>

<details>
<summary><code>src/remote/remoteI18nLabels.test.ts</code> — 5 tests</summary>

- **kiosk.html : noms de poule traduits (#1213)**
  - cartes de poule : nom construit depuis le numéro
  - prochains matchs : regroupement par numéro de poule traduit
- **referee.html : raisons de carton avancé traduites (#1213)**
  - chaque raison a une clé et la valeur enregistrée reste en français
  - le texte français de la clé = valeur enregistrée
  - %s : toutes les raisons traduites _(each)_

</details>

<details>
<summary><code>src/remote/remoteInlinePagesI18n.test.ts</code> — 3 tests</summary>

- **%s (#1344)** _(each)_
  - chargée en mémoire par le serveur
  - charge i18n.js et common.js, langue active appliquée
  - aucune locale fr-FR en dur

</details>

<details>
<summary><code>src/remote/remotePagesXss.test.ts</code> — 2 tests</summary>

- **rendu inerte des noms piégés (#1147)**
  - dashboard : classement, poules et matchs
  - ${page} : match en cours et annonce de carton

</details>

<details>
<summary><code>src/remote/remotePolling.test.ts</code> — 7 tests</summary>

- **bpPoll (#1345)**
  - cadence nominale tant que tout réussit
  - 0 requête onglet masqué, reprise immédiate à la réapparition
  - démarré onglet masqué : aucune requête avant visibilité
  - backoff exponentiel plafonné après erreur, retour à la cadence au succès
  - une exception compte comme un échec
- **pages résultats / journal : bpPoll, plus de setInterval (#1345)**
  - %s _(each)_
  - paramètres de cadence

</details>

<details>
<summary><code>src/remote/swPrecache.test.ts</code> — 2 tests</summary>

- **sw.js précache (#1600)**
  - ${page} : tous ses scripts /js/\* sont précachés et existent
  - aucun doublon dans la liste précachée

</details>

### `src/renderer/contexts/`

<details>
<summary><code>src/renderer/contexts/__tests__/TranslationContext.test.tsx</code> — 4 tests</summary>

- **TranslationContext : langue active (#1160)**
  - attribut lang du document et formats Intl suivent la langue
  - enfants rendus avec la nouvelle langue (date des cartes, #1213)
  - paramètre 0 interpolé (plus remplacé par le gabarit)
  - pluriel : clés \_one / \_other selon Intl.PluralRules

</details>

### `src/renderer/styles/`

<details>
<summary><code>src/renderer/styles/contrast.test.ts</code> — 2 tests</summary>

- **contraste AA des teintes sémantiques (#1531)**
  - thème clair
  - thème sombre

</details>

<details>
<summary><code>src/renderer/styles/stylesheets.test.ts</code> — 3 tests</summary>

- **main.css / design.css**
  - index.tsx importe design.css après main.css
  - aucune déclaration de main.css écrasée par design.css
- **palette sombre : source unique (#1531)**
  - un seul bloc .theme-dark déclare des variables, hors @media / @supports

</details>

<details>
<summary><code>src/renderer/styles/theme.test.ts</code> — 8 tests</summary>

- **theme.css : palette sémantique (#1531)**
  - est importé après tokens.css
  - définit surfaces, accent et couleurs sémantiques
  - teintes douces redéfinies pour le thème sombre
  - badges sémantiques migrés vers les tokens, sans variante sombre dédiée
  - étapes terminées et badges de statut classement lisent les tokens sémantiques
  - échelle d'élévation à 3 niveaux
  - micro-interactions basées sur les tokens de mouvement, reduced-motion global
  - tokens.css : un seul bloc .theme-dark de variables, tableau inclus

</details>

<details>
<summary><code>src/renderer/styles/tokens.test.ts</code> — 3 tests</summary>

- **tokens.css : mouvement et surfaces (#1531)**
  - définit les tokens de mouvement
  - surface translucide uniquement sous @supports backdrop-filter, repli opaque par défaut
  - design.css neutralise les animations via prefers-reduced-motion

</details>

<details>
<summary><code>src/renderer/styles/utilities.test.ts</code> — 1 test</summary>

- **utilities.css**
  - définit toutes les classes utilitaires utilisées par les composants

</details>

### `src/renderer/utils/`

<details>
<summary><code>src/renderer/utils/writeHtmlWithCssom.test.ts</code> — 1 test</summary>

- **writeHtmlWithCssom**
  - écrit le document et réapplique les attributs style par CSSOM

</details>
