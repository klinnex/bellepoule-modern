# Plugin Claude Code « bellepoule »

Interroger et, sur autorisation, piloter BellePoule Modern en langage naturel (#1880).

1. BellePoule Modern : **Paramètres → Système → Agent IA (MCP)** → activer, puis « Copier la configuration ».
2. Exporter le jeton : `export BELLEPOULE_MCP_TOKEN=…` (et `BELLEPOULE_MCP_PORT` si le port n'est pas 8067).
   Sans écran : `bellepoule-modern --mcp-print-config` affiche l'URL et le jeton ; `bellepoule-modern --headless --mcp [--mcp-write]` démarre le serveur.
3. Installer le plugin (`/plugin install` depuis ce dossier) puis `/bp-etat`.

Détails : `docs/MCP.md`.
