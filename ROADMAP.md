# Roadmap BellePoule Modern

> Date : 2026-06-18 · Branche active : `claude/arbitrage-sabre-laser-improvements-0vt15z`

---

## P0 — Fait (sprint courant)

### ✅ Dashboard analytics graphiques SVG
**Fichiers :** `src/renderer/components/analytics/AnalyticsCharts.tsx`, `AnalyticsDashboard.tsx`

- Heatmap zones A/B/C agrégée (tous tireurs) avec barres de progression
- Donut chart répartition cartons (blanc/jaune/rouge)
- Histogramme durées de match (buckets <1min, 1-2min, 2-3min, 3-4min, >4min)
- Bar chart top 8 tireurs (points touches en Laser Sabre, matchs joués sinon)
- Bar chart cartons par motif (17 motifs FFE, classé par fréquence)
- Onglet "Graphiques" ajouté dans `AnalyticsDashboard` (3e onglet, rechargement DB)
- Zéro dépendance externe — SVG natif

### ✅ Export CSV analytics
**Fichier :** `src/features/analytics/services/analyticsService.ts`

- `exportAnalytics(id, 'csv')` générait `''` → génère maintenant du CSV UTF-8 valide
- Export CSV per-fencer depuis `AnalyticsCharts` via dialog save (zones, cartons, durées)

---

## P1 — Ranking saisonnier Quest multi-compétitions

**Objectif :** Classement cumulatif sur une saison FFE Quest (plusieurs tournois).

### Étapes

1. **Schéma DB** (`src/database/migrations/`)
   - Table `season_rankings` : `fencerId, fencerLastName, fencerFirstName, club, totalVictories, totalQuestPoints, totalRedCards, touchDiff, competitions[]`
   - Migration incrémentale (numéro suivant dans `migrations.ts`)

2. **Service** (`src/features/analytics/services/seasonRankingService.ts`)
   - `addCompetitionResults(competitionId)` : lit les classements Quest finaux et ajoute à la saison
   - `getSeasonRanking()` : trie par V/M → Quest Points → cartons rouges → TD-TR (règles FFE)
   - `resetSeason()` : vide la table (nouvelle saison)
   - `exportSeasonCSV()` / `exportSeasonPDF()`

3. **IPC handler** (`src/main/main.ts`)
   - `db.getSeasonRanking`, `db.addCompetitionToSeason`, `db.resetSeason`

4. **Composant** (`src/renderer/components/SeasonRankingView.tsx`)
   - Table triable avec colonnes : Rang, Nom, Club, V/M, QP, Cartons rouges, TD-TR, Compétitions
   - Boutons : Ajouter compétition, Exporter CSV/PDF, Réinitialiser saison
   - Accessible depuis le menu principal (hors compétition active)

5. **Tests** (`src/features/analytics/services/seasonRankingService.test.ts`)
   - Vérifier tri FFE (égalités V/M → QP → cartons rouges → TD-TR)

---

## P1 — Interface équipes complète

**Objectif :** Rendre les compétitions par équipes utilisables en prod, arme par arme.
Voir [docs/TEAM_COMPETITIONS.md](docs/TEAM_COMPETITIONS.md) pour le fonctionnement détaillé.

### Fait

1. ✅ **Audit** du store existant (`src/features/teams/`) — le vrai composant branché
   en prod était `TeamManagerView.tsx` (pas le store Zustand `useTeamStore`, resté
   inutilisé), avec une logique figée à 3 titulaires / 45 points quelle que soit l'arme.
2. ✅ **Configuration arme-aware** (`teamCalculations.ts`) : taille d'équipe et nombre
   de réservistes configurables (`settings.minTeamSize`/`teamReserveCount`), cible de
   relais progressive généralisée (`getTeamTargetRule`, `getRelayCap`), ordre des
   relais généralisé à N titulaires (`generateRelayOrder`).
3. ✅ **Score par assaut arme-aware** : touche double simultanée (épée), zones A/B/C
   Sabre Laser (`laserTeamMode: 'points'`), cartons par tireur (`cardSystem.ts`).
4. ✅ **Vue poule équipes** (`src/renderer/components/TeamPoolView.tsx`) — composant
   présentationnel, classement extrait dans `calculateTeamPoolRanking`.
5. ✅ **Tableau équipes** (`src/renderer/components/TeamTableauView.tsx`) — élimination
   directe, têtes de série = classement de poule, tours suivants générés
   automatiquement (`resolveTeamTableauSlot`), migration DB v14
   (`team_matches.table_id/round/position`).
