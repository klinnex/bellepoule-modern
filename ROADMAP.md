# Roadmap BellePoule Modern

> Mise à jour : 2026-10 — seuls les chantiers restants sont listés.

---

## P1 — Interface équipes complète

**Objectif :** Finaliser les compétitions par équipes (vues poule/tableau, format arène Sabre Laser et saisie tablette déjà en place).
Voir [docs/TEAM_COMPETITIONS.md](docs/TEAM_COMPETITIONS.md) pour le fonctionnement détaillé.

### Reste à faire

1. **Intégration dans le flux de phases `CompetitionView`** — par prudence (fichier de
   1800+ lignes, state machine `currentPhase` fortement couplée aux compétitions
   individuelles/Quest), les vues équipes restent pour l'instant dans la fenêtre
   modale « Gestion équipes » plutôt que dans les phases `pools`/`tableau` normales.
   À terme : soit brancher `phaseOrder` sur `competition.isTeamEvent`, soit accepter
   ce modal comme l'interface équipes définitive.
2. **Persistance des cartons + saisie tablette pour le relais FIE générique**
    (Épée/Fleuret/Sabre/Laser hors format arène) — actuellement résolu uniquement
    pour `teamFormat: 'laser-arena'` (voir docs/TEAM_COMPETITIONS.md).
3. **Impact en points des cartons d'équipe « E »** (format arène) — traçabilité
    seule pour l'instant, en attendant que le club tranche la valeur.
4. **PDF export** équipes (extension de `pdfExport.ts`).

---

## Hors scope

- Application mobile native (scope trop large)
- Multi-utilisateur réseau LAN (la tablette arbitre via Socket.IO couvre ce besoin)
- Intégration FIE internationale (pas de spec publique disponible)
