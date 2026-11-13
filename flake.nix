{
  description = "BellePoule Modern – gestion de tournois d'escrime (Electron)";

  # Pour générer flake.lock : `nix flake lock` (ou `nix flake update`).
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      lib = nixpkgs.lib;

      # Electron/Chromium : Linux uniquement (macOS/Windows → installeurs de electron-builder).
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      pkgJson = lib.importJSON ./package.json;

      mkBellepoule =
        pkgs:
        let
          # Doit correspondre à devDependencies.electron (45.x).
          electron = pkgs.electron_45;
        in
        pkgs.buildNpmPackage {
          pname = "bellepoule-modern";
          version = pkgJson.version;

          # Seuls les fichiers nécessaires au build : évite de rebuild pour docs/e2e/etc.
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./src
              ./resources
              ./package.json
              ./package-lock.json
              ./version.json
              ./LICENSE
              ./tsconfig.json
              ./webpack.main.config.js
              ./webpack.renderer.config.js
            ];
          };

          # Hash des dépendances npm (à régénérer à chaque changement de package-lock.json :
          # `nix run nixpkgs#prefetch-npm-deps -- package-lock.json`).
          npmDepsHash = "sha256-3QA4UgSZjJTyyb/CL0NQHsoPeasfGb3KIEHZ78uf7iE=";

          # Pas de scripts d'installation : le postinstall d'Electron télécharge un
          # binaire (refusé dans le sandbox Nix) ; better-sqlite3 est recompilé plus bas.
          npmFlags = [ "--ignore-scripts" ];

          nativeBuildInputs = [
            pkgs.python3
            pkgs.node-gyp
            pkgs.makeWrapper
            pkgs.copyDesktopItems
          ];

          buildPhase = ''
            runHook preBuild

            npm run build

            # better-sqlite3 : module natif à compiler contre les headers Electron
            # (ABI Electron ≠ ABI Node). --force_build=1 : sinon le binaire précompilé
            # pour Node est gardé et Electron plante au chargement.
            (cd node_modules/better-sqlite3 && node-gyp rebuild --release --force_build=1 --nodedir=${electron.headers})
            # better-sqlite3 préfère prebuilds/<plateforme>.node (ABI Node) à build/Release :
            # on le retire, sinon Electron charge le mauvais binaire.
            rm -rf node_modules/better-sqlite3/prebuilds

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # Ne garder que les dépendances de production (electron, webpack, … sont jetés).
            npm prune --omit=dev --ignore-scripts

            appDir=$out/share/bellepoule-modern
            mkdir -p $appDir
            cp -r dist resources node_modules package.json version.json LICENSE $appDir/

            install -Dm644 resources/icons/512x512.png \
              $out/share/icons/hicolor/512x512/apps/bellepoule-modern.png

            # Lanceur : Electron officiel de nixpkgs + dossier de l'app (main = dist/main/main.js).
            mkdir -p $out/bin
            makeWrapper ${electron}/bin/electron $out/bin/bellepoule-modern \
              --add-flags "$appDir"

            runHook postInstall
          '';

          desktopItems = [
            (pkgs.makeDesktopItem {
              name = "bellepoule-modern";
              desktopName = "BellePoule Modern";
              comment = "Gestion de tournois d'escrime";
              exec = "bellepoule-modern %U";
              icon = "bellepoule-modern";
              categories = [
                "Sports"
                "Utility"
              ];
              startupWMClass = "BellePoule Modern";
            })
          ];

          meta = {
            description = "Gestion de tournois d'escrime (poules, tableaux, scoring distant)";
            homepage = "https://github.com/klinnex/bellepoule-modern";
            license = lib.licenses.gpl3Plus;
            mainProgram = "bellepoule-modern";
            platforms = systems;
          };
        };
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          bellepoule-modern = mkBellepoule pkgs;
        in
        {
          inherit bellepoule-modern;
          default = bellepoule-modern;
        }
      );
    };
}
