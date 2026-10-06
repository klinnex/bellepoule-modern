/**
 * BellePoule Modern - Auto Updater
 * Système de mise à jour automatique simplifié
 * Licensed under GPL-3.0
 */

import { app, dialog, shell, BrowserWindow } from 'electron';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseSha256Digest, isTrustedDownloadUrl, verifyFileSha256 } from './updateIntegrity';

interface UpdateInfo {
  hasUpdate: boolean;
  currentBuild: number;
  latestBuild: number;
  latestVersion: string;
  downloadUrl: string;
  releaseNotes: string;
  assets: Array<{
    name: string;
    url: string;
    size: number;
    browser_download_url?: string;
    digest?: string | null; // "sha256:<hex>" fourni par l'API GitHub
  }>;
}

interface AutoUpdaterConfig {
  autoDownload: boolean;
  autoInstall: boolean; // Installer automatiquement au redémarrage sans demander
  checkInterval: number; // en heures
  betaChannel: boolean;
  silent: boolean; // Mode silencieux - aucune interaction utilisateur
  installOnQuit: boolean; // Installer automatiquement quand l'utilisateur quitte
}

export class AutoUpdater {
  private mainWindow: BrowserWindow;
  private config: AutoUpdaterConfig;
  private lastCheck: Date | null = null;
  private updateInfo: UpdateInfo | null = null;

  constructor(mainWindow: BrowserWindow, config: Partial<AutoUpdaterConfig> = {}) {
    this.mainWindow = mainWindow;
    this.config = {
      autoDownload: true,
      autoInstall: false,
      checkInterval: 24, // Vérifier chaque jour
      betaChannel: false,
      silent: false,
      installOnQuit: false,
      ...config,
    };

    this.setupAutoCheck();
  }

  private setupAutoCheck(): void {
    // Vérifier les mises à jour au démarrage
    setTimeout(() => {
      this.checkAndNotify();
    }, 5000); // 5 secondes après démarrage

    // Vérifier périodiquement
    setInterval(
      () => {
        this.checkAndNotify();
      },
      this.config.checkInterval * 60 * 60 * 1000
    );
  }

  private async checkAndNotify(): Promise<void> {
    try {
      const updateInfo = await this.checkForUpdates();
      if (updateInfo?.hasUpdate) {
        this.showUpdateNotification(updateInfo);
      }
    } catch (error) {
      console.error('Auto-update check failed:', error);
    }
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const currentInfo = this.getCurrentVersion();
      const release = await this.fetchLatestRelease();

      if (!release) return null;

      // Extraire le numéro de build depuis plusieurs sources possibles
      let latestBuild = 0;
      const buildPatterns = [/Build #(\d+)/i, /build\.(\d+)/i, /#(\d+)/, /(\d+)(?:-|$)/];

      // Chercher dans le nom de la release
      for (const pattern of buildPatterns) {
        const match = release.name?.match(pattern);
        if (match) {
          const parsed = parseInt(match[1]);
          if (parsed > latestBuild) {
            latestBuild = parsed;
          }
        }
      }

      // Si pas trouvé, chercher dans le tag_name
      if (latestBuild === 0 && release.tag_name) {
        for (const pattern of buildPatterns) {
          const match = release.tag_name.match(pattern);
          if (match) {
            const parsed = parseInt(match[1]);
            if (parsed > latestBuild) {
              latestBuild = parsed;
            }
          }
        }
      }

      // Si toujours pas trouvé, chercher dans le body
      if (latestBuild === 0 && release.body) {
        for (const pattern of buildPatterns) {
          const match = release.body.match(pattern);
          if (match) {
            const parsed = parseInt(match[1]);
            if (parsed > latestBuild) {
              latestBuild = parsed;
            }
          }
        }
      }

      // Extraire la version depuis le tag_name ou le nom
      let latestVersion = currentInfo.version;
      const versionPattern = /v?(\d+\.\d+\.\d+)/;
      const versionMatch =
        release.tag_name?.match(versionPattern) || release.name?.match(versionPattern);
      if (versionMatch) {
        latestVersion = versionMatch[1];
      }

      // Comparer les builds - aussi considérer si c'est une prerelease
      const isNewerBuild = latestBuild > currentInfo.build;
      const hasUpdate = isNewerBuild || (release.prerelease && this.config.betaChannel);

      this.updateInfo = {
        hasUpdate,
        currentBuild: currentInfo.build,
        latestBuild,
        latestVersion,
        downloadUrl:
          release.html_url ||
          `https://github.com/klinnex/bellepoule-modern/releases/tag/v${latestVersion}`,
        releaseNotes: release.body || '',
        assets: release.assets || [],
      };

      this.lastCheck = new Date();
      return this.updateInfo;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return null;
    }
  }

