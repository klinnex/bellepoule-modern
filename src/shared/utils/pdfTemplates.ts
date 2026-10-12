/**
 * BellePoule Modern - Simple PDF Template System
 * Gestion des modèles PDF personnalisables pour les compétitions
 * Licensed under GPL-3.0
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Pool, Match, MatchStatus, Fencer } from '../types';

// Constantes locales
const DIMENSIONS = {
  PAGE_WIDTH: 210,
  PAGE_HEIGHT: 297,
  PAGE_MARGIN: 10,
} as const;

// Types simplifiés pour les templates PDF
export interface SimplePdfTemplate {
  id: string;
  name: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
    borders: string;
  };
  fonts: {
    title: { size: number; family: string };
    header: { size: number; family: string };
    body: { size: number; family: string };
  };
  branding: {
    organizationName: string;
    footerText?: string;
  };
}

// Templates prédéfinis
export const TEMPLATES: Record<string, SimplePdfTemplate> = {
  classic: {
    id: 'classic',
    name: 'Classique',
    description: 'Template traditionnel avec design sobre',
    colors: {
      primary: '#000000',
      secondary: '#666666',
      accent: '#0066cc',
      text: '#000000',
      background: '#ffffff',
      borders: '#000000',
    },
    fonts: {
      title: { size: 18, family: 'helvetica' },
      header: { size: 14, family: 'helvetica' },
      body: { size: 10, family: 'helvetica' },
    },
    branding: {
      organizationName: 'BellePoule Modern',
      footerText: 'Généré avec BellePoule Modern',
    },
  },

  modern: {
    id: 'modern',
    name: 'Moderne',
    description: 'Design contemporain avec couleurs vives',
    colors: {
      primary: '#2c3e50',
      secondary: '#34495e',
      accent: '#3498db',
      text: '#2c3e50',
      background: '#f8f9fa',
      borders: '#dee2e6',
    },
    fonts: {
      title: { size: 20, family: 'helvetica' },
      header: { size: 14, family: 'helvetica' },
      body: { size: 11, family: 'helvetica' },
    },
    branding: {
      organizationName: 'BellePoule Modern',
      footerText: 'Généré avec BellePoule Modern',
    },
  },

  tournament: {
    id: 'tournament',
    name: 'Tournoi',
    description: 'Template professionnel pour compétitions',
    colors: {
      primary: '#1a1a1a',
      secondary: '#4a4a4a',
      accent: '#ff6b35',
      text: '#1a1a1a',
      background: '#ffffff',
      borders: '#cccccc',
    },
    fonts: {
      title: { size: 22, family: 'helvetica' },
      header: { size: 16, family: 'helvetica' },
      body: { size: 11, family: 'helvetica' },
    },
    branding: {
      organizationName: "Compétition d'Escrime",
      footerText: 'Résultats Officiels',
    },
  },
};

/**
 * Gestionnaire simple de templates PDF
 */
export class SimplePdfTemplateManager {
  private currentTemplate: SimplePdfTemplate;

  constructor(templateId: string = 'classic') {
    this.currentTemplate = TEMPLATES[templateId] || TEMPLATES.classic;
  }

  setTemplate(templateId: string): void {
    const template = TEMPLATES[templateId];
    if (template) {
      this.currentTemplate = template;
    }
  }

  getTemplate(): SimplePdfTemplate {
    return this.currentTemplate;
  }

  /**
   * Applique le style du template au document PDF
   */
  applyTemplateStyles(doc: jsPDF): void {
    const { colors, fonts } = this.currentTemplate;

    // Couleurs par défaut
    doc.setTextColor(colors.text);
    doc.setDrawColor(colors.borders);
    doc.setFillColor(colors.background);
  }

  /**
   * Génère un header avec le template
   */
  generateHeader(doc: jsPDF, pool: Pool, title?: string): number {
    const { colors, fonts, branding } = this.currentTemplate;
    let currentY = DIMENSIONS.PAGE_MARGIN;

    // Titre principal
    doc.setFontSize(fonts.title.size);
    doc.setFont(fonts.title.family, 'bold');
    doc.setTextColor(colors.primary);
    doc.text(title || `Poule ${pool.number}`, DIMENSIONS.PAGE_WIDTH / 2, currentY, {
      align: 'center',
    });
    currentY += fonts.title.size + 5;

    // Informations de la poule
    doc.setFontSize(fonts.body.size);
    doc.setFont(fonts.body.family, 'normal');
    doc.setTextColor(colors.secondary);

    const matches = pool.matches ?? [];
    const completedMatches = matches.filter(m => m.status === MatchStatus.FINISHED).length;
    const info = `Tireurs: ${pool.fencers?.length ?? 0} | Matchs: ${matches.length} | Terminés: ${completedMatches}/${matches.length}`;
    doc.text(info, DIMENSIONS.PAGE_WIDTH / 2, currentY, { align: 'center' });
    currentY += 10;

    // Nom de l'organisation
    if (branding.organizationName) {
      doc.setFontSize(fonts.header.size);
      doc.setFont(fonts.header.family, 'bold');
      doc.setTextColor(colors.accent);
      doc.text(branding.organizationName, DIMENSIONS.PAGE_WIDTH / 2, currentY, { align: 'center' });
      currentY += fonts.header.size + 8;
    }

    return currentY;
  }

