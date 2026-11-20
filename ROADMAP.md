# Roadmap BellePoule Modern

> Mise à jour : 2026-10 — seuls les chantiers restants sont listés.

---

## P1 — Interface équipes complète

**Objectif :** Finaliser les compétitions par équipes (vues poule/tableau, format arène Sabre Laser et saisie tablette déjà en place).
Voir [docs/TEAM_COMPETITIONS.md](docs/TEAM_COMPETITIONS.md) pour le fonctionnement détaillé.

### Reste à faire

1. **Impact en points des cartons d'équipe « E »** (format arène) — traçabilité
    seule pour l'instant, en attendant que le club tranche la valeur.

---

## P2 — Journée multi-épreuves (#1714)

**Objectif :** coordonner plusieurs épreuves d'une même salle.
Voir [docs/JOURNEE_MULTI_EPREUVES.md](docs/JOURNEE_MULTI_EPREUVES.md). Lot 1 fait : journée, arbitres partagés, conflits.

### Reste à faire

1. **Registre de pistes partagé** : piste libérée par une épreuve → disponible pour les autres.
2. **Kiosk de la journée** : écran public commun.

---

## Hors scope

- Application mobile native (scope trop large)
- Multi-utilisateur réseau LAN (la tablette arbitre via Socket.IO couvre ce besoin)
- Intégration FIE internationale (pas de spec publique disponible)
