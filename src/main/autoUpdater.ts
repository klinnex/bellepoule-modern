/**
 * BellePoule Modern - Auto Updater
 * Système de mise à jour automatique simplifié
 * Licensed under GPL-3.0
 */

import { app, dialog, shell, BrowserWindow } from 'electron';
import https from 'https';
import fs from 'fs';
import path from 'path';

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
  }>;
}

interface AutoUpdaterConfig {
  autoDownload: boolean;
  autoInstall: boolean;
  checkInterval: number; // en heures
  betaChannel: boolean;
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
      autoInstall: false, // Sécurité : ne pas installer automatiquement
      checkInterval: 24, // Vérifier chaque jour
      betaChannel: false,
      ...config
    };

    this.setupAutoCheck();
  }

  private setupAutoCheck(): void {
    // Vérifier les mises à jour au démarrage
    setTimeout(() => {
      this.checkAndNotify();
    }, 5000); // 5 secondes après démarrage

    // Vérifier périodiquement
    setInterval(() => {
      this.checkAndNotify();
    }, this.config.checkInterval * 60 * 60 * 1000);
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

      // Extraire le numéro de build depuis le nom de la release
      const buildMatch = release.name?.match(/Build #(\d+)/);
      const latestBuild = buildMatch ? parseInt(buildMatch[1]) : 0;
      
      const versionMatch = release.name?.match(/v(\d+\.\d+\.\d+)/);
      const latestVersion = versionMatch ? versionMatch[1] : currentInfo.version;
      
      const hasUpdate = latestBuild > currentInfo.build;

      this.updateInfo = {
        hasUpdate,
        currentBuild: currentInfo.build,
        latestBuild,
        latestVersion,
        downloadUrl: release.html_url || `https://github.com/klinnex/bellepoule-modern/releases/tag/v${latestVersion}`,
        releaseNotes: release.body || '',
        assets: release.assets || []
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
      // Pour le canal beta, on doit chercher manuellement dans toutes les releases
      if (this.config.betaChannel) {
        const releases = await this.fetchReleases();
        return releases && releases.length > 0 ? releases[0] : null;
      }
      
      // Pour le canal stable, utiliser l'endpoint /latest qui ne retourne que la dernière release non-prerelease
      return await this.fetchLatestReleaseDirect();
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
          assets: []
        };
      }
      return null;
    }
  }

  private async fetchLatestReleaseDirect(): Promise<any> {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/klinnex/bellepoule-modern/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': 'BellePoule-Modern',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
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
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/klinnex/bellepoule-modern/releases',
        method: 'GET',
        headers: {
          'User-Agent': 'BellePoule-Modern',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
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
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
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
      console.error('Failed to read version:', e);
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
            build: parseInt(match[2]) || 0
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
    console.log(`🚀 Mise à jour disponible: v${updateInfo.latestVersion} (Build #${updateInfo.latestBuild})`);
    
    // Notification système si disponible
    if (this.mainWindow) {
      this.mainWindow.webContents.send('update:available', updateInfo);
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
      
      if (asset) {
        console.log(`📥 Téléchargement automatique de ${asset.name}...`);
        
        // Télécharger le fichier
        const downloadPath = await this.downloadFile(asset.browser_download_url, asset.name);
        
        if (downloadPath) {
          console.log(`✅ Mise à jour téléchargée: ${downloadPath}`);
          
          // Sauvegarder les informations pour l'installation au redémarrage
          this.saveDownloadedUpdate(downloadPath, updateInfo);
          
          // Notifier l'utilisateur
          if (this.mainWindow) {
            this.mainWindow.webContents.send('update:downloaded', {
              version: updateInfo.latestVersion,
              path: downloadPath,
              installOnQuit: true,
            });
          }
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

  private async downloadFile(url: string, filename: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Sauvegarder dans le dossier temporaire
      const tempDir = require('os').tmpdir();
      const downloadPath = require('path').join(tempDir, `bellepoule-update-${filename}`);
      
      require('fs').writeFileSync(downloadPath, buffer);
      
      return downloadPath;
    } catch (error) {
      console.error('Download failed:', error);
      return null;
    }
  }

  private saveDownloadedUpdate(downloadPath: string, updateInfo: UpdateInfo): void {
    const updateData = {
      version: updateInfo.latestVersion,
      path: downloadPath,
      downloadedAt: new Date().toISOString(),
    };
    
    // Sauvegarder dans un fichier de config
    const configPath = require('path').join(require('os').tmpdir(), 'bellepoule-pending-update.json');
    require('fs').writeFileSync(configPath, JSON.stringify(updateData, null, 2));
  }

  /**
   * Vérifier s'il y a une mise à jour en attente et l'installer
   */
  checkAndInstallPendingUpdate(): void {
    try {
      const configPath = require('path').join(require('os').tmpdir(), 'bellepoule-pending-update.json');
      
      if (require('fs').existsSync(configPath)) {
        const updateData = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        
        if (require('fs').existsSync(updateData.path)) {
          console.log(`🔄 Installation de la mise à jour ${updateData.version}...`);
          
          // Lancer l'installateur
          this.launchInstaller(updateData.path);
          
          // Supprimer le fichier de config
          require('fs').unlinkSync(configPath);
        }
      }
    } catch (error) {
      console.error('Failed to install pending update:', error);
    }
  }

  private launchInstaller(installerPath: string): void {
    const { spawn } = require('child_process');
    const platform = process.platform;
    
    try {
      if (platform === 'win32') {
        // Windows: lancer le .exe
        spawn(installerPath, ['/SILENT'], {
          detached: true,
          stdio: 'ignore',
        });
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
      
      // Quitter l'application pour permettre l'installation
      setTimeout(() => {
        require('@electron/remote').app.quit();
      }, 2000);
      
    } catch (error) {
      console.error('Failed to launch installer:', error);
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
      linux: ['.AppImage', '.deb', '.rpm']
    };

    const extensions = patterns[platform as keyof typeof patterns] || [];
    return assets.find((asset: any) => 
      extensions.some(ext => asset.name.endsWith(ext))
    );
  }

  async showUpdateDialog(): Promise<void> {
    if (!this.updateInfo) {
      const updateInfo = await this.checkForUpdates();
      if (!updateInfo) {
        dialog.showMessageBox(this.mainWindow!, {
          type: 'info',
          title: 'Mises à jour',
          message: 'Aucune release disponible',
          detail: 'Aucune version publiée n\'est disponible pour le moment. Vous utilisez déjà la dernière version de développement.',
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
      buttons: [
        '📥 Télécharger maintenant',
        '🔗 Voir les releases',
        '✖️ Plus tard'
      ],
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
          detail: 'Téléchargez la version correspondant à votre système et remplacez l\'application actuelle.',
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
}

export default AutoUpdater;