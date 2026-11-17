# Plugin Claude Code « bellepoule »

Interroger et, sur autorisation, piloter BellePoule Modern en langage naturel (#1880), par le
serveur MCP intégré à l'application (local, `127.0.0.1`). Référence des outils : [docs/MCP.md](../../docs/MCP.md).

## Installation

1. BellePoule Modern : **Paramètres → Système → Agent IA (MCP)** → activer (et « Autoriser
   l'écriture » pour préparer ou conduire une épreuve), puis « Copier la configuration ».
   Sans écran : `bellepoule-modern --mcp-print-config` affiche l'URL et le jeton ;
   `bellepoule-modern --headless --mcp [--mcp-write]` démarre le serveur.
2. Dans le terminal :

   ```bash
   export BELLEPOULE_MCP_TOKEN=<jeton>
   # export BELLEPOULE_MCP_PORT=8067   # si le port a été changé
   ```

3. Dans Claude Code :

   ```
   /plugin install bellepoule --marketplace BellePoule-Modern/bellepoule-modern
   ```

   Depuis un clone du dépôt : `claude --plugin-dir plugins/bellepoule`.

## Contenu

| Élément | Rôle |
|---|---|
| `.mcp.json` | Serveur `bellepoule` (HTTP local, jeton `BELLEPOULE_MCP_TOKEN`) |
| `skills/bellepoule` | Vocabulaire de l'escrime, déroulés types, garde-fous |
| `/bp-etat [journée]` | État de la salle : retards, conflits, pistes libres (lecture seule) |
| `/bp-journee <dossier>` | Préparer une journée depuis un dossier de fichiers |
| `/bp-epreuve <épreuve>` | Conduire une épreuve : pointage, poules, scores, tableau, résultats |
