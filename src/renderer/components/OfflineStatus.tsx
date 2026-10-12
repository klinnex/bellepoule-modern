/**
 * BellePoule Modern - Offline Status Component
 * UI component to display offline/sync status
 * Licensed under GPL-3.0
 */

import React, { useState, useEffect } from 'react';
import { offlineSync } from '../services/offlineSync';
import { offlineStorage } from '../services/offlineStorage';
import { SyncConflict } from '@shared/services/cloudSyncService';
import { ConflictResolutionModal } from './ConflictResolutionModal';

interface OfflineStatusProps {
  className?: string;
}

const OfflineStatus_: React.FC<OfflineStatusProps> = ({ className = '' }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    pendingActions: 0,
    conflicts: 0,
    lastSync: null as number | null,
  });
  const [showDetails, setShowDetails] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflicts] = useState<SyncConflict[]>([]);

  useEffect(() => {
    const updateStatus = async () => {
      setIsOnline(offlineSync.isCurrentlyOnline());
      setIsSyncing(offlineSync.isCurrentlySyncing());
      const status = await offlineStorage.getSyncStatus();
      setSyncStatus(status);
    };

    // Initial update
    updateStatus();

    // Set up periodic updates
    const interval = setInterval(updateStatus, 5000); // Update every 5 seconds

    // Listen for sync completion
    offlineSync.onSyncComplete(result => {
      setIsSyncing(false);
      updateStatus();
    });

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Note: We're not removing the sync callback as there's no public method for it
    };
  }, []);

  const handleConflictResolve = (_conflictId: string, _resolution: 'local' | 'remote') => {
    // Resolution logic delegated to parent via cloud sync service
  };

  const handleManualSync = async () => {
    if (!isOnline) return;

    setIsSyncing(true);
    try {
      await offlineSync.triggerSync();
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return 'Jamais';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;

    return date.toLocaleDateString('fr-FR');
  };

  const getStatusColor = () => {
    if (!isOnline) return 'bg-red-500';
    if (isSyncing) return 'bg-yellow-500';
    if (syncStatus.pendingActions > 0) return 'bg-orange-500';
    if (syncStatus.conflicts > 0) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Hors ligne';
    if (isSyncing) return 'Synchronisation...';
    if (syncStatus.pendingActions > 0) return `${syncStatus.pendingActions} en attente`;
    if (syncStatus.conflicts > 0) return `${syncStatus.conflicts} conflits`;
    return 'Connecté';
  };

  return (
    <>
      <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
        <div className="bg-white rounded-lg shadow-lg border border-gray-200 min-w-[250px]">
          {/* Status indicator */}
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
            onClick={() => setShowDetails(!showDetails)}
          >
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${getStatusColor()} ${isSyncing ? 'animate-pulse' : ''}`}
              />
              <span className="text-sm font-medium text-gray-700">{getStatusText()}</span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transform transition-transform ${showDetails ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          {/* Details panel */}
          {showDetails && (
            <div className="border-t border-gray-200 p-3 space-y-3">
              {/* Connection status */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Connexion:</span>
                <span
                  className={`text-sm font-medium ${isOnline ? 'text-green-600' : 'text-red-600'}`}
                >
                  {isOnline ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>

              {/* Last sync */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Dernière synchro:</span>
                <span className="text-sm text-gray-700">{formatLastSync(syncStatus.lastSync)}</span>
              </div>

              {/* Pending actions */}
              {syncStatus.pendingActions > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Actions en attente:</span>
                  <span className="text-sm font-medium text-orange-600">
                    {syncStatus.pendingActions}
                  </span>
                </div>
              )}

              {/* Conflicts */}
              {syncStatus.conflicts > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Conflits:</span>
                  <button
                    onClick={() => setShowConflictModal(true)}
                    className="text-sm font-medium text-red-600 underline hover:text-red-700 transition-colors"
                  >
                    Résoudre {syncStatus.conflicts} conflit{syncStatus.conflicts > 1 ? 's' : ''}
                  </button>
                </div>
              )}

              {/* Manual sync button */}
              {isOnline && !isSyncing && syncStatus.pendingActions > 0 && (
                <button
                  onClick={handleManualSync}
                  className="w-full mt-3 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                >
                  Synchroniser maintenant
                </button>
              )}

              {/* Syncing indicator */}
              {isSyncing && (
                <div className="flex items-center justify-center space-x-2 py-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-600">Synchronisation en cours...</span>
                </div>
              )}

              {/* Offline warning */}
              {!isOnline && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                  <p className="text-xs text-yellow-800">
                    <strong>Mode hors ligne:</strong> Les modifications seront synchronisées
                    automatiquement lorsque la connexion sera rétablie.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConflictResolutionModal
        conflicts={conflicts}
        onResolve={handleConflictResolve}
        onClose={() => setShowConflictModal(false)}
        isOpen={showConflictModal}
      />
    </>
  );
};
export const OfflineStatus = React.memo(OfflineStatus_);
