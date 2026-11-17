---
description: État de la salle BellePoule Modern — retards, conflits d'arbitres, pistes libres, tablettes
---

Fais le point sur la salle avec le serveur MCP `bellepoule` (lecture seule) :

1. `list_competitions`, puis pour chaque épreuve du jour `get_pool_ranking` (avancement des poules : matchs joués / total) ou `get_bracket` si les poules sont finies.
2. S'il y a une journée multi-épreuves : `day_overview` (conflits d'arbitres) et `strip_occupation` (pistes libres, réservées, occupées).
3. `server_status` : arènes sans match, tablettes connectées ; `cyrano_status` : appareils hors ligne ou en alerte.

Réponds en français, en quelques lignes : poules en retard (moins de matchs joués que la médiane), conflits d'arbitres, pistes libres, alertes d'appareils. $ARGUMENTS
