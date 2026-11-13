/**
 * BellePoule Modern - Types et colonnes de FencerList (extrait, #1599)
 * Licensed under GPL-3.0
 */
import { Fencer, FencerStatus } from '../../shared/types';

export type SortableCol =
  | 'ref'
  | 'lastName'
  | 'firstName'
  | 'birthDate'
  | 'club'
  | 'nationality'
  | 'region'
  | 'department'
  | 'handedness'
  | 'ranking'
  | 'status';

export const COLUMNS = [
  { id: 'ref' as SortableCol, labelKey: 'fencerList.col_ref', width: '50px' },
  { id: 'lastName' as SortableCol, labelKey: 'fencerList.col_last_name' },
  { id: 'firstName' as SortableCol, labelKey: 'fencerList.col_first_name' },
  { id: 'birthDate' as SortableCol, labelKey: 'fencerList.col_birth', width: '70px' },
  { id: 'club' as SortableCol, labelKey: 'fencerList.col_club' },
  { id: 'nationality' as SortableCol, labelKey: 'fencerList.col_nationality', width: '110px' },
  { id: 'region' as SortableCol, labelKey: 'fencerList.col_region', width: '110px' },
  { id: 'department' as SortableCol, labelKey: 'fencerList.col_department', width: '140px' },
  { id: 'handedness' as SortableCol, labelKey: 'fencerList.col_handedness', width: '100px' },
  { id: 'ranking' as SortableCol, labelKey: 'fencerList.col_ranking', width: '110px' },
  { id: 'status' as SortableCol, labelKey: 'fencerList.col_status', width: '90px' },
];

export interface FencerListProps {
  fencers: Fencer[];
  competitionId?: string;
  onCheckIn: (id: string) => void;
  onAddFencer: () => void;
  onEditFencer?: (id: string, updates: Partial<Fencer>) => void;
  onDeleteFencer?: (id: string) => void;
  onDeleteAllFencers?: () => void;
  onCheckInAll?: () => void;
  onUncheckAll?: () => void;
  onSetFencerStatus?: (id: string, status: FencerStatus) => void;
  onImport?: (type: 'xml' | 'fff' | 'ranking') => void;
  onImportFFEConnect?: () => void;
  /** Import spécifique remplaçant le menu d'import (ex : équipes du tournoi des rapières) */
  customImport?: { label: string; onClick: () => void };
  /** Bouton « modèle » à côté de customImport (gabarit du fichier attendu) */
  customImportTemplate?: { label: string; onClick: () => void };
  onFencersImported?: () => void;
  /** URL de la page d'inscription distante (ex: http://192.168.x.x:8066/register) */
  registerUrl?: string;
  /** Notifie le parent des tireurs triés/filtrés et des colonnes visibles actuels */
  onAppelStateChange?: (fencers: Fencer[], visibleColumns: string[]) => void;
  /** Consultation seule (appel d'un tour de poules terminé, #1051) */
  readOnly?: boolean;
  /** Libellés de colonnes remplacés (tournoi des rapières : Équipe, Tireurs, Niveau) */
  columnLabels?: Partial<Record<SortableCol, string>>;
  /** Colonnes masquées au départ */
  hiddenColumns?: SortableCol[];
  /** Valeurs de cellule remplacées (tri + affichage) : rapières → niveau, catégorie d'équipe (#1441) */
  cellValues?: Partial<Record<SortableCol, (fencer: Fencer) => string>>;
  /** Édition gérée par le parent (fenêtre spécifique) au lieu de la fenêtre tireur */
  onEditRequest?: (fencer: Fencer) => void;
}
