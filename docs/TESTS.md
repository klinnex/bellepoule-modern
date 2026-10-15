# Tests opérationnels

> ⚠️ Fichier **généré** par `npm run docs:tests` (`scripts/generate-tests-doc.js`).
> Ne pas éditer à la main : modifier le script pour la partie fixe, les fichiers
> de test pour l'inventaire. La CI échoue (`npm run check:tests-doc`) si ce
> fichier n'est pas régénéré après ajout / suppression / renommage d'un test.

## Contrôles qualité en CI

Job `quality` de `.github/workflows/build-dev.yml` (push sur `dev`) et
`.github/workflows/build.yml` (push sur `main`). Les builds par plateforme
dépendent de ce job.

| Étape | Commande | Échoue si |
|---|---|---|
| Typage | `npm run type-check` | erreur TypeScript (`tsc --noEmit`, mode strict) |
| i18n | `npm run check:i18n` | clé manquante / en trop vs `fr.json` (`scripts/check-i18n-completeness.js`) |
| Doc des tests | `npm run check:tests-doc` | `docs/TESTS.md` pas à jour vs fichiers de test |
| Doc i18n | `npm run check:i18n-doc` | `docs/I18N.md` pas à jour, ou clé `data-i18n` d'une page distante absente de `src/remote/i18n.js` |
| Doc Socket.IO | `npm run check:socket-doc` | `docs/SOCKET_EVENTS.md` pas à jour, ou événement émis par une page sans écouteur serveur |
| Cliquet qualité | `npm run check:quality` | hausse du nombre de textes JSX en dur, `any` ou `console.*` vs `scripts/quality-baseline.json` (`--update` pour verrouiller une baisse) |
| Tests unitaires | `npm run test:run` | un test Vitest échoue |
| Budget bundle | `npm run build:renderer` + `node scripts/check-bundle-size.js` | JS renderer : initial > 2.75 MiB, un chunk à la demande > 1 MiB, total > 6 MiB, ou aucun chunk à la demande (`scripts/check-bundle-size.js`) |

Hors CI (manuel) : `npm run lint`, `npm run format:check`, `npm run test:coverage`,
`npm run test:e2e`.

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
2. `npm run docs:tests` → régénère ce fichier.
3. Committer `docs/TESTS.md` avec le test.

## Synthèse

| Domaine | Fichiers | Tests |
|---|---:|---:|
| `src/shared/utils/` | 33 | 528 |
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
| Feature `teams` (`src/features/teams/`) | 7 | 53 |
| `src/database/` | 2 | 118 |
| `src/main/` | 6 | 111 |
| `src/renderer/services/` | 2 | 16 |
| `src/renderer/hooks/` | 16 | 97 |
| `src/renderer/components/` | 30 | 142 |
| E2E Playwright (`e2e/`) | 8 | 31 |
| `src/remote/` | 1 | 8 |
| `src/renderer/styles/` | 2 | 3 |
| **Total** | **132** | **1367** |

Unitaires : 124 fichiers, 1336 tests. E2E : 8 fichiers, 31 tests (comptage statique ; `it.each` / `describe.each` comptent pour 1).

## Inventaire détaillé

### `src/shared/utils/`

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
<summary><code>src/shared/utils/fencerExport.test.ts</code> — 11 tests</summary>

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
<summary><code>src/shared/utils/fileParser.test.ts</code> — 43 tests</summary>

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
  - fichier FFE réel (Windows-1252, lignes de métadonnées)
  - decodeTextFile garde l’UTF-8 valide
  - .fff ouvert via « Importer XML » → parseur FFE
- **issue #906 — lignes .fff avec champs omis**
  - tireur conservé : %s _(each)_
  - section personnelle incomplète : club et licence non décalés

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
<summary><code>src/shared/utils/i18nCsv.test.ts</code> — 5 tests</summary>

