/**
 * BellePoule Modern - Modales / menus de la vue compétition, gérés par useModalFlags (#1241)
 * Licensed under GPL-3.0
 */
import type { ModalFlags } from '../../hooks/useModalFlags';

export const MODAL_FLAGS = [
  'showAddFencerModal',
  'showPlanningAssistant',
  'showExportCenter',
  'showPropertiesModal',
  'showThirdPlaceDialog',
  'showFencerComparison',
  'showAnalytics',
  'showSeasonRanking',
  'showFFEConnect',
  'showFFEExport',
  'showQRCode',
  'showKiosk',
  'showPresentation',
  'showKioskDisplay',
  'showConfetti',
  'showActionsMenu',
] as const;

/** Drapeaux + setters de MODAL_FLAGS (retour de useModalFlags) */
export type CompetitionModalFlags = ModalFlags<(typeof MODAL_FLAGS)[number]>;
