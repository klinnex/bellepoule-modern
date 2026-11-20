/**
 * BellePoule Modern - Mode entraînement et démo autonome depuis l'accueil (#1897)
 * Extrait d'App.tsx : serveur d'entraînement, session, panneau et fenêtres de lancement.
 * Licensed under GPL-3.0
 */

import { useCallback, useState } from 'react';
import type { Weapon } from '../../shared/types';
import type { TrainingCustomRules } from '../../shared/types/training';
import type { ToastType } from '../components/Toast';
import { ipcErrorText } from '../services/ipcError';
import { useTranslation } from './useTranslation';

/** Pistes ouvertes par la démo autonome */
export const DEMO_STRIPS = 2;

export function useTrainingSession(showToast: (message: string, type?: ToastType) => void) {
  const { t } = useTranslation();
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [trainingActive, setTrainingActive] = useState(false);
  const [showTrainingPanel, setShowTrainingPanel] = useState(false);
  const [trainingServerUrl, setTrainingServerUrl] = useState('');
  const [trainingStrips, setTrainingStrips] = useState(1);
  const [trainingWeapon, setTrainingWeapon] = useState('');
  const [trainingLaunching, setTrainingLaunching] = useState(false);

  const handleLaunchTraining = useCallback(
    async (
      weapon: string,
      strips: number,
      customRules?: TrainingCustomRules,
      host?: string
    ): Promise<boolean> => {
      if (!window.electronAPI?.training) return false;
      setTrainingLaunching(true);
      try {
        const startRes = await window.electronAPI.training.startServer(undefined, host);
        if (!startRes.success || !startRes.serverInfo) {
          showToast(ipcErrorText(t, startRes, 'Impossible de démarrer le serveur'), 'error');
          return false;
        }
        const sessionRes = await window.electronAPI.training.startSession(
          strips,
          weapon,
          customRules
        );
        if (!sessionRes.success) {
          await window.electronAPI.training.stopServer();
          showToast(ipcErrorText(t, sessionRes, 'Impossible de démarrer la session'), 'error');
          return false;
        }
        setTrainingServerUrl(startRes.serverInfo.url);
        setTrainingStrips(strips);
        setTrainingWeapon(weapon);
        setTrainingActive(true);
        setShowTrainingPanel(true);
        setShowTrainingModal(false);
        return true;
      } catch {
        showToast("Erreur lors du lancement de l'entraînement", 'error');
        return false;
      } finally {
        setTrainingLaunching(false);
      }
    },
    [showToast, t]
  );

  const handleStartDemo = useCallback(() => {
    if (window.electronAPI?.training) setShowDemoModal(true);
  }, []);

  // Démo autonome : entraînement en mode démo (arbitre virtuel) + écrans distants ouverts.
  // Toujours proposer l'arme, même si un entraînement / une démo tourne déjà (relancé au choix)
  const handleLaunchDemo = useCallback(
    async (weapon: Weapon) => {
      const training = window.electronAPI?.training;
      if (!training) return;
      if (trainingActive) {
        // Session en cours : arrêtée (écrans de démo fermés) puis relancée avec l'arme choisie
        await training.stopSession().catch(() => undefined);
        await training.stopServer().catch(() => undefined);
      }
      const ok = await handleLaunchTraining(weapon, DEMO_STRIPS, {
        matchDurationSeconds: 180,
        allowedZones: [],
        disableSuddenDeath: false,
        demo: true,
      });
      if (!ok) return;
      const res = await training.openDemoScreens?.(DEMO_STRIPS);
      setShowDemoModal(false);
      if (res?.success) showToast(t('demo.started'), 'success');
    },
    [handleLaunchTraining, trainingActive, showToast, t]
  );

  const handleStopTraining = useCallback(async () => {
    if (!window.electronAPI?.training) return;
    try {
      await window.electronAPI.training.stopSession();
      await window.electronAPI.training.stopServer();
    } catch {
      /* ignore */
    }
    setTrainingActive(false);
    setShowTrainingPanel(false);
    setTrainingServerUrl('');
    setTrainingStrips(1);
    setTrainingWeapon('');
    // Retour à la fenêtre de paramétrage du mode (au lieu de fermer)
    setShowTrainingModal(true);
  }, []);

  return {
    showTrainingModal,
    setShowTrainingModal,
    showDemoModal,
    setShowDemoModal,
    trainingActive,
    showTrainingPanel,
    setShowTrainingPanel,
    trainingServerUrl,
    trainingStrips,
    trainingWeapon,
    trainingLaunching,
    handleLaunchTraining,
    handleStartDemo,
    handleLaunchDemo,
    handleStopTraining,
  };
}