6. ✅ **Format arène Sabre Laser équipe** (`teamFormat: 'laser-arena'`, règlement
   ASL-FFE) — assaut plafonné 5 touches/3min, score = total de points, classement de
   poule par points cumulés, cartons d'équipe « E » persistés (table
   `team_match_cards`, migration v15), calendriers de poule figés 8/12 équipes avec
   assesseurs, évitement de revanche au tableau (5↔6/7↔8). Fichiers :
   `laserArenaCalculations.ts`, `laserArenaPoolSchedules.ts`,
   `laserArenaBracketRules.ts`, `teamCardEscalation.ts`. Résout les points 7 et 8
   ci-dessous, **pour ce format uniquement** — le relais FIE générique garde
   l'ancien comportement (voir `docs/TEAM_COMPETITIONS.md`).
7. ✅ **Saisie live arène/tablette** — `src/remote/teamArena.html` /
   `teamReferee.html`, routes `/equipe:id` et `/equipe:id/arbitre` sur
   `remoteScoreServer.ts` (compteur de touches déclenchant le relais suivant).
   Format arène Sabre Laser uniquement.
8. ✅ **Persistance des cartons** d'équipe en base — format arène Sabre Laser
   uniquement (table `team_match_cards`) ; le relais FIE générique reste en mémoire
   de session.

### Reste à faire

9. **Intégration dans le flux de phases `CompetitionView`** — par prudence (fichier de
   1800+ lignes, state machine `currentPhase` fortement couplée aux compétitions
   individuelles/Quest), les vues équipes restent pour l'instant dans la fenêtre
   modale « Gestion équipes » plutôt que dans les phases `pools`/`tableau` normales.
   À terme : soit brancher `phaseOrder` sur `competition.isTeamEvent`, soit accepter
   ce modal comme l'interface équipes définitive.
10. **Persistance des cartons + saisie tablette pour le relais FIE générique**
    (Épée/Fleuret/Sabre/Laser hors format arène) — actuellement résolu uniquement
    pour `teamFormat: 'laser-arena'` (point 6-8 ci-dessus).
11. **Impact en points des cartons d'équipe « E »** (format arène) — traçabilité
    seule pour l'instant, en attendant que le club tranche la valeur.
12. **PDF export** équipes (extension de `pdfExport.ts`).

---

## P2 — Audit log UI organisateur

**Objectif :** Permettre à l'organisateur de consulter l'historique complet des modifications de scores.

### Étapes

1. **Vérifier le store** (`src/features/matchAuditLog/`)
   - Confirmer que les entrées sont bien enregistrées en DB depuis `remoteScoreServer.ts`

2. **Composant** (`src/renderer/components/AuditLogViewer.tsx`)
   - Table : horodatage, arène, match, action (score/carte/undo), ancien/nouveau score, IP arbitre, identifiant
   - Filtre par arène, par match, par plage horaire
   - Export CSV

3. **Accès** : bouton dans `AnalyticsDashboard` onglet "Performance" → modal

---

## P2 — OBS Overlay config UI

**Objectif :** Configurer le stream overlay depuis l'app (endpoint `/api/arenas/{id}/obs-json` existe déjà).

### Étapes

1. **Composant** (`src/renderer/components/OBSOverlayConfig.tsx`)
   - Sélection arène à afficher
   - Preview temps réel du JSON OBS
   - URL copiable (http://localhost:8066/api/arenas/{id}/obs-json)
   - Options : afficher/masquer timer, cartons, nom tireurs, logo

2. **Accès** depuis `RemoteScoreManager` (section "Streaming")

---

## P3 — PDF template editor visuel

**Objectif :** Permettre aux clubs de personnaliser couleurs, logo, polices dans les PDFs.

### Étapes

1. **Composant editor** (`src/renderer/components/PdfTemplateEditor.tsx`)
   - 3 onglets : Couleurs, Typographie, En-tête/Pied de page
   - Prévisualisation en temps réel (iframe ou canvas)
   - Persistance dans localStorage + export JSON template

2. **Intégration** : passer le template au `SimplePdfTemplateManager` existant (`src/shared/utils/pdfTemplates.ts`)

3. **Templates prédéfinis supplémentaires** : "Sabre Laser" (bleu/violet), "Compétition officielle FFE" (rouge/blanc)

---

## Hors scope (ne jamais merger vers main)

- Application mobile native (scope trop large)
- Multi-utilisateur réseau LAN (la tablette arbitre via Socket.IO couvre ce besoin)
- Intégration FIE internationale (pas de spec publique disponible)

---

## Conventions de branche

| Préfixe | Destination merge |
|---|---|
| `claude/*` | → `dev` uniquement (jamais `main`) |
| `feature/*` | → `dev` |
| `fix/*` | → `dev` |
| Release finale | `dev` → `main` par l'utilisateur |
