/**
 * BellePoule Modern - Auto Updater
 * Système de mise à jour automatique simplifié
 * Licensed under GPL-3.0
 */
import { BrowserWindow } from 'electron';
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
    checkInterval: number;
    betaChannel: boolean;
}
export declare class AutoUpdater {
    private mainWindow;
    private config;
    private lastCheck;
    private updateInfo;
    constructor(mainWindow: BrowserWindow, config?: Partial<AutoUpdaterConfig>);
    private setupAutoCheck;
    private checkAndNotify;
    checkForUpdates(): Promise<UpdateInfo | null>;
    private fetchLatestRelease;
    private fetchLatestReleaseDirect;
    private fetchReleases;
    private fetchTags;
    private getCurrentVersion;
    private showUpdateNotification;
    private autoDownloadUpdate;
    private getPlatform;
    private findAssetForPlatform;
    showUpdateDialog(): Promise<void>;
    private showUpdateOptionsDialog;
    private downloadAndInstall;
    getUpdateInfo(): UpdateInfo | null;
    getLastCheck(): Date | null;
    isUpdateAvailable(): boolean;
}
export default AutoUpdater;
//# sourceMappingURL=autoUpdater.d.ts.map