  private async fetchLatestRelease(): Promise<any> {
    try {
      // Toujours récupérer toutes les releases pour trouver la plus récente (y compris dev/beta)
      const releases = await this.fetchReleases();

      if (!releases || releases.length === 0) {
        // Fallback sur /latest si aucune release trouvée
        return await this.fetchLatestReleaseDirect();
      }

      // Si betaChannel est false, filtrer pour ne garder que les releases non-prerelease
      // Mais si on est sur une version dev/beta, on veut quand même voir les更新
      const filteredReleases = this.config.betaChannel
        ? releases
        : releases.filter((r: any) => !r.prerelease);

      if (filteredReleases.length > 0) {
        return filteredReleases[0];
      }

      // Si aucune release stable, retourner la première release (dev)
      return releases[0];
    } catch (error) {
      console.error('Failed to fetch release:', error);
      // En cas d'erreur, essayer avec les tags comme fallback
      const tags = await this.fetchTags();
      if (tags && tags.length > 0) {
        const latestTag = tags[0];
        return {
          name: latestTag.name,
          tag_name: latestTag.name,
          html_url: `https://github.com/klinnex/bellepoule-modern/releases/tag/${latestTag.name}`,
          body: `Release: ${latestTag.name}`,
          prerelease: false,
          assets: [],
        };
      }
      return null;
    }
  }

  private async fetchLatestReleaseDirect(): Promise<any> {
    return new Promise(resolve => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/klinnex/bellepoule-modern/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': 'BellePoule-Modern',
          Accept: 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const release = JSON.parse(data);
              resolve(release);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve(null);
      });

