"use strict";
/**
 * BellePoule Modern - Auto Updater
 * Système de mise à jour automatique simplifié
 * Licensed under GPL-3.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoUpdater = void 0;
const electron_1 = require("electron");
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class AutoUpdater {
    constructor(mainWindow, config = {}) {
        this.lastCheck = null;
        this.updateInfo = null;
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
    setupAutoCheck() {
        // Vérifier les mises à jour au démarrage
        setTimeout(() => {
            this.checkAndNotify();
        }, 5000); // 5 secondes après démarrage
        // Vérifier périodiquement
        setInterval(() => {
            this.checkAndNotify();
        }, this.config.checkInterval * 60 * 60 * 1000);
    }
    async checkAndNotify() {
        try {
            const updateInfo = await this.checkForUpdates();
            if (updateInfo?.hasUpdate) {
                this.showUpdateNotification(updateInfo);
            }
        }
        catch (error) {
            console.error('Auto-update check failed:', error);
        }
    }
    async checkForUpdates() {
        try {
            const currentInfo = this.getCurrentVersion();
            const release = await this.fetchLatestRelease();
            if (!release)
                return null;
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
        }
        catch (error) {
            console.error('Failed to check for updates:', error);
            return null;
        }
    }
    async fetchLatestRelease() {
        try {
            // Pour le canal beta, on doit chercher manuellement dans toutes les releases
            if (this.config.betaChannel) {
                const releases = await this.fetchReleases();
                return releases && releases.length > 0 ? releases[0] : null;
            }
            // Pour le canal stable, utiliser l'endpoint /latest qui ne retourne que la dernière release non-prerelease
            return await this.fetchLatestReleaseDirect();
        }
        catch (error) {
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
    async fetchLatestReleaseDirect() {
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
            const req = https_1.default.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const release = JSON.parse(data);
                            resolve(release);
                        }
                        else {
                            resolve(null);
                        }
                    }
                    catch (e) {
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
    async fetchReleases() {
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
            const req = https_1.default.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const releases = JSON.parse(data);
                            resolve(releases);
                        }
                        else {
                            resolve([]);
                        }
                    }
                    catch (e) {
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
    async fetchTags() {
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
            const req = https_1.default.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const tags = JSON.parse(data);
                            resolve(tags);
                        }
                        else {
                            resolve([]);
                        }
                    }
                    catch (e) {
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
    getCurrentVersion() {
        try {
            const versionPaths = [
                path_1.default.join(electron_1.app.getAppPath(), 'version.json'),
                path_1.default.join(process.cwd(), 'version.json'),
            ];
            for (const versionPath of versionPaths) {
                if (fs_1.default.existsSync(versionPath)) {
                    const content = fs_1.default.readFileSync(versionPath, 'utf-8');
                    return JSON.parse(content);
                }
            }
        }
        catch (e) {
            console.error('Failed to read version:', e);
        }
        // Fallback depuis package.json
        try {
            const pkgPath = path_1.default.join(electron_1.app.getAppPath(), 'package.json');
            if (fs_1.default.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs_1.default.readFileSync(pkgPath, 'utf-8'));
                const match = pkg.version.match(/(\d+\.\d+\.\d+)(?:-build\.(\d+))?/);
                if (match) {
                    return {
                        version: match[1],
                        build: parseInt(match[2]) || 0
                    };
                }
            }
        }
        catch (e) {
            console.error('Failed to read package.json:', e);
        }
        return { version: '1.0.0', build: 0 };
    }
    showUpdateNotification(updateInfo) {
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
    async autoDownloadUpdate(updateInfo) {
        try {
            const platform = this.getPlatform();
            const asset = this.findAssetForPlatform(updateInfo.assets, platform);
            if (asset) {
                console.log(`📥 Téléchargement automatique de ${asset.name}...`);
                // TODO: Implémenter le téléchargement automatique
                // Pour l'instant, on notifie juste l'utilisateur
            }
        }
        catch (error) {
            console.error('Auto download failed:', error);
        }
    }
    getPlatform() {
        const platform = process.platform;
        const arch = process.arch;
        if (platform === 'win32')
            return 'windows';
        if (platform === 'darwin')
            return 'macos';
        if (platform === 'linux')
            return 'linux';
        return 'unknown';
    }
    findAssetForPlatform(assets, platform) {
        const patterns = {
            windows: ['.exe'],
            macos: ['.dmg'],
            linux: ['.AppImage', '.deb', '.rpm']
        };
        const extensions = patterns[platform] || [];
        return assets.find((asset) => extensions.some(ext => asset.name.endsWith(ext)));
    }
    async showUpdateDialog() {
        if (!this.updateInfo) {
            const updateInfo = await this.checkForUpdates();
            if (!updateInfo) {
                electron_1.dialog.showMessageBox(this.mainWindow, {
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
        }
        else {
            electron_1.dialog.showMessageBox(this.mainWindow, {
                type: 'info',
                title: 'Mises à jour',
                message: '🎉 Vous utilisez la dernière version !',
                detail: `Version actuelle : v${this.getCurrentVersion().version} (Build #${this.getCurrentVersion().build})`,
                buttons: ['OK'],
            });
        }
    }
    showUpdateOptionsDialog() {
        if (!this.updateInfo || !this.mainWindow)
            return;
        const response = electron_1.dialog.showMessageBoxSync(this.mainWindow, {
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
                electron_1.shell.openExternal('https://github.com/klinnex/bellepoule-modern/releases/latest');
                break;
            case 2: // Plus tard
                // Rappeler plus tard
                break;
        }
    }
    async downloadAndInstall() {
        try {
            const platform = this.getPlatform();
            const asset = this.findAssetForPlatform(this.updateInfo.assets, platform);
            // Construire l'URL direct vers la release spécifique
            let downloadUrl;
            if (this.updateInfo.latestVersion && this.updateInfo.latestBuild) {
                downloadUrl = `https://github.com/klinnex/bellepoule-modern/releases/tag/v${this.updateInfo.latestVersion}-build.${this.updateInfo.latestBuild}`;
            }
            else {
                downloadUrl = 'https://github.com/klinnex/bellepoule-modern/releases';
            }
            if (asset) {
                // Ouvrir la page de la release spécifique
                electron_1.shell.openExternal(downloadUrl);
                electron_1.dialog.showMessageBox(this.mainWindow, {
                    type: 'info',
                    title: '📥 Téléchargement',
                    message: 'Redirection vers la page de téléchargement...',
                    detail: 'Téléchargez la version correspondant à votre système et remplacez l\'application actuelle.',
                    buttons: ['OK'],
                });
            }
            else {
                electron_1.shell.openExternal(downloadUrl);
            }
        }
        catch (error) {
            console.error('Download failed:', error);
            electron_1.shell.openExternal('https://github.com/klinnex/bellepoule-modern/releases');
        }
    }
    // API publique
    getUpdateInfo() {
        return this.updateInfo;
    }
    getLastCheck() {
        return this.lastCheck;
    }
    isUpdateAvailable() {
        return this.updateInfo?.hasUpdate || false;
    }
}
exports.AutoUpdater = AutoUpdater;
exports.default = AutoUpdater;
//# sourceMappingURL=autoUpdater.js.map