  /**
   * Génère un footer avec le template
   */
  generateFooter(doc: jsPDF): void {
    const { colors, fonts, branding } = this.currentTemplate;

    if (branding.footerText) {
      const pageHeight = doc.internal.pageSize.height;

      doc.setFontSize(fonts.body.size - 2);
      doc.setFont(fonts.body.family, 'italic');
      doc.setTextColor(colors.secondary);
      doc.text(branding.footerText, DIMENSIONS.PAGE_WIDTH / 2, pageHeight - 10, {
        align: 'center',
      });
    }
  }

  /**
   * Applique le style pour les tableaux
   */
  getTableStyles(): any {
    const { colors, fonts } = this.currentTemplate;

    return {
      theme: 'plain' as const,
      styles: {
        fontSize: fonts.body.size,
        cellPadding: 3,
        lineColor: colors.borders,
        textColor: colors.text,
      },
      headStyles: {
        fillColor: colors.primary,
        textColor: '#ffffff',
        fontStyle: 'bold',
        fontSize: fonts.header.size,
      },
      alternateRowStyles: {
        fillColor: colors.background === '#ffffff' ? '#f5f5f5' : colors.background,
      },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center' }, // Piste
        1: { cellWidth: 25, halign: 'center' }, // Heure
        2: { cellWidth: 35, halign: 'center' }, // Score V
        3: { cellWidth: 35, halign: 'center' }, // Tireur V
        4: { cellWidth: 20, halign: 'center' }, // VS
        5: { cellWidth: 35, halign: 'center' }, // Score P
        6: { cellWidth: 35, halign: 'center' }, // Tireur P
        7: { cellWidth: 30, halign: 'center' }, // Status
      },
    };
  }

  /**
   * Applique le style pour le cadre de piste
   */
  generatePisteFrame(doc: jsPDF, pool: Pool, currentY: number): void {
    const { colors, fonts } = this.currentTemplate;

    // Configuration du cadre
    const frameX = 30;
    const frameY = currentY;
    const frameWidth = DIMENSIONS.PAGE_WIDTH - 60;
    const frameHeight = 25;

    // Fond avec couleur du template
    doc.setFillColor(colors.background);
    doc.roundedRect(frameX, frameY, frameWidth, frameHeight, 3, 3, 'F');

    // Bordure avec couleur primaire
    doc.setDrawColor(colors.primary);
    doc.setLineWidth(0.5);
    doc.roundedRect(frameX, frameY, frameWidth, frameHeight, 3, 3, 'S');

    // Texte "PISTE N°"
    doc.setFontSize(fonts.header.size);
    doc.setFont(fonts.header.family, 'bold');
    doc.setTextColor(colors.primary);
    doc.text('PISTE N°', frameX + 10, frameY + 17);

    // Numéro de la piste
    doc.setFontSize(fonts.title.size);
    doc.setFont(fonts.title.family, 'bold');
    doc.setTextColor(colors.accent);
    doc.text(pool.strip?.toString() || '?', frameX + 55, frameY + 17);

    // Heure de début
    doc.setFontSize(fonts.body.size);
    doc.setFont(fonts.body.family, 'normal');
    doc.setTextColor(colors.text);
    const startTime = pool.startTime || new Date();
    const timeStr = startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Début: ${timeStr}`, frameX + 100, frameY + 17);
  }

  /**
   * Exporte une poule avec le template actuel
   */
  async exportPoolWithTemplate(
    pool: Pool,
    options: { title?: string; filename?: string } = {}
  ): Promise<void> {
    try {
      // Création du document
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      // Appliquer le style du template
      this.applyTemplateStyles(doc);

      // Générer le header
      let currentY = this.generateHeader(doc, pool, options.title);

      // Ajouter le cadre de piste
      this.generatePisteFrame(doc, pool, currentY);
      currentY += 35;

      // Préparer les données pour le tableau
      const tableData = this.prepareMatchTableData(pool.matches);

      // Créer le tableau avec les styles du template
      autoTable(doc, {
        head: [['Piste', 'Heure', 'Score V', 'Tireur V', '', 'Score P', 'Tireur P', 'Status']],
        body: tableData,
        startY: currentY,
        ...this.getTableStyles(),
      });

      // Générer le footer
      this.generateFooter(doc);

      // Télécharger le fichier
      const filename =
        options.filename ||
        `poule-${pool.number}-${this.currentTemplate.id}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error("Erreur lors de l'export avec template:", error);
      throw new Error(
        `Échec de l'export: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * Prépare les données pour le tableau de matchs
   */
  private prepareMatchTableData(matches: Match[]): string[][] {
    return matches.map(match => {
      const time =
        match.startTime?.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) ||
        '--:--';

      let scoreV = '';
      let scoreP = '';
      let status = '';

      if (match.status === MatchStatus.FINISHED && match.scoreA && match.scoreB) {
        scoreV = match.scoreA.value?.toString() || '';
        scoreP = match.scoreB.value?.toString() || '';
        status = 'Terminé';
      } else if (match.status === MatchStatus.IN_PROGRESS) {
        status = 'En cours';
      } else {
        status = 'En attente';
      }

      return [
        match.strip?.toString() || '--',
        time,
        scoreV,
        match.fencerA?.lastName || '--',
        'vs',
        scoreP,
        match.fencerB?.lastName || '--',
        status,
      ];
    });
  }
}

/**
 * Fonction utilitaire pour exporter avec template
 */
export async function exportPoolWithTemplate(
  pool: Pool,
  templateId: string = 'classic',
  options?: { title?: string; filename?: string }
): Promise<void> {
  const manager = new SimplePdfTemplateManager(templateId);
  await manager.exportPoolWithTemplate(pool, options);
}

/**
 * Génère un certificat de podium (format paysage A4)
 */
export function generatePodiumCertificate(
  competition: {
    title: string;
    date: string | Date;
    location?: string;
    weapon: string;
    category: string;
    organizer?: string;
  },
  recipient: {
    firstName: string;
    lastName: string;
    club?: string;
    rank: 1 | 2 | 3;
  },
  logoDataUrl?: string
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;
  const margin = 18;

  const rankColors: Record<number, string> = { 1: '#d97706', 2: '#6b7280', 3: '#b45309' };
  const rankLabels: Record<number, string> = {
    1: '1ère place — Champion',
    2: '2ème place',
    3: '3ème place',
  };
  const rankColor = rankColors[recipient.rank];

  // Fond dégradé subtil (bordure décorative)
  doc.setDrawColor(rankColor);
  doc.setLineWidth(3);
  doc.rect(margin / 2, margin / 2, W - margin, H - margin);
  doc.setLineWidth(0.5);
  doc.rect(margin / 2 + 3, margin / 2 + 3, W - margin - 6, H - margin - 6);

  let curY = margin + 6;

  // Logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', margin, curY, 28, 28);
    } catch {
      /* ignore logo error */
    }
  }

  // Titre "CERTIFICAT DE RÉSULTAT"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(31, 41, 55);
  doc.text('CERTIFICAT DE RÉSULTAT', W / 2, curY + 12, { align: 'center' });

  curY += 28;

  // Séparateur doré
  doc.setDrawColor(rankColor);
  doc.setLineWidth(1.5);
  doc.line(margin + 20, curY, W - margin - 20, curY);
  curY += 12;

  // "Décerné à"
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(107, 114, 128);
  doc.text('Décerné à', W / 2, curY, { align: 'center' });
  curY += 10;

  // Nom du récipiendaire
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(17, 24, 39);
  doc.text(
    `${recipient.firstName.toUpperCase()} ${recipient.lastName.toUpperCase()}`,
    W / 2,
    curY,
    { align: 'center' }
  );
  curY += 8;

  if (recipient.club) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(107, 114, 128);
    doc.text(recipient.club, W / 2, curY, { align: 'center' });
    curY += 8;
  }

  curY += 4;

  // Rang stylisé
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const [r, g, b] = hexToRgb(rankColor);
  doc.setTextColor(r, g, b);
  doc.text(rankLabels[recipient.rank], W / 2, curY, { align: 'center' });
  curY += 12;

  // Séparateur
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin + 30, curY, W - margin - 30, curY);
  curY += 10;

  // Infos compétition
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);
  const dateStr =
    competition.date instanceof Date
      ? competition.date.toLocaleDateString('fr-FR')
      : competition.date;
  doc.text(`Compétition : ${competition.title}`, W / 2, curY, { align: 'center' });
  curY += 7;
  doc.text(`${dateStr}${competition.location ? ' — ' + competition.location : ''}`, W / 2, curY, {
    align: 'center',
  });
  curY += 7;
  doc.text(`Arme : ${competition.weapon} | Catégorie : ${competition.category}`, W / 2, curY, {
    align: 'center',
  });

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);
  const footer = `${competition.organizer ? competition.organizer + ' — ' : ''}Généré avec BellePoule Modern le ${new Date().toLocaleDateString('fr-FR')}`;
  doc.text(footer, W / 2, H - margin / 2 - 2, { align: 'center' });

  return doc;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

/**
 * Fonction utilitaire pour obtenir la liste des templates disponibles
 */
export function getAvailableTemplates(): SimplePdfTemplate[] {
  return Object.values(TEMPLATES);
}
