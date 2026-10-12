/**
 * BellePoule Modern - Conflict Resolution Modal
 * Licensed under GPL-3.0
 */

import React from 'react';
import { SyncConflict } from '@shared/services/cloudSyncService';

interface ConflictResolutionModalProps {
  conflicts: SyncConflict[];
  onResolve: (conflictId: string, resolution: 'local' | 'remote') => void;
  onClose: () => void;
  isOpen: boolean;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflicts,
  onResolve,
  onClose,
  isOpen,
}) => {
  if (!isOpen) return null;

  const typeLabel: Record<SyncConflict['type'], string> = {
    competition: 'Compétition',
    fencer: 'Tireur',
    match: 'Match',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Conflits de synchronisation ({conflicts.length})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {conflicts.map(conflict => (
            <div key={conflict.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">
                  {typeLabel[conflict.type]} —{' '}
                  <span className="font-mono text-xs text-gray-500">{conflict.id}</span>
                </span>
                <span className="text-xs text-gray-400">
                  {conflict.timestamp.toLocaleString('fr-FR')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Local</p>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                    {JSON.stringify(conflict.localData, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Distant</p>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                    {JSON.stringify(conflict.remoteData, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onResolve(conflict.id, 'local')}
                  className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                >
                  Garder local
                </button>
                <button
                  onClick={() => onResolve(conflict.id, 'remote')}
                  className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors"
                >
                  Garder distant
                </button>
              </div>
            </div>
          ))}

          {conflicts.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">Aucun conflit à résoudre.</p>
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ConflictResolutionModal);
