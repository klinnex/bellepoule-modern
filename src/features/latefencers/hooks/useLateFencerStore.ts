/**
 * BellePoule Modern - Late Fencer Management
 * Feature 24: Automatic late handling
 * Licensed under GPL-3.0
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/shallow';
import { Fencer } from '../../shared/types';

/** Intervalle de surveillance partagé, rangé sur `window` pour le nettoyage. */
type LateFencerWindow = Window & { __lateFencerInterval?: ReturnType<typeof setInterval> };

export interface LateFencer {
  fencerId: string;
  fencer: Fencer;
  checkInTime: Date;
  scheduledMatchTime: Date;
  delayMinutes: number;
  warningCount: number;
  status: 'waiting' | 'warned' | 'critical' | 'forfeit';
  notificationsSent: number;
  lastNotificationTime?: Date;
}

export interface LateManagementConfig {
  warningThresholdMinutes: number;
  criticalThresholdMinutes: number;
  forfeitThresholdMinutes: number;
  autoForfeit: boolean;
  notificationIntervalMinutes: number;
  maxNotifications: number;
}

export const DEFAULT_LATE_CONFIG: LateManagementConfig = {
  warningThresholdMinutes: 5,
  criticalThresholdMinutes: 10,
  forfeitThresholdMinutes: 15,
  autoForfeit: true,
  notificationIntervalMinutes: 3,
  maxNotifications: 3,
};

interface LateFencerState {
  lateFencers: LateFencer[];
  config: LateManagementConfig;
  isMonitoring: boolean;
}

interface LateFencerActions {
  // Registration
  registerFencer: (fencer: Fencer, scheduledMatchTime: Date) => void;
  markAsPresent: (fencerId: string) => void;

  // Monitoring
  startMonitoring: () => void;
  stopMonitoring: () => void;
  updateDelays: () => void;

  // Status management
  sendWarning: (fencerId: string) => void;
  markAsForfeit: (fencerId: string, reason?: string) => void;

  // Queries
  getLateFencers: () => LateFencer[];
  getCriticalFencers: () => LateFencer[];
  getForfeitCandidates: () => LateFencer[];
  getFencerStatus: (fencerId: string) => LateFencer | undefined;

  // Config
  updateConfig: (config: Partial<LateManagementConfig>) => void;

  // Stats
  getLateStats: () => {
    totalLate: number;
    warned: number;
    critical: number;
    forfeit: number;
    averageDelay: number;
  };
}