- **i18n CSV (#1079)**
  - exporte key, fr, langue avec échappement CSV et BOM
  - aller-retour : parse ce qu’il exporte
  - accepte le point-virgule (Excel FR) et les retours à la ligne dans une cellule
  - applique les traductions, garde l’ordre de la référence, ignore cellules vides et clés inconnues
  - refuse un CSV sans en-tête attendu

</details>

<details>
<summary><code>src/shared/utils/matchReplay.test.ts</code> — 6 tests</summary>

- **buildMatchReplay (#1074)**
  - trie par horodatage et calcule le temps écoulé
  - score\_change fait foi : les touches ne sont pas recomptées
  - sans score\_change : cumule touches et sorties d’arène (points à l’adversaire)
  - accumule les cartons par côté sans muter les images précédentes
  - journal vide → aucune image
- **formatReplayOffset**
  - mm:ss

</details>

<details>
<summary><code>src/shared/utils/multiFormatExport.test.ts</code> — 44 tests</summary>

- **exportRankingCSV**
  - includes header row
  - uses semicolon as separator
  - assigns sequential rank numbers
  - marks FORFAIT fencer with F
  - marks EXCLUDED fencer with X
  - marks ABANDONED fencer with A
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
  - includes elimination bracket when tableauMatches provided
  - maps ABANDONED to A
  - maps EXCLUDED to X
  - maps FORFAIT to F
  - maps ELIMINATED to E
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
<summary><code>src/shared/utils/pdfExport/poolPdf.test.ts</code> — 6 tests</summary>

- **generatePoolHTML – options export (#932)**
  - affiche les colonnes statistiques par défaut
  - masque V, V/M, TD, TR, Ind et Rg avec hideStatColumns
  - conserve les colonnes non statistiques (club) avec hideStatColumns
  - applique le format paysage
- **generatePoolHTML – couleurs du modèle (#992)**
  - la surcharge de couleurs suit le CSS de base (sinon écrasée)
  - couleur invalide ignorée (injection CSS)

</details>

<details>
<summary><code>src/shared/utils/pdfExport/refereeCommentsPdf.test.ts</code> — 2 tests</summary>

- **generateRefereeCommentsHTML (#989)**
  - une page par arbitre commenté, textes échappés
  - message si aucun commentaire

</details>

<details>
<summary><code>src/shared/utils/pdfExport/teamPdf.test.ts</code> — 10 tests</summary>

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
<summary><code>src/shared/utils/phaseEta.test.ts</code> — 6 tests</summary>

- **median**
  - impair, pair, vide
- **estimatePhaseEta**
  - utilise la médiane des durées mesurées + changement de piste
  - valeur par défaut tant que moins de 3 matchs sont mesurés
  - arrondit les vagues au supérieur et borne les pistes à 1
  - rien à jouer → fin = maintenant
  - ne garde que les durées récentes et valides

</details>

<details>
<summary><code>src/shared/utils/poolCalculations.test.ts</code> — 37 tests</summary>

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
  - devrait annuler les matchs déjà disputés contre un tireur déclaré forfait
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
  - règle classique inchangée : tous les matchs contre le forfait sont annulés
  - classe le forfait sur ses matchs disputés dans la poule
  - place le forfait en fin de classement général (non qualifié pour le tableau)

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
<summary><code>src/shared/utils/pseudoLocale.test.ts</code> — 5 tests</summary>

- **pseudoLocalize**
  - accentue les lettres et encadre la chaîne
  - préserve les paramètres {{nom}}
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
<summary><code>src/database/database.test.ts</code> — 34 tests</summary>

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
  - **getFencer**
    - retourne null si le tireur n'est pas trouvé
    - retourne un objet Fencer si trouvé
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
<summary><code>src/database/validation.test.ts</code> — 84 tests</summary>

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
- **sanitizeId**
  - conserve lettres, chiffres, tirets et underscores
  - supprime les caractères spéciaux
  - trim avant de filtrer

</details>

### `src/main/`

<details>
<summary><code>src/main/certManager.test.ts</code> — 2 tests</summary>

- **certManager**
  - buildAltNames : localhost, loopback et IPv4 externes uniquement
  - ensureCert génère un certificat avec SAN réels, puis le réutilise

</details>

<details>
<summary><code>src/main/remote/auth.test.ts</code> — 9 tests</summary>

- **parseCookies**
  - décode les paires et ignore les parties malformées
- **mots de passe scrypt**
  - hash salé, vérification à temps constant
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
<summary><code>src/main/remote/fencerSchedule.test.ts</code> — 5 tests</summary>

- **buildFencerSchedule (#1078)**
  - liste les matchs du tireur avec scores de son point de vue
  - donne le prochain match, sa piste et le nombre de matchs avant
  - marque le match en cours sur une piste
  - piste inconnue si la poule n’est assignée à aucune arène
  - null pour un tireur sans match

</details>

<details>
<summary><code>src/main/remote/routes/pageRoutes.test.ts</code> — 3 tests</summary>

- **registerPageRoutes (#1065)**
  - planning tireur : données de session via le contexte
  - planning tireur : 404 inconnu, 400 identifiant invalide
  - ETA publique : null sans session ou en entraînement

</details>

<details>
<summary><code>src/main/remoteScoreServer.test.ts</code> — 85 tests</summary>

- **RemoteScoreServer**
  - **démarrage du serveur**
    - construit une instance sans erreur
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
  - **broadcastDashboardUpdate (#1069)**
    - ne relit pas la base quand aucun dashboard n’est abonné
    - diffuse aux dashboards abonnés
  - **fin estimée de phase (#1077)**
    - le snapshot dashboard inclut une ETA basée sur les durées réelles
  - **liste des arbitres de session**
    - inclut les arbitres ajoutés après le démarrage de la session
    - ne lit pas la base en mode entraînement
  - **ordre des matchs public (#911) et arbitre de poule (#908)**
    - expose uniquement noms, ordre, statut et scores, sans authentification
    - la liste tablette porte l'arbitre de la poule quand le match n'en a pas
  - **carton noir (paramètre compétition)**
    - désactivé par défaut et exposé via /api/session
    - updateBlackCardEnabled active le flag et le diffuse aux arènes
  - **piste assignée aux poules (pool.strip)**
    - poule assignée piste 3 → match sur arena3, pas arena1
    - piste au-delà du nombre configuré → arènes étendues
    - sans piste → ordre des poules sur pistes libres
  - **réassignation manuelle de piste (#1037)**
    - match réassigné en tête de liste de la piste cible, retiré de la piste source
    - les réassignations suivantes se rajoutent par le haut
    - joué ensuite, puis la piste reprend sa propre poule
  - **arbitre des matchs de tableau assigné depuis l'appli (#977)**
    - arbitre transmis au match chargé sur la tablette
    - changement d'arbitre → match en cours mis à jour
    - arbitre retiré → plus d'arbitre sur la tablette
    - mode expert : tous les arbitres affichés
    - match en file d'attente : arbitre porté
  - **annulation carton noir depuis la tablette**
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

</details>

<details>
<summary><code>src/main/updateIntegrity.test.ts</code> — 7 tests</summary>

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

</details>

### `src/renderer/services/`

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
<summary><code>src/renderer/hooks/useColumnVisibility.test.tsx</code> — 6 tests</summary>

- **useColumnVisibility**
  - expose les colonnes par défaut visibles
  - toggleColumn masque puis réaffiche une colonne
  - setVisibleColumns remplace la liste
  - réglage par poule indépendant du défaut global
  - setAllPoolColumns applique à tous et efface les réglages propres
  - persiste dans localStorage

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
<summary><code>src/renderer/hooks/useFencerManagement.test.tsx</code> — 7 tests</summary>

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
- **deleteAllFencers**
  - vide la liste et notifie

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
<summary><code>src/renderer/hooks/useOffline.test.tsx</code> — 6 tests</summary>

- **useOffline**
  - charge le statut de synchro au montage
  - charge les données en cache
  - sync déclenche triggerSync quand en ligne
  - sync est ignoré hors ligne
  - refreshCache appelle le service en ligne
  - réagit à l’évènement offline

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
<summary><code>src/renderer/components/AddFencerModal.test.tsx</code> — 3 tests</summary>

- **AddFencerModal**
  - ajoute un tireur avec nom en majuscules puis ferme
  - ne soumet pas sans nom/prénom
  - le bouton annuler ferme la modale

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
<summary><code>src/renderer/components/ChangePoolModal.test.tsx</code> — 3 tests</summary>

- **ChangePoolModal**
  - liste les autres poules (pas la poule courante)
  - le bouton déplacer est désactivé tant qu’aucune poule n’est choisie
  - sélectionner une poule puis déplacer appelle onMove + onClose

</details>

<details>
<summary><code>src/renderer/components/CommandPalette.test.tsx</code> — 6 tests</summary>

- **CommandPalette**
  - affiche les compétitions et les actions statiques
  - filtre selon la requête
  - affiche un message si aucun résultat
  - clic sur une compétition déclenche la sélection
  - Échap ferme la palette
  - clic sur l’action « nouvelle compétition »

</details>

<details>
<summary><code>src/renderer/components/CompetitionView.test.tsx</code> — 11 tests</summary>

- **CompetitionView**
  - affiche la navigation des phases, appel actif et poules verrouillées
  - sans élimination directe, la phase tableau est absente
  - « Générer les poules » désactivé sous 4 tireurs pointés
  - génère les poules, les persiste en base et passe en préparation
  - restaure la phase sauvegardée (session) et permet de revenir en arrière
  - cliquer une phase désactivée ne change pas de phase
  - plusieurs tours de poules : libellé « tour 1/2 »
  - l'appel se stabilise : plus aucun rendu une fois chargé
  - pointer un tireur met à jour son statut en base
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
  - retombe sur window.confirm
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
<summary><code>src/renderer/components/FencerList.test.tsx</code> — 3 tests</summary>

- **FencerList**
  - affiche les tireurs
  - filtre via la recherche (debounce)
  - le bouton ajouter déclenche onAddFencer

</details>

<details>
<summary><code>src/renderer/components/ImportModal.test.tsx</code> — 3 tests</summary>

- **ImportModal**
  - affiche le fichier et la liste des tireurs parsés
  - importe les tireurs sélectionnés (tous par défaut) puis ferme
  - le bouton fermer déclenche onClose

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
<summary><code>src/renderer/components/PoolView.test.tsx</code> — 14 tests</summary>

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
<summary><code>src/renderer/components/Toast.test.tsx</code> — 7 tests</summary>

- **ToastProvider / useToast**
  - rend les enfants
  - affiche un toast au déclenchement
  - disparaît automatiquement après 4 s
  - peut être fermé manuellement
  - conteneur annoncé via aria-live=polite
  - empile plusieurs toasts
- **useToast hors provider**
  - fournit un showToast no-op sans planter

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
<summary><code>src/renderer/components/__tests__/OfflineStatus.test.tsx</code> — 6 tests</summary>

- **OfflineStatus**
  - se rend sans crash
  - affiche "Connecté" quand en ligne sans actions en attente
  - affiche "Hors ligne" quand hors ligne
  - le clic sur le status toggle affiche les détails
  - affiche le nombre d'actions en attente
  - affiche "Synchronisation..." pendant la synchro

</details>

<details>
<summary><code>src/renderer/components/__tests__/ScoreAuditLog.test.tsx</code> — 1 test</summary>

- **ScoreAuditLog — colonne Arbitre (#1031)**
  - affiche l'arbitre saisi, sinon le ou les arbitres assignés au match

</details>

<details>
<summary><code>src/renderer/components/common/CollapseToggle.test.tsx</code> — 2 tests</summary>

- **CollapseToggle**
  - compacte puis déplie le contenu
  - mémorise l'état entre deux montages

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
<summary><code>src/renderer/components/pool/PoolScoreMatrix.test.tsx</code> — 5 tests</summary>

- **PoolScoreMatrix**
  - affiche les noms des tireurs en en-tête de ligne
  - affiche la colonne Victoires quand isVisible le permet
  - affiche le score V5 pour un match gagné
  - clic sur une cellule éditable déclenche onCellClick
  - ne déclenche pas onCellClick si verrouillé

</details>

<details>
<summary><code>src/renderer/components/tableau/TableauScoreModal.test.tsx</code> — 3 tests</summary>

- **TableauScoreModal**
  - affiche le nom du tour et les tireurs
  - saisir un score appelle setEditScoreA
  - Valider déclenche onSubmit

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
<summary><code>src/renderer/components/tableau/tableauTypes.test.ts</code> — 5 tests</summary>

- **propagateWinners**
  - apparie les feeders par position même si matchList est désordonné
- **propagateWinners - taille périmée/invalide**
  - propage même si size vaut 0
  - propage le vainqueur des 8es vers les quarts (size correct)
- **propagateWinners - abandon / forfait / exclusion (#1012)**
  - conserve le vainqueur d’un match sans score (abandon en finale)
  - efface un vainqueur périmé qui n’est plus dans le match

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
<summary><code>e2e/accessibility.spec.ts</code> — 3 tests</summary>

- **Accessibility**
  - should have proper ARIA labels
  - should be keyboard navigable
  - should respect reduced motion preference

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

### `src/remote/`

<details>
<summary><code>src/remote/refereeOfflineQueue.test.ts</code> — 8 tests</summary>

- extrait bien la classe depuis referee.html
- **OfflineQueueInline — chaos réseau**
  - rejoue dans l’ordre chronologique (pas dans l’ordre des UUID)
  - ne garde que le dernier score par match : un ancien score n’écrase jamais le récent
  - coupure pendant le rejeu : rien n’est perdu, tout part au retour du réseau
  - erreur serveur (HTTP 429/500) : la file est conservée
  - action refusée par le serveur : seule celle-ci reste en file
  - deux sync simultanés (reconnexion + bouton) : aucun doublon envoyé
  - envoie par lots de 50 au plus

</details>

### `src/renderer/styles/`

<details>
<summary><code>src/renderer/styles/stylesheets.test.ts</code> — 2 tests</summary>

- **main.css / design.css**
  - index.tsx importe design.css après main.css
  - aucune déclaration de main.css écrasée par design.css

</details>

<details>
<summary><code>src/renderer/styles/utilities.test.ts</code> — 1 test</summary>

- **utilities.css**
  - définit toutes les classes utilitaires utilisées par les composants

</details>
