# Roadmap BellePoule Modern

> Mise à jour : 2026-10 — seuls les chantiers restants sont listés.

---

## P1 — Interface équipes complète

**Objectif :** Finaliser les compétitions par équipes (vues poule/tableau, format arène Sabre Laser et saisie tablette déjà en place).
Voir [docs/TEAM_COMPETITIONS.md](docs/TEAM_COMPETITIONS.md) pour le fonctionnement détaillé.

### Reste à faire

1. **Persistance des cartons + saisie tablette pour le relais FIE générique**
    (Épée/Fleuret/Sabre/Laser hors format arène) — actuellement résolu uniquement
    pour `teamFormat: 'laser-arena'` (voir docs/TEAM_COMPETITIONS.md).
2. **Impact en points des cartons d'équipe « E »** (format arène) — traçabilité
    seule pour l'instant, en attendant que le club tranche la valeur.

---

## Hors scope

- Application mobile native (scope trop large)
- Multi-utilisateur réseau LAN (la tablette arbitre via Socket.IO couvre ce besoin)
- Intégration FIE internationale (pas de spec publique disponible)