export const useLateFencerStore = create<LateFencerState & LateFencerActions>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          // State
          lateFencers: [],
          config: DEFAULT_LATE_CONFIG,
          isMonitoring: false,

          // Actions
          registerFencer: (fencer: Fencer, scheduledMatchTime: Date) => {
            set(state => {
              const existingIndex = state.lateFencers.findIndex(lf => lf.fencerId === fencer.id);

              const lateFencer: LateFencer = {
                fencerId: fencer.id,
                fencer,
                checkInTime: new Date(),
                scheduledMatchTime,
                delayMinutes: 0,
                warningCount: 0,
                status: 'waiting',
                notificationsSent: 0,
              };

              if (existingIndex >= 0) {
                state.lateFencers[existingIndex] = lateFencer;
              } else {
                state.lateFencers.push(lateFencer);
              }
            });
          },

          markAsPresent: (fencerId: string) => {
            set(state => {
              state.lateFencers = state.lateFencers.filter(lf => lf.fencerId !== fencerId);
            });
          },

          startMonitoring: () => {
            set({ isMonitoring: true });

            // Start interval
            const intervalId = setInterval(() => {
              get().updateDelays();
            }, 60000); // Every minute

            // Store interval ID for cleanup
            (window as LateFencerWindow).__lateFencerInterval = intervalId;
          },

          stopMonitoring: () => {
            set({ isMonitoring: false });
            const intervalId = (window as LateFencerWindow).__lateFencerInterval;
            if (intervalId) {
              clearInterval(intervalId);
            }
          },

          updateDelays: () => {
            const state = get();
            const now = new Date();
            const { config } = state;

            set(state => {
              state.lateFencers.forEach(lf => {
                if (lf.status === 'forfeit') return;

                const delayMs = now.getTime() - lf.scheduledMatchTime.getTime();
                lf.delayMinutes = Math.floor(delayMs / 60000);

                // Update status based on thresholds
                if (lf.delayMinutes >= config.forfeitThresholdMinutes) {
                  if (config.autoForfeit) {
                    lf.status = 'forfeit';
                  } else {
                    lf.status = 'critical';
                  }
                } else if (lf.delayMinutes >= config.criticalThresholdMinutes) {
                  lf.status = 'critical';
                } else if (lf.delayMinutes >= config.warningThresholdMinutes) {
                  lf.status = 'warned';
                }

                if (lf.status === 'forfeit') return;

                // Check if notification needed
                const timeSinceLastNotification = lf.lastNotificationTime
                  ? (now.getTime() - lf.lastNotificationTime.getTime()) / 60000
                  : Infinity;

                if (
                  lf.notificationsSent < config.maxNotifications &&
                  timeSinceLastNotification >= config.notificationIntervalMinutes
                ) {
                  lf.notificationsSent += 1;
                  lf.lastNotificationTime = now;
                }
              });
            });
          },

          sendWarning: (fencerId: string) => {
            set(state => {
              const lf = state.lateFencers.find(f => f.fencerId === fencerId);
              if (lf) {
                lf.warningCount += 1;
                lf.lastNotificationTime = new Date();
              }
            });
          },

          markAsForfeit: (fencerId: string, reason?: string) => {
            set(state => {
              const lf = state.lateFencers.find(f => f.fencerId === fencerId);
              if (lf) {
                lf.status = 'forfeit';
                // Here you would trigger the actual forfeit logic
                // e.g., update fencer status, mark matches as forfeit
              }
            });
          },

          getLateFencers: () => {
            return get().lateFencers.filter(
              lf => lf.delayMinutes >= get().config.warningThresholdMinutes
            );
          },

          getCriticalFencers: () => {
            return get().lateFencers.filter(
              lf => lf.delayMinutes >= get().config.criticalThresholdMinutes
            );
          },

          getForfeitCandidates: () => {
            return get().lateFencers.filter(
              lf => lf.delayMinutes >= get().config.forfeitThresholdMinutes
            );
          },

          getFencerStatus: (fencerId: string) => {
            return get().lateFencers.find(lf => lf.fencerId === fencerId);
          },

          updateConfig: (config: Partial<LateManagementConfig>) => {
            set(state => {
              Object.assign(state.config, config);
            });
          },

          getLateStats: () => {
            const lateFencers = get().lateFencers;
            const warned = lateFencers.filter(lf => lf.status === 'warned').length;
            const critical = lateFencers.filter(lf => lf.status === 'critical').length;
            const forfeit = lateFencers.filter(lf => lf.status === 'forfeit').length;

            const averageDelay =
              lateFencers.length > 0
                ? lateFencers.reduce((sum, lf) => sum + lf.delayMinutes, 0) / lateFencers.length
                : 0;

            return {
              totalLate: lateFencers.length,
              warned,
              critical,
              forfeit,
              averageDelay: Math.round(averageDelay),
            };
          },
        }),
        {
          name: 'late-fencer-store',
          partialize: state => ({
            lateFencers: state.lateFencers,
            config: state.config,
          }),
        }
      )
    ),
    { name: 'LateFencerStore' }
  )
);

// ── Selector hooks ───────────────────────────────────────────────────────────
export const useLateFencers = () => useLateFencerStore(useShallow(s => s.lateFencers));
export const useLateFencerConfig = () => useLateFencerStore(s => s.config);
export const useIsMonitoring = () => useLateFencerStore(s => s.isMonitoring);
export const useLateFencerActions = () =>
  useLateFencerStore(
    useShallow(s => ({
      registerFencer: s.registerFencer,
      markAsPresent: s.markAsPresent,
      startMonitoring: s.startMonitoring,
      stopMonitoring: s.stopMonitoring,
      sendWarning: s.sendWarning,
      markAsForfeit: s.markAsForfeit,
      updateConfig: s.updateConfig,
    }))
  );

export default useLateFencerStore;
