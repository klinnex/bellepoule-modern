# Politique de sécurité

## Signaler une vulnérabilité

Ne pas ouvrir d'issue publique. Utiliser **Security → Report a vulnerability** sur
https://github.com/klinnex/bellepoule-modern/security/advisories/new
(ou écrire au mainteneur via son profil GitHub).

Indiquer : version (`version.json`), système, étapes de reproduction, impact. Accusé de réception visé sous 7 jours.

## Versions suivies

Seule la dernière version publiée reçoit des correctifs de sécurité.

## Périmètre et garde-fous existants

- Processus principal Electron : `docs/SECURITE_ELECTRON.md` ; chemins fichiers et imports ZIP : `docs/SECURITE_SAISIE_DISTANTE.md`.
- Pages distantes : CSP à nonce, échappement systématique (`common.js`), mots de passe et jetons par piste.
- Chaîne d'approvisionnement : Dependabot, CodeQL, `npm audit` + SBOM CycloneDX (workflow *Security audit*), actions GitHub épinglées par SHA, mises à jour vérifiées par SHA-256 (`updateIntegrity.ts`).
