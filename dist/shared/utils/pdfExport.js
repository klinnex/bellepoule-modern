"use strict";
/**
 * BellePoule Modern - Optimized PDF Export Service
 * Optimized exports with improved performance and maintainability
 * Licensed under GPL-3.0
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDF_STYLES = exports.DIMENSIONS = exports.OptimizedPDFExporter = void 0;
exports.exportOptimizedPoolToPDF = exportOptimizedPoolToPDF;
exports.exportPoolToPDF = exportPoolToPDF;
exports.exportMultiplePoolsToPDF = exportMultiplePoolsToPDF;
const jspdf_1 = __importDefault(require("jspdf"));
const jspdf_autotable_1 = __importDefault(require("jspdf-autotable"));
const types_1 = require("../types");
// Constants optimisées pour les dimensions
const DIMENSIONS = {
    PISTE_FRAME: { width: 150, height: 40 },
    COLUMN_WIDTH: 70,
    ROW_HEIGHT: 8,
    MAX_COLUMNS: 4,
    PAGE_WIDTH: 297, // A4 paysage
    PAGE_HEIGHT: 210,
    PAGE_MARGIN: 20
};
exports.DIMENSIONS = DIMENSIONS;
// Styles PDF centralisés
const PDF_STYLES = {
    PISTE_TITLE: { fontSize: 14, align: 'center' },
    MATCH_NUMBER: { fontSize: 7 },
    MATCH_TEXT: { fontSize: 7, align: 'center' },
    TITLE: { fontSize: 14, align: 'center' }, // Réduit de 18 à 14
    SUBTITLE: { fontSize: 10, align: 'center' },
    TABLE_HEADER: { fontSize: 9, align: 'center' },
    TABLE_BODY: { fontSize: 8 }
};
exports.PDF_STYLES = PDF_STYLES;
class OptimizedPDFExporter {
    constructor() {
        this.currentY = DIMENSIONS.PAGE_MARGIN;
        this.startTime = performance.now();
        this.doc = new jspdf_1.default();
    }
    /**
     * Applique les styles de base pour les éléments PDF
     */
    applyPdfStyling() {
        this.doc.setLineWidth(1);
        this.doc.setDrawColor(0);
        this.doc.setTextColor(0);
    }
    /**
     * Calcule la position pour une colonne
     */
    calculateColumnPosition(index, startY) {
        return {
            x: DIMENSIONS.PAGE_MARGIN + (index * DIMENSIONS.COLUMN_WIDTH),
            y: startY
        };
    }
    /**
     * Calcule les dimensions du cadre de piste
     */
    calculatePisteFrame() {
        const frameWidth = DIMENSIONS.PISTE_FRAME.width;
        const frameX = (DIMENSIONS.PAGE_WIDTH / 2) - (frameWidth / 2);
        return {
            width: frameWidth,
            height: DIMENSIONS.PISTE_FRAME.height,
            x: frameX,
            y: this.currentY
        };
    }
    /**
     * Valide les données de la poule
     */
    validatePoolData(pool) {
        if (!pool.fencers?.length) {
            throw new Error('Pool sans tireurs - impossible de générer le PDF');
        }
        if (!pool.matches?.length) {
            throw new Error('Pool sans matchs - impossible de générer le PDF');
        }
    }
    /**
     * Calcule l'affichage d'un match
     */
    calculateMatchDisplay(match, index) {
        const scoreA = match.status === types_1.MatchStatus.FINISHED
            ? `${match.scoreA?.isVictory ? 'V' : ''}${match.scoreA?.value || 0}`
            : '-';
        const scoreB = match.status === types_1.MatchStatus.FINISHED
            ? `${match.scoreB?.isVictory ? 'V' : ''}${match.scoreB?.value || 0}`
            : '-';
        return {
            index: index + 1,
            fencerA: `${match.fencerA?.lastName || 'N/A'} ${match.fencerA?.firstName?.charAt(0) || ''}.`,
            fencerB: `${match.fencerB?.lastName || 'N/A'} ${match.fencerB?.firstName?.charAt(0) || ''}.`,
            scoreA,
            scoreB
        };
    }
    /**
     * Filtre les matchs selon leur statut
     */
    filterMatchesByStatus(matches, options) {
        return matches.filter(match => {
            if (match.status === types_1.MatchStatus.FINISHED && !options.includeFinished)
                return false;
            if (match.status !== types_1.MatchStatus.FINISHED && !options.includePending)
                return false;
            return true;
        });
    }
    /**
     * Ajoute un cadre de piste optimisé
     */
    addOptimizedPisteFrame(pool) {
        const frame = this.calculatePisteFrame();
        // Dessiner le cadre avec styles optimisés
        this.applyPdfStyling();
        this.doc.rect(frame.x, frame.y, frame.width, frame.height, 'S');
        // Ajouter le titre "PISTE X" avec style centralisé
        this.doc.setFontSize(PDF_STYLES.PISTE_TITLE.fontSize);
        this.doc.text(`PISTE ${pool.number}`, DIMENSIONS.PAGE_WIDTH / 2, frame.y + 25, PDF_STYLES.PISTE_TITLE);
        // Mettre à jour la position Y pour les matchs
        this.currentY = frame.y + frame.height + 10;
    }
    /**
     * Ajoute le tableau des résultats de la poule
     */
    addPoolResultsTable(pool) {
        // Préparer les données pour le tableau
        const tableData = pool.fencers.map(fencer => {
            const poolStats = fencer.poolStats;
            return [
                fencer.ref.toString(),
                `${fencer.lastName} ${fencer.firstName?.charAt(0)}.`,
                poolStats?.victories || 0,
                poolStats?.defeats || 0,
                poolStats?.touchesScored || 0,
                poolStats?.touchesReceived || 0,
                poolStats?.index || 0,
                poolStats?.victoryRatio ? (poolStats.victoryRatio * 100).toFixed(1) + '%' : '0%',
                poolStats?.poolRank || '-'
            ];
        });
        // En-têtes du tableau
        const headers = [
            'N°',
            'Nom',
            'V',
            'D',
            'TD',
            'TR',
            'Ind',
            'V/M',
            'Rang'
        ];
        // Vérifier s'il y a assez d'espace sur la page
        if (this.currentY > 180) {
            this.doc.addPage();
            this.currentY = DIMENSIONS.PAGE_MARGIN;
        }
        // Ajouter le titre du tableau
        this.doc.setFontSize(PDF_STYLES.SUBTITLE.fontSize);
        this.doc.text('Classement de la poule', DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.SUBTITLE);
        this.currentY += 8;
        // Créer le tableau avec autoTable
        (0, jspdf_autotable_1.default)(this.doc, {
            head: [headers],
            body: tableData,
            startY: this.currentY,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: PDF_STYLES.TABLE_BODY.fontSize,
                cellPadding: 2,
                lineWidth: 0.1,
                lineColor: [0, 0, 0],
                textColor: [0, 0, 0]
            },
            headStyles: {
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                fontSize: PDF_STYLES.TABLE_HEADER.fontSize,
                cellPadding: 2,
                lineWidth: 0.1,
                lineColor: [0, 0, 0]
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250]
            },
            columnStyles: {
                0: { cellWidth: 10, halign: 'center' }, // N°
                1: { cellWidth: 40, halign: 'left' }, // Nom
                2: { cellWidth: 8, halign: 'center' }, // V
                3: { cellWidth: 8, halign: 'center' }, // D
                4: { cellWidth: 8, halign: 'center' }, // TD
                5: { cellWidth: 8, halign: 'center' }, // TR
                6: { cellWidth: 10, halign: 'center' }, // Ind
                7: { cellWidth: 15, halign: 'center' }, // V/M
                8: { cellWidth: 12, halign: 'center' } // Rang
            },
            margin: { left: DIMENSIONS.PAGE_MARGIN, right: DIMENSIONS.PAGE_MARGIN },
            tableWidth: 180
        });
        // Mettre à jour la position Y
        const finalY = this.doc.lastAutoTable?.finalY || this.currentY;
        this.currentY = finalY + 10;
    }
    /**
     * Affiche les matchs en colonnes de manière optimisée
     */
    addOptimizedMatchesInColumns(matches, options) {
        const filteredMatches = this.filterMatchesByStatus(matches, options);
        if (filteredMatches.length === 0) {
            this.doc.setFontSize(8);
            this.doc.text('Aucun match à afficher', DIMENSIONS.PAGE_MARGIN, this.currentY);
            return;
        }
        // Organisation optimisée en 4 colonnes maximum
        const matchesToDisplay = filteredMatches.slice(0, DIMENSIONS.MAX_COLUMNS);
        const startY = this.currentY;
        // Affichage optimisé avec les nouvelles constantes
        matchesToDisplay.forEach((match, index) => {
            const matchDisplay = this.calculateMatchDisplay(match, index);
            const position = this.calculateColumnPosition(index, startY);
            // Appliquer les styles pour les matchs
            this.doc.setFontSize(PDF_STYLES.MATCH_NUMBER.fontSize);
            this.doc.text(`${matchDisplay.index}.`, position.x, position.y + 2);
            this.doc.text(matchDisplay.fencerA.substring(0, 18), position.x + 8, position.y + 2);
            this.doc.text(matchDisplay.scoreA, position.x + 35, position.y + 2, PDF_STYLES.MATCH_TEXT);
            this.doc.text(matchDisplay.scoreB, position.x + 45, position.y + 2, PDF_STYLES.MATCH_TEXT);
            this.doc.text(matchDisplay.fencerB.substring(0, 12), position.x + 55, position.y + 2);
        });
        this.currentY = startY + DIMENSIONS.ROW_HEIGHT + 15;
    }
    /**
     * Gère les erreurs d'export PDF
     */
    handlePdfError(error, filename) {
        console.error('Erreur détaillée lors de l\'export PDF:', error);
        try {
            // Fallback 1: Ouvrir dans un nouvel onglet
            const pdfBlob = this.doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            window.open(pdfUrl, '_blank');
        }
        catch (fallbackError) {
            console.error('Erreur du fallback:', fallbackError);
            // Fallback 2: Download forcé
            const pdfData = this.doc.output('datauristring');
            const link = document.createElement('a');
            link.href = pdfData;
            link.download = filename;
            link.click();
        }
    }
    /**
     * Affiche les métriques de performance
     */
    logPerformanceMetrics() {
        const duration = performance.now() - this.startTime;
        console.log(`Export PDF terminé en ${duration.toFixed(2)}ms`);
    }
    /**
     * Exporte une poule complète en PDF avec optimisations
     */
    async exportPool(pool, options = {}) {
        try {
            // Validation des données d'entrée
            this.validatePoolData(pool);
            const { title = `Poule ${pool.number}`, includeFinishedMatches = true, includePendingMatches = true, includePoolStats = true } = options;
            // Initialisation optimisée
            this.doc = new jspdf_1.default({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });
            this.currentY = DIMENSIONS.PAGE_MARGIN;
            // Application des styles de base
            this.applyPdfStyling();
            // Titre optimisé avec constantes
            this.doc.setFontSize(PDF_STYLES.TITLE.fontSize);
            this.doc.text(title, DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.TITLE);
            this.currentY += 12;
            // Informations de la poule (sur une ligne)
            this.doc.setFontSize(10);
            const completedMatches = pool.matches.filter(m => m.status === types_1.MatchStatus.FINISHED).length;
            this.doc.text(`Tireurs: ${pool.fencers.length} | Matchs: ${pool.matches.length} | Terminés: ${completedMatches}/${pool.matches.length}`, DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.SUBTITLE);
            this.currentY += 15;
            // Cadre avec nom de la piste optimisé
            this.addOptimizedPisteFrame(pool);
            // Tableau des résultats de poule
            if (includePoolStats && pool.fencers.length > 0) {
                this.addPoolResultsTable(pool);
            }
            // Liste des matchs en colonnes optimisée
            this.doc.setFontSize(PDF_STYLES.SUBTITLE.fontSize);
            this.doc.text('Matchs', DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.SUBTITLE);
            this.currentY += 8;
            this.addOptimizedMatchesInColumns(pool.matches, {
                includeFinished: includeFinishedMatches,
                includePending: includePendingMatches
            });
            // Télécharger le PDF avec gestion d'erreurs optimisée
            const filename = `poule-${pool.number}-${new Date().toISOString().split('T')[0]}.pdf`;
            try {
                this.doc.save(filename);
                this.logPerformanceMetrics();
            }
            catch (saveError) {
                this.handlePdfError(saveError, filename);
            }
        }
        catch (error) {
            console.error('Erreur détaillée lors de l\'export PDF:', error);
            throw new Error(`Échec de l'export PDF: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }
    }
    /**
     * Exporte plusieurs poules dans un seul PDF
     */
    async exportMultiplePools(pools, title = 'Export des Poules') {
        try {
            if (pools.length === 0) {
                throw new Error('Aucune poule à exporter');
            }
            // Initialisation optimisée
            this.doc = new jspdf_1.default({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });
            this.currentY = DIMENSIONS.PAGE_MARGIN;
            // Application des styles de base
            this.applyPdfStyling();
            // Titre principal
            this.doc.setFontSize(PDF_STYLES.TITLE.fontSize);
            this.doc.text(title, DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.TITLE);
            this.currentY += 15;
            // Exporter chaque poule
            for (let i = 0; i < pools.length; i++) {
                const pool = pools[i];
                // Ajouter un saut de page entre les poules (sauf pour la première)
                if (i > 0) {
                    this.doc.addPage();
                    this.currentY = DIMENSIONS.PAGE_MARGIN;
                }
                // Titre de la poule
                this.doc.setFontSize(PDF_STYLES.SUBTITLE.fontSize);
                this.doc.text(`Poule ${pool.number}`, DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.SUBTITLE);
                this.currentY += 10;
                // Informations de la poule
                this.doc.setFontSize(10);
                const completedMatches = pool.matches.filter(m => m.status === types_1.MatchStatus.FINISHED).length;
                this.doc.text(`Tireurs: ${pool.fencers.length} | Matchs: ${pool.matches.length} | Terminés: ${completedMatches}/${pool.matches.length}`, DIMENSIONS.PAGE_WIDTH / 2, this.currentY, PDF_STYLES.SUBTITLE);
                this.currentY += 10;
                // Cadre avec nom de la piste optimisé
                this.addOptimizedPisteFrame(pool);
                // Matchs en colonnes optimisés
                this.currentY += 5;
                this.addOptimizedMatchesInColumns(pool.matches, {
                    includeFinished: true,
                    includePending: true
                });
            }
            // Télécharger le PDF
            const filename = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
            try {
                this.doc.save(filename);
                this.logPerformanceMetrics();
            }
            catch (saveError) {
                this.handlePdfError(saveError, filename);
            }
        }
        catch (error) {
            console.error('Erreur lors de l\'export de plusieurs poules:', error);
            throw new Error(`Échec de l'export multiple: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
        }
    }
}
exports.OptimizedPDFExporter = OptimizedPDFExporter;
/**
 * Fonction utilitaire pour exporter une poule avec optimisations
 */
async function exportOptimizedPoolToPDF(pool, options) {
    const exporter = new OptimizedPDFExporter();
    await exporter.exportPool(pool, options);
}
/**
 * Fonction utilitaire pour exporter une poule rapidement (version legacy)
 */
async function exportPoolToPDF(pool, options) {
    const exporter = new OptimizedPDFExporter();
    await exporter.exportPool(pool, options);
}
/**
 * Fonction utilitaire pour exporter plusieurs poules
 */
async function exportMultiplePoolsToPDF(pools, title) {
    const exporter = new OptimizedPDFExporter();
    await exporter.exportMultiplePools(pools, title);
}
//# sourceMappingURL=pdfExport.js.map