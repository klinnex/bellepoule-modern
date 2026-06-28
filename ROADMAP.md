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

**Objectif :** Rendre les compétitions par équipes utilisables en prod.

### Étapes

1. **Audit** du store existant (`src/features/teams/`)
   - Vérifier `useTeamStore.ts`, `teamCalculations.ts`, `team.types.ts`
   - Identifier ce qui manque dans le renderer

2. **Vue poule équipes** (`src/renderer/components/TeamPoolView.tsx`)
   - Affiche les matchs équipe-vs-équipe (agrégat des tireurs)
   - Score total d'équipe, victoires collectives

3. **Tableau équipes** (`src/renderer/components/TeamTableauView.tsx`)
   - Bracket direct élimination entre équipes

4. **Intégration dans CompetitionView** (`src/renderer/components/CompetitionView.tsx`)
   - Détecter `competition.isTeam === true`
   - Router vers les vues équipes au lieu des vues individuelles

5. **PDF export** équipes (extension de `pdfExport.ts`)

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
