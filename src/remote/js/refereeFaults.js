/**
 * BellePoule Modern - Arbitre : motifs de faute et constantes de cartons, extraits de referee.html (#1401)
 * Script classique (constantes globales pour referee.html). Servi en /js/refereeFaults.js (CSP 'self').
 * Licensed under GPL-3.0
 */
const FAULT_REASONS = [
  {
    group: 1,
    labelKey: 'referee.fault_group_laser_1',
    faults: [
      { key: 'referee.fault_laser_1_01', fr: "Abandon de l'aire de combat sans autorisation" },
      { key: 'referee.fault_laser_1_02', fr: 'Contre-attaque' },
      { key: 'referee.fault_laser_1_03', fr: 'Corps à corps pour éviter une touche' },
      { key: 'referee.fault_laser_1_04', fr: 'Couverture ou substitution de cible' },
      { key: 'referee.fault_laser_1_05', fr: 'Touche lourde' },
      { key: 'referee.fault_laser_1_06', fr: 'Interruption abusive du combat' },
      { key: 'referee.fault_laser_1_07', fr: 'Matériel non conforme' },
      { key: 'referee.fault_laser_1_08', fr: "Non-présentation sur l'aire de combat" },
      { key: 'referee.fault_laser_1_09', fr: 'Réclamation injustifiée' },
      { key: 'referee.fault_laser_1_10', fr: 'Bousculade / jeu désordonné / enlèvement du masque avant « Cessez ! »' },
      { key: 'referee.fault_laser_1_11', fr: 'Commencer avant le « Combattez ! »' },
      { key: 'referee.fault_laser_1_12', fr: 'Poursuivre après le « Cessez ! »' },
    ],
  },
  {
    group: 2,
    labelKey: 'referee.fault_group_laser_2',
    faults: [
      { key: 'referee.fault_laser_2_01', fr: 'Acte violent, vindicatif ou dangereux' },
      { key: 'referee.fault_laser_2_02', fr: "Refus d'obéissance" },
      { key: 'referee.fault_laser_2_03', fr: "Demande d'arrêt pour traumatisme non reconnu" },
      { key: 'referee.fault_laser_2_04', fr: "Touche d'estoc" },
      { key: 'referee.fault_laser_2_05', fr: 'Touche portée très brutalement' },
      { key: 'referee.fault_laser_2_06', fr: 'Touche pendant / après une chute ou déplacement non maîtrisé' },
      { key: 'referee.fault_laser_2_07', fr: "Sortie volontaire de l'arène pour éviter une touche" },
      { key: 'referee.fault_laser_2_08', fr: 'Utilisation du bras ou de la main non armée' },
      { key: 'referee.fault_laser_2_09', fr: 'Absence de marque de contrôle sur le matériel' },
    ],
  },
  {
    group: 3,
    labelKey: 'referee.fault_group_laser_3',
    faults: [
      { key: 'referee.fault_laser_3_01', fr: 'Combat non loyal' },
      { key: 'referee.fault_laser_3_02', fr: "Combattant troublant l'ordre sur l'arène" },
      { key: 'referee.fault_laser_3_03', fr: "Toute personne troublant l'ordre hors de l'arène" },
      { key: 'referee.fault_laser_3_04', fr: 'Comportement antisportif' },
    ],
  },
];

// Olympique (épée, fleuret, sabre) : pas de carton blanc (#1026). key traduite, fr enregistré (#1213)
const FAULT_REASONS_OLYMPIC = [
  {
    group: 2,
    labelKey: 'referee.fault_group_olympic_2',
    faults: [
      { key: 'referee.fault_olympic_2_01', fr: 'Abandon de la piste sans autorisation' },
      { key: 'referee.fault_olympic_2_02', fr: 'Corps à corps pour éviter une touche' },
      { key: 'referee.fault_olympic_2_03', fr: 'Franchir la limite latérale pour éviter une touche' },
      { key: 'referee.fault_olympic_2_04', fr: 'Chuter volontairement pour éviter une touche' },
      { key: 'referee.fault_olympic_2_05', fr: 'Couvrir la surface valable pour éviter une touche' },
      { key: 'referee.fault_olympic_2_06', fr: 'Toucher ou saisir le matériel électrique' },
      { key: 'referee.fault_olympic_2_07', fr: 'Tenue ou matériel non conforme' },
      { key: 'referee.fault_olympic_2_08', fr: 'Absence de matériel réglementaire ou de rechange' },
      { key: 'referee.fault_olympic_2_09', fr: 'Retirer son masque avant « Halte »' },
      { key: 'referee.fault_olympic_2_10', fr: "Bousculer l'adversaire" },
      { key: 'referee.fault_olympic_2_11', fr: 'Porter des coups avec violence' },
      { key: 'referee.fault_olympic_2_12', fr: "Tourner le dos à l'adversaire" },
      { key: 'referee.fault_olympic_2_13', fr: "Refuser d'obéir à l'arbitre" },
    ],
  },
  {
    group: 3,
    labelKey: 'referee.fault_group_olympic_3',
    faults: [
      { key: 'referee.fault_olympic_3_01', fr: 'Utilisation du bras ou main non armé pour une action offensive ou défensive' },
      { key: 'referee.fault_olympic_3_02', fr: "Lâcher intentionnellement l'arme pendant la phrase d'armes" },
      { key: 'referee.fault_olympic_3_03', fr: "Porter volontairement une touche ailleurs que sur l'adversaire" },
      { key: 'referee.fault_olympic_3_04', fr: 'Coup porté avec la coquille / pommeau' },
      { key: 'referee.fault_olympic_3_05', fr: 'Action dangereuse / violente' },
      { key: 'referee.fault_olympic_3_06', fr: 'Action vindicative' },
      { key: 'referee.fault_olympic_3_07', fr: "Tireur troublant l'ordre sur la piste" },
      { key: 'referee.fault_olympic_3_08', fr: 'Combat déloyal' },
      { key: 'referee.fault_olympic_3_09', fr: 'Comportement antisportif' },
    ],
  },
];

const PASSIVITY_CARDS = ['p-red', 'p-black'];
const isStandardCard = c => !PASSIVITY_CARDS.includes(c);
// Array.prototype.findLastIndex absent des tablettes anciennes
const lastIndexWhere = (arr, pred) => {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FAULT_REASONS,
    FAULT_REASONS_OLYMPIC,
    PASSIVITY_CARDS,
    isStandardCard,
    lastIndexWhere,
  };
}