      req.end();
    });
  }

  private async fetchReleases(): Promise<any[]> {
    return new Promise(resolve => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/klinnex/bellepoule-modern/releases',
        method: 'GET',
        headers: {
          'User-Agent': 'BellePoule-Modern',
          Accept: 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const releases = JSON.parse(data);
              resolve(releases);
            } else {
              resolve([]);
            }
          } catch (e) {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve([]);
      });

      req.end();
    });
  }

  private async fetchTags(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/klinnex/bellepoule-modern/tags',
        method: 'GET',
        headers: {
          'User-Agent': 'BellePoule-Modern',
          Accept: 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const tags = JSON.parse(data);
              resolve(tags);
            } else {
              resolve([]);
            }
          } catch (e) {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.setTimeout(10000, () => {
        req.destroy();
        resolve([]);
      });

      req.end();
    });
  }

  private getCurrentVersion(): { version: string; build: number } {
    try {
      const versionPaths = [
        path.join(app.getAppPath(), 'version.json'),
        path.join(process.cwd(), 'version.json'),
      ];

      for (const versionPath of versionPaths) {
        if (fs.existsSync(versionPath)) {
          const content = fs.readFileSync(versionPath, 'utf-8');
          return JSON.parse(content);
        }
      }
    } catch (e) {
      console.error('Failed to read version:', e instanceof Error ? e.message : e);
    }

    // Fallback depuis package.json
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const match = pkg.version.match(/(\d+\.\d+\.\d+)(?:-build\.(\d+))?/);
        if (match) {
          return {
            version: match[1],
            build: parseInt(match[2]) || 0,
          };
        }
      }
    } catch (e) {
      console.error('Failed to read package.json:', e instanceof Error ? e.message : e);
    }

    // Fallback depuis package.json
    try {
      const pkgPath = path.join(app.getAppPath(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const match = pkg.version.match(/(\d+\.\d+\.\d+)(?:-build\.(\d+))?/);
        if (match) {
          return {
            version: match[1],
            build: parseInt(match[2]) || 0,
          };
        }
      }
    } catch (e) {
      console.error('Failed to read package.json:', e);
    }

    return { version: '1.0.0', build: 0 };
  }

  private showUpdateNotification(updateInfo: UpdateInfo): void {
    // Notification discrète dans la console
    console.log(
      `🚀 Mise à jour disponible: v${updateInfo.latestVersion} (Build #${updateInfo.latestBuild})`
    );

    // En mode silencieux, ne pas afficher de notification visuelle
    if (this.config.silent) {
      console.log('[AutoUpdater] Mode silencieux - pas de notification visuelle');
    } else {
      // Notification système si disponible
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update:available', updateInfo);
      }
    }

    // Si autoDownload est activé, télécharger automatiquement
    if (this.config.autoDownload) {
      this.autoDownloadUpdate(updateInfo);
    }
  }

  private async autoDownloadUpdate(updateInfo: UpdateInfo): Promise<void> {
    try {
      const platform = this.getPlatform();
      const asset = this.findAssetForPlatform(updateInfo.assets, platform);

      if (!asset) {
        console.log('No suitable asset found for current platform');
        return;
      }

      // Intégrité : exiger une URL GitHub HTTPS et un SHA-256 publié par GitHub
      const expectedSha256 = parseSha256Digest(asset.digest);
      if (!isTrustedDownloadUrl(asset.browser_download_url) || !expectedSha256) {
        console.warn(
          `[AutoUpdater] Téléchargement automatique ignoré : ${asset.name} sans URL de confiance ou empreinte SHA-256`
        );
        return;
      }

      console.log(
        `📥 Téléchargement automatique de ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)...`
      );

      // Notifier le début du téléchargement
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update:download-started', {
          version: updateInfo.latestVersion,
          size: asset.size,
        });
      }

      // Télécharger le fichier avec suivi de progression
      const downloadPath = await this.downloadFile(
        asset.browser_download_url,
        asset.name,
        (downloaded, total) => {
          const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          if (this.mainWindow && progress % 10 === 0) {
            // Envoyer tous les 10%
            this.mainWindow.webContents.send('update:progress', { progress, downloaded, total });
          }
        }
      );

      if (downloadPath) {
        if (!(await verifyFileSha256(downloadPath, expectedSha256))) {
          fs.unlinkSync(downloadPath);
          throw new Error(`Empreinte SHA-256 invalide pour ${asset.name}`);
        }
        console.log(`✅ Mise à jour téléchargée et vérifiée: ${downloadPath}`);

        // Sauvegarder les informations pour l'installation au redémarrage
        this.saveDownloadedUpdate(downloadPath, updateInfo, expectedSha256);

        // Notifier l'utilisateur
        if (this.mainWindow) {
          this.mainWindow.webContents.send('update:downloaded', {
            version: updateInfo.latestVersion,
            path: downloadPath,
            installOnQuit: true,
          });
        }

        // Sur Windows, proposer d'installer immédiatement (sauf en mode silencieux)
        if (platform === 'windows' && !this.config.silent) {
          this.promptForImmediateInstall(updateInfo, downloadPath, expectedSha256);
        } else if (platform === 'windows' && this.config.silent) {
          console.log(
            '[AutoUpdater] Mode silencieux - installation différée au prochain redémarrage'
          );
        }
      }
    } catch (error) {
      console.error('❌ Auto download failed:', error);
      if (this.mainWindow) {
        this.mainWindow.webContents.send('update:error', {
          message: 'Échec du téléchargement automatique',
          error: String(error),
        });
      }
    }
  }

  private promptForImmediateInstall(
    updateInfo: UpdateInfo,
    downloadPath: string,
    expectedSha256: string
  ): void {
    if (!this.mainWindow) return;

    const response = dialog.showMessageBoxSync(this.mainWindow, {
      type: 'question',
      title: 'Mise à jour prête',
      message: `BellePoule v${updateInfo.latestVersion} a été téléchargé`,
      detail: "Voulez-vous installer la mise à jour maintenant ? L'application va redémarrer.",
      buttons: ['Installer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      this.launchVerifiedInstaller(downloadPath, expectedSha256);
    }
  }

  private async downloadFile(
    url: string,
    filename: string,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!isTrustedDownloadUrl(url)) {
        reject(new Error(`URL de téléchargement non autorisée: ${url}`));
        return;
      }

      const tempDir = os.tmpdir();
      const downloadPath = path.join(tempDir, `bellepoule-update-${filename}`);

      // Supprimer l'ancien fichier s'il existe
      if (fs.existsSync(downloadPath)) {
        try {
          fs.unlinkSync(downloadPath);
        } catch (e) {
          console.warn('Could not remove old update file:', e);
        }
      }

      const file = fs.createWriteStream(downloadPath);
      let downloadedBytes = 0;
      let totalBytes = 0;

      const request = https.get(url, { timeout: 30000 }, (response: any) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          // Redirection - suivre le lien
          file.close();
          resolve(this.downloadFile(response.headers.location, filename, onProgress));
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(downloadPath);
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress(downloadedBytes, totalBytes);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          // Vérifier la taille du fichier téléchargé
          const stats = fs.statSync(downloadPath);
          if (totalBytes > 0 && stats.size !== totalBytes) {
            fs.unlinkSync(downloadPath);
            reject(new Error('Download incomplete - size mismatch'));
            return;
          }
          console.log(`✅ Download completed: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          resolve(downloadPath);
        });
      });

      request.on('error', (err: Error) => {
        file.close();
        if (fs.existsSync(downloadPath)) {
          fs.unlinkSync(downloadPath);
        }
        reject(err);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        if (fs.existsSync(downloadPath)) {
          fs.unlinkSync(downloadPath);
        }
        reject(new Error('Download timeout'));
      });

      request.setTimeout(30000);
    });
  }

  private saveDownloadedUpdate(downloadPath: string, updateInfo: UpdateInfo, sha256: string): void {
    const updateData = {
      version: updateInfo.latestVersion,
      path: downloadPath,
      sha256,
      downloadedAt: new Date().toISOString(),
    };

    // Sauvegarder dans un fichier de config
    const configPath = path.join(os.tmpdir(), 'bellepoule-pending-update.json');
    fs.writeFileSync(configPath, JSON.stringify(updateData, null, 2));
  }

  /**
   * Vérifier s'il y a une mise à jour en attente et l'installer
   */
  async checkAndInstallPendingUpdate(): Promise<void> {
    try {
      const configPath = path.join(os.tmpdir(), 'bellepoule-pending-update.json');

      if (fs.existsSync(configPath)) {
        const updateData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Supprimer le fichier de config (usage unique)
        fs.unlinkSync(configPath);

        if (fs.existsSync(updateData.path)) {
          console.log(`🔄 Installation de la mise à jour ${updateData.version}...`);
          await this.launchVerifiedInstaller(updateData.path, updateData.sha256);
        }
      }
    } catch (error) {
      console.error('Failed to install pending update:', error);
    }
  }

  /**
   * Revérifier l'empreinte SHA-256 juste avant le lancement
   * (le fichier réside dans un dossier temporaire modifiable).
   */
  private async launchVerifiedInstaller(installerPath: string, sha256: unknown): Promise<void> {
    const valid =
      typeof sha256 === 'string' &&
      (await verifyFileSha256(installerPath, sha256).catch(() => false));

    if (!valid) {
      console.error(`[AutoUpdater] Installeur rejeté (intégrité non vérifiée): ${installerPath}`);
      try {
        fs.unlinkSync(installerPath);
      } catch {
        // ignore
      }
      dialog.showErrorBox(
        "Erreur d'installation",
        "L'intégrité de la mise à jour n'a pas pu être vérifiée. Installation annulée."
      );
      return;
    }

    this.launchInstaller(installerPath);
  }

  private launchInstaller(installerPath: string): void {
    const { spawn } = require('child_process');
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        // Vérifier que c'est bien un fichier .exe valide
        if (!installerPath.endsWith('.exe')) {
          console.error('Invalid Windows installer format');
          return;
        }

        // Windows: lancer le .exe avec options optimisées
        // /VERYSILENT = aucune interface utilisateur
        // /NORESTART = ne pas redémarrer automatiquement
        // /CLOSEAPPLICATIONS = fermer l'app en cours
        // /MERGETASKS = conserver les paramètres existants
        const installer = spawn(
          installerPath,
          ['/VERYSILENT', '/NORESTART', '/CLOSEAPPLICATIONS', '/MERGETASKS=!desktopicon'],
          {
            detached: true,
            stdio: 'ignore',
            windowsHide: true, // Cacher la fenêtre console
          }
        );

        // Gestion des erreurs du processus
        installer.on('error', (err: Error) => {
          console.error('Installer launch error:', err);
          dialog.showErrorBox(
            "Erreur d'installation",
            "Impossible de lancer l'installateur. Veuillez installer manuellement."
          );
        });

        // Attendre que l'installateur démarre avant de quitter
        installer.on('spawn', () => {
          console.log('✅ Installateur Windows lancé');
          // Attendre 3 secondes pour que l'installateur prenne le relais
          setTimeout(() => {
            app.quit();
          }, 3000);
        });

        return; // Quitter la fonction ici pour éviter le double timeout
      } else if (platform === 'darwin') {
        // macOS: ouvrir le .dmg
        spawn('open', [installerPath], {
          detached: true,
          stdio: 'ignore',
        });
      } else if (platform === 'linux') {
        // Linux: rendre exécutable et lancer
        require('fs').chmodSync(installerPath, '755');
        spawn(installerPath, [], {
          detached: true,
          stdio: 'ignore',
        });
      }

      // Quitter l'application pour permettre l'installation (macOS/Linux uniquement)
      setTimeout(() => {
        app.quit();
      }, 2000);
    } catch (error) {
      console.error('Failed to launch installer:', error);
      dialog.showErrorBox(
        "Erreur d'installation",
        "Une erreur est survenue lors du lancement de l'installateur."
      );
    }
  }

  private getPlatform(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'macos';
    if (platform === 'linux') return 'linux';

    return 'unknown';
  }

  private findAssetForPlatform(assets: any[], platform: string): any {
    const patterns = {
      windows: ['.exe'],
      macos: ['.dmg'],
      linux: ['.AppImage', '.deb', '.rpm'],
    };

    const extensions = patterns[platform as keyof typeof patterns] || [];
    return assets.find((asset: any) => extensions.some(ext => asset.name.endsWith(ext)));
  }

  async showUpdateDialog(): Promise<void> {
    if (!this.updateInfo) {
      const updateInfo = await this.checkForUpdates();
      if (!updateInfo) {
        dialog.showMessageBox(this.mainWindow!, {
          type: 'info',
          title: 'Mises à jour',
          message: 'Aucune release disponible',
          detail:
            "Aucune version publiée n'est disponible pour le moment. Vous utilisez déjà la dernière version de développement.",
          buttons: ['OK'],
        });
        return;
      }
    }

    if (this.updateInfo && this.updateInfo.hasUpdate) {
      this.showUpdateOptionsDialog();
    } else {
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Mises à jour',
        message: '🎉 Vous utilisez la dernière version !',
        detail: `Version actuelle : v${this.getCurrentVersion().version} (Build #${this.getCurrentVersion().build})`,
        buttons: ['OK'],
      });
    }
  }

  private showUpdateOptionsDialog(): void {
    if (!this.updateInfo || !this.mainWindow) return;

    const response = dialog.showMessageBoxSync(this.mainWindow!, {
      type: 'info',
      title: '🚀 Mise à jour disponible',
      message: `Une nouvelle version est disponible !`,
      detail: `Version actuelle : Build #${this.updateInfo.currentBuild}\nNouvelle version : Build #${this.updateInfo.latestBuild} (v${this.updateInfo.latestVersion})\n\n${this.updateInfo.releaseNotes ? '\nNotes de version:\n' + this.updateInfo.releaseNotes.substring(0, 200) + '...' : ''}`,
      buttons: ['📥 Télécharger maintenant', '🔗 Voir les releases', '✖️ Plus tard'],
      defaultId: 0,
      cancelId: 2,
    });

    switch (response) {
      case 0: // Télécharger
        this.downloadAndInstall();
        break;
      case 1: // Voir les releases
        shell.openExternal('https://github.com/klinnex/bellepoule-modern/releases/latest');
        break;
      case 2: // Plus tard
        // Rappeler plus tard
        break;
    }
  }

  private async downloadAndInstall(): Promise<void> {
    try {
      const platform = this.getPlatform();
      const asset = this.findAssetForPlatform(this.updateInfo!.assets, platform);

      // Construire l'URL direct vers la release spécifique
      let downloadUrl: string;
      if (this.updateInfo!.latestVersion && this.updateInfo!.latestBuild) {
        downloadUrl = `https://github.com/klinnex/bellepoule-modern/releases/tag/v${this.updateInfo!.latestVersion}-build.${this.updateInfo!.latestBuild}`;
      } else {
        downloadUrl = 'https://github.com/klinnex/bellepoule-modern/releases/latest';
      }

      if (asset) {
        // Ouvrir la page de la release spécifique
        shell.openExternal(downloadUrl);

        dialog.showMessageBox(this.mainWindow!, {
          type: 'info',
          title: '📥 Téléchargement',
          message: 'Redirection vers la page de téléchargement...',
          detail:
            "Téléchargez la version correspondant à votre système et remplacez l'application actuelle.",
          buttons: ['OK'],
        });
      } else {
        shell.openExternal(downloadUrl);
      }
    } catch (error) {
      console.error('Download failed:', error);
      shell.openExternal('https://github.com/klinnex/bellepoule-modern/releases/latest');
    }
  }

  // API publique
  getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo;
  }

  getLastCheck(): Date | null {
    return this.lastCheck;
  }

  isUpdateAvailable(): boolean {
    return this.updateInfo?.hasUpdate || false;
  }

  /**
   * Activer/désactiver le mode silencieux
   * En mode silencieux, les mises à jour se font automatiquement sans interaction utilisateur
   */
  setSilentMode(enabled: boolean): void {
    this.config.silent = enabled;
    this.config.autoDownload = enabled;
    this.config.installOnQuit = enabled;
    console.log(`[AutoUpdater] Mode silencieux ${enabled ? 'activé' : 'désactivé'}`);
  }

  isSilentMode(): boolean {
    return this.config.silent;
  }

  /**
   * Vérifier s'il y a une mise à jour téléchargée en attente d'installation
   */
  hasPendingUpdate(): boolean {
    try {
      const configPath = require('path').join(
        require('os').tmpdir(),
        'bellepoule-pending-update.json'
      );

      if (require('fs').existsSync(configPath)) {
        const updateData = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        return require('fs').existsSync(updateData.path);
      }
    } catch (error) {
      console.error('Failed to check pending update:', error);
    }
    return false;
  }

  /**
   * Récupérer les informations de la mise à jour en attente
   */
  getPendingUpdateInfo(): { version: string; path: string } | null {
    try {
      const configPath = require('path').join(
        require('os').tmpdir(),
        'bellepoule-pending-update.json'
      );

      if (require('fs').existsSync(configPath)) {
        const updateData = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        if (require('fs').existsSync(updateData.path)) {
          return {
            version: updateData.version,
            path: updateData.path,
          };
        }
      }
    } catch (error) {
      console.error('Failed to get pending update info:', error);
    }
    return null;
  }
}

export default AutoUpdater